"""Engagement use-cases: creation with task generation, recurring generation, listing.

Creating an engagement and generating its tasks is ONE transaction: either the engagement and all of
its tasks exist, or nothing does.

Recurring duplicates are prevented by the partial unique index
    uq_engagements_recurring_period (client_id, service_type_id, period_start) WHERE period_start IS NOT NULL
and the insert uses ON CONFLICT DO NOTHING, so concurrent or repeated generation converges on a
single row instead of erroring or duplicating.
"""

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, joinedload

from app.config import business_today
from app.db import transaction
from app.domain import periods
from app.errors import BusinessValidationError, Conflict, Duplicate, NotFound, PermissionDenied
from app.models import Client, Engagement, Role, ServiceType, Task, TaskEvent, TaskStatus, TaskTemplate, User
from app.pagination import decode_cursor, page
from app.schemas import (
    ClientRef, EngagementCreate, EngagementDetail, EngagementSummary, GenerateDueOut, ServiceTypeRef, UserRef,
)
from app.services import tasks as task_service
from app.services.access import can_manage_engagement, engagement_scope, task_scope

log = logging.getLogger("app.engagements")

ENGAGEMENT_LOAD = (
    joinedload(Engagement.client), joinedload(Engagement.service_type), joinedload(Engagement.manager),
)


@dataclass
class Staffing:
    """Who gets the generated tasks. Per-template overrides carry staffing forward between periods."""

    default_assignee_id: int | None = None
    by_template: dict[int, tuple[int | None, int | None]] = field(default_factory=dict)  # template -> (assignee, reviewer)

    def for_template(self, template_id: int) -> tuple[int | None, int | None]:
        return self.by_template.get(template_id, (self.default_assignee_id, None))


# ---------------------------------------------------------------- building blocks

def _templates(db: Session, service_type_id: int) -> list[TaskTemplate]:
    return list(db.scalars(
        select(TaskTemplate).where(TaskTemplate.service_type_id == service_type_id).order_by(TaskTemplate.sequence)
    ))


def _build_task(engagement_id: int, template: TaskTemplate, base_date: date, staffing: Staffing) -> Task:
    assignee_id, reviewer_id = staffing.for_template(template.id)
    return Task(
        engagement_id=engagement_id,
        template_id=template.id,
        sequence=template.sequence,
        title=template.title,
        description=template.description,
        assignee_id=assignee_id,
        reviewer_id=reviewer_id if reviewer_id != assignee_id else None,
        status=TaskStatus.NOT_STARTED,
        due_date=base_date + timedelta(days=template.default_due_offset_days),
    )


def _instantiate_tasks(db: Session, engagement_id: int, templates: list[TaskTemplate], base_date: date,
                       staffing: Staffing, actor: User | None) -> list[Task]:
    tasks = [_build_task(engagement_id, t, base_date, staffing) for t in templates]
    db.add_all(tasks)
    db.flush()
    db.add_all(TaskEvent(task_id=t.id, actor_id=actor.id if actor else None, action="CREATED",
                         to_status=t.status.value, details={"assignee_id": t.assignee_id}) for t in tasks)
    db.flush()
    return tasks


def _insert_engagement(db: Session, **values) -> int | None:
    """INSERT ... ON CONFLICT DO NOTHING RETURNING id. Returns None if the recurring period already exists."""
    stmt = (
        pg_insert(Engagement)
        .values(**values)
        .on_conflict_do_nothing(
            index_elements=["client_id", "service_type_id", "period_start"],
            index_where=Engagement.period_start.isnot(None),
        )
        .returning(Engagement.id)
    )
    return db.scalar(stmt)


def _base_date(service_type: ServiceType, period_start: date | None, start_date: date | None) -> date:
    """Recurring: offsets count from the end of the period (GSTR-1 is due on the 11th of the NEXT month).
    One-time: offsets count from the engagement's start date."""
    if service_type.is_recurring:
        return periods.period_end(period_start, service_type.recurrence)
    return start_date or business_today()


def _create_recurring(db: Session, *, actor: User | None, client_id: int, service_type: ServiceType,
                      period_start: date, manager_id: int, staffing: Staffing) -> tuple[int, bool]:
    """Idempotent: returns (engagement_id, created). Safe to call any number of times, concurrently."""
    templates = _templates(db, service_type.id)
    if not templates:
        raise BusinessValidationError(f"Service type '{service_type.name}' has no task templates.",
                                      code="NO_TEMPLATES")
    with transaction(db):
        new_id = _insert_engagement(
            db, client_id=client_id, service_type_id=service_type.id, period_start=period_start,
            period_label=periods.period_label(period_start, service_type.recurrence), manager_id=manager_id,
            created_by=actor.id if actor else None,
        )
        if new_id is None:
            existing = db.scalar(select(Engagement.id).where(
                Engagement.client_id == client_id, Engagement.service_type_id == service_type.id,
                Engagement.period_start == period_start))
            return existing, False
        _instantiate_tasks(db, new_id, templates, _base_date(service_type, period_start, None), staffing, actor)
    log.info("engagement_generated", extra={"engagement_id": new_id, "period_start": str(period_start)})
    return new_id, True


def _get(db: Session, model, id_: int, what: str):
    obj = db.get(model, id_)
    if obj is None:
        raise BusinessValidationError(f"{what} {id_} does not exist.")
    return obj


def _resolve_manager(db: Session, user: User, manager_id: int | None) -> int:
    if user.role == Role.MANAGER:
        if manager_id not in (None, user.id):
            raise PermissionDenied("Managers can only create engagements they manage themselves.")
        return user.id
    if manager_id is None:
        raise BusinessValidationError("manager_id is required when an admin creates an engagement.")
    manager = _get(db, User, manager_id, "Manager")
    if not manager.is_active or manager.role not in (Role.MANAGER, Role.ADMIN):
        raise BusinessValidationError("manager_id must be an active manager or admin.")
    return manager.id


# ---------------------------------------------------------------- use-cases

def create_engagement(db: Session, user: User, data: EngagementCreate) -> int:
    client = _get(db, Client, data.client_id, "Client")
    st = _get(db, ServiceType, data.service_type_id, "Service type")
    manager_id = _resolve_manager(db, user, data.manager_id)
    if data.default_assignee_id is not None:
        assignee = _get(db, User, data.default_assignee_id, "Assignee")
        if not assignee.is_active:
            raise BusinessValidationError("default_assignee_id refers to an inactive user.")
    staffing = Staffing(default_assignee_id=data.default_assignee_id)

    if st.is_recurring:
        if data.period_start is None:
            raise BusinessValidationError("period_start is required for a recurring service.")
        if not periods.is_period_start(data.period_start, st.recurrence):
            expected = periods.period_start_for(data.period_start, st.recurrence)
            raise BusinessValidationError(
                f"period_start must be the first day of a {st.recurrence.value.lower()} period (e.g. {expected}).")
        engagement_id, created = _create_recurring(
            db, actor=user, client_id=client.id, service_type=st, period_start=data.period_start,
            manager_id=manager_id, staffing=staffing)
        if not created:
            raise Duplicate(
                f"An engagement for {client.name} / {st.name} / "
                f"{periods.period_label(data.period_start, st.recurrence)} already exists.",
                code="DUPLICATE_ENGAGEMENT", details={"engagement_id": engagement_id})
        return engagement_id

    if data.period_start is not None:
        raise BusinessValidationError("period_start only applies to recurring services.")
    templates = _templates(db, st.id)
    if not templates:
        raise BusinessValidationError(f"Service type '{st.name}' has no task templates.", code="NO_TEMPLATES")
    with transaction(db):
        engagement_id = _insert_engagement(db, client_id=client.id, service_type_id=st.id, manager_id=manager_id,
                                           created_by=user.id)
        _instantiate_tasks(db, engagement_id, templates, _base_date(st, None, data.start_date), staffing, user)
    return engagement_id


def generate_next(db: Session, user: User, engagement_id: int) -> tuple[int, bool]:
    source = db.scalars(select(Engagement).options(*ENGAGEMENT_LOAD, joinedload(Engagement.tasks))
                        .where(Engagement.id == engagement_id)).unique().one_or_none()
    if source is None:
        raise NotFound("Engagement not found.")
    if not can_manage_engagement(user, source):
        raise PermissionDenied("Only the engagement's manager or an admin can generate the next period.")
    st = source.service_type
    if not st.is_recurring or source.period_start is None:
        raise Conflict("Only recurring engagements have a next period.", code="NOT_RECURRING")
    staffing = Staffing(by_template={t.template_id: (t.assignee_id, t.reviewer_id)
                                     for t in source.tasks if t.template_id is not None})
    return _create_recurring(
        db, actor=user, client_id=source.client_id, service_type=st,
        period_start=periods.next_period_start(source.period_start, st.recurrence),
        manager_id=source.manager_id, staffing=staffing)


def generate_due_recurring(db: Session, as_of: date | None = None, actor: User | None = None) -> GenerateDueOut:
    """Scheduler entry point: make sure every recurring client/service has engagements up to the period
    containing `as_of`, catching up on any missed periods. Idempotent — re-running creates nothing new.

    Each engagement is its own transaction: a failure for one client is reported and does not undo the
    others; re-running retries only what is still missing.
    """
    as_of = as_of or business_today()
    latest = db.scalars(
        select(Engagement)
        .join(Engagement.service_type)
        .options(joinedload(Engagement.service_type), joinedload(Engagement.tasks))
        .where(ServiceType.is_recurring.is_(True), Engagement.period_start.isnot(None))
        .distinct(Engagement.client_id, Engagement.service_type_id)
        .order_by(Engagement.client_id, Engagement.service_type_id, Engagement.period_start.desc())
    ).unique().all()
    plan = [
        (e.client_id, e.service_type, e.manager_id,
         Staffing(by_template={t.template_id: (t.assignee_id, t.reviewer_id) for t in e.tasks if t.template_id}),
         periods.periods_between(e.period_start, as_of, e.service_type.recurrence))
        for e in latest
    ]

    created, already, failed = [], 0, []
    for client_id, st, manager_id, staffing, due_periods in plan:
        if not due_periods:
            already += 1
            continue
        for p in due_periods:
            try:
                eid, was_created = _create_recurring(db, actor=actor, client_id=client_id, service_type=st,
                                                     period_start=p, manager_id=manager_id, staffing=staffing)
                if was_created:
                    created.append(eid)
                else:
                    already += 1
            except Exception as exc:  # report, then move on to the next client/service
                log.exception("recurring_generation_failed")
                failed.append({"client_id": client_id, "service_type_id": st.id, "period_start": str(p),
                               "error": str(exc)})
                # Stop this pair here: creating later periods would make the next run start after the
                # gap (it resumes from the latest engagement), so the failed period would never be retried.
                break
    return GenerateDueOut(as_of=as_of, created=created, already_existed=already, failed=failed)


# ---------------------------------------------------------------- queries

def _summary(e: Engagement, counts: dict[str, int]) -> EngagementSummary:
    return EngagementSummary(
        id=e.id, client=ClientRef.model_validate(e.client), service_type=ServiceTypeRef.model_validate(e.service_type),
        period_start=e.period_start, period_label=e.period_label, label=e.label,
        manager=UserRef(id=e.manager.id, name=e.manager.name), status=e.status, created_at=e.created_at,
        task_counts=counts,
    )


def list_engagements(db: Session, user: User, *, client_id: int | None, service_type_id: int | None,
                     status: str | None, limit: int, cursor: str | None):
    stmt = select(Engagement).options(*ENGAGEMENT_LOAD).where(engagement_scope(user))
    if client_id is not None:
        stmt = stmt.where(Engagement.client_id == client_id)
    if service_type_id is not None:
        stmt = stmt.where(Engagement.service_type_id == service_type_id)
    if status:
        stmt = stmt.where(Engagement.status == status)
    if (after := decode_cursor(cursor)) is not None:
        stmt = stmt.where(Engagement.id < int(after[0]))
    rows = list(db.scalars(stmt.order_by(Engagement.id.desc()).limit(limit + 1)).unique())
    rows, next_cursor = page(rows, limit, lambda e: [e.id])
    counts = task_service.status_counts_by_engagement(db, [e.id for e in rows], user)
    return [_summary(e, counts.get(e.id, {})) for e in rows], next_cursor


def get_detail(db: Session, user: User, engagement_id: int) -> EngagementDetail:
    e = db.scalars(select(Engagement).options(*ENGAGEMENT_LOAD).where(Engagement.id == engagement_id)).one_or_none()
    if e is None:
        raise NotFound("Engagement not found.")
    visible = db.scalar(select(Engagement.id).where(Engagement.id == engagement_id, engagement_scope(user)))
    if visible is None:
        raise PermissionDenied("You do not have access to this engagement.")
    tasks = db.scalars(
        select(Task).join(Task.engagement).options(*task_service.TASK_LOAD)
        .where(Task.engagement_id == engagement_id, task_scope(user)).order_by(Task.sequence, Task.id)
    ).unique().all()
    counts: dict[str, int] = {}
    for t in tasks:
        counts[t.status.value] = counts.get(t.status.value, 0) + 1
    return EngagementDetail(**_summary(e, counts).model_dump(), tasks=[task_service.to_out(t) for t in tasks],
                            can_manage=can_manage_engagement(user, e))
