"""Task use-cases: listing, manager edits, workflow transitions and history."""

from datetime import UTC, date, datetime

from sqlalchemy import exists, func, select, tuple_
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.exc import StaleDataError

from app.config import business_today
from app.db import transaction
from app.domain import workflow
from app.domain.workflow import Action, TaskSnapshot
from app.errors import BusinessValidationError, Conflict, NotFound, PermissionDenied, StaleVersion
from app.models import Engagement, EngagementStatus, Role, Task, TaskEvent, TaskStatus, User
from app.pagination import decode_cursor, page
from app.schemas import EngagementRef, TaskDetail, TaskEventOut, TaskOut, TaskUpdate, UserRef
from app.services.access import actor_of, can_manage_engagement, can_view_task, task_scope

# Everything a TaskOut needs, loaded with JOINs in the same query (no N+1).
TASK_LOAD = (
    joinedload(Task.engagement).joinedload(Engagement.client),
    joinedload(Task.engagement).joinedload(Engagement.service_type),
    joinedload(Task.assignee),
    joinedload(Task.reviewer),
)


def snapshot(task: Task) -> TaskSnapshot:
    return TaskSnapshot(
        status=task.status,
        assignee_id=task.assignee_id,
        reviewer_id=task.reviewer_id,
        engagement_manager_id=task.engagement.manager_id,
    )


def _user_ref(u: User | None) -> UserRef | None:
    return UserRef(id=u.id, name=u.name) if u else None


def to_out(task: Task, today: date | None = None) -> TaskOut:
    today = today or business_today()
    e = task.engagement
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        due_date=task.due_date,
        is_overdue=task.status != TaskStatus.COMPLETED and task.due_date < today,
        sequence=task.sequence,
        engagement=EngagementRef(
            id=e.id, label=e.label, client_name=e.client.name, service_type_name=e.service_type.name,
            period_label=e.period_label, manager_id=e.manager_id,
        ),
        assignee=_user_ref(task.assignee),
        reviewer=_user_ref(task.reviewer),
        submitted_at=task.submitted_at,
        completed_at=task.completed_at,
        updated_at=task.updated_at,
        version=task.version,
    )


def to_detail(task: Task, user: User) -> TaskDetail:
    return TaskDetail(
        **to_out(task).model_dump(),
        allowed_actions=workflow.allowed_actions(actor_of(user), snapshot(task)),
        can_edit=can_manage_engagement(user, task.engagement) and task.status != TaskStatus.COMPLETED,
    )


def _load_task(db: Session, task_id: int) -> Task:
    task = db.scalars(select(Task).options(*TASK_LOAD).where(Task.id == task_id)).unique().one_or_none()
    if task is None:
        raise NotFound("Task not found.")
    return task


def get_visible_task(db: Session, user: User, task_id: int) -> Task:
    task = _load_task(db, task_id)
    if not can_view_task(user, task):
        raise PermissionDenied("You do not have access to this task.")
    return task


def list_tasks(
    db: Session,
    user: User,
    *,
    status: list[TaskStatus] | None = None,
    overdue: bool = False,
    due_today: bool = False,
    engagement_id: int | None = None,
    assignee_id: int | None = None,
    mine: bool = False,
    limit: int,
    cursor: str | None,
) -> tuple[list[TaskOut], str | None]:
    today = business_today()
    stmt = select(Task).join(Task.engagement).options(*TASK_LOAD).where(task_scope(user))
    if status:
        stmt = stmt.where(Task.status.in_(status))
    if overdue:
        stmt = stmt.where(Task.status != TaskStatus.COMPLETED, Task.due_date < today)
    if due_today:
        stmt = stmt.where(Task.status != TaskStatus.COMPLETED, Task.due_date == today)
    if engagement_id is not None:
        stmt = stmt.where(Task.engagement_id == engagement_id)
    if mine:
        stmt = stmt.where(Task.assignee_id == user.id)
    elif assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if (after := decode_cursor(cursor)) is not None:
        stmt = stmt.where(tuple_(Task.due_date, Task.id) > (date.fromisoformat(after[0]), int(after[1])))
    rows = db.scalars(stmt.order_by(Task.due_date, Task.id).limit(limit + 1)).unique().all()
    rows, next_cursor = page(list(rows), limit, lambda t: [t.due_date.isoformat(), t.id])
    return [to_out(t, today) for t in rows], next_cursor


def _event(task: Task, actor: User | None, action: str, *, from_status=None, to_status=None, note=None, details=None):
    return TaskEvent(task_id=task.id, actor_id=actor.id if actor else None, action=action, from_status=from_status,
                     to_status=to_status, note=note, details=details)


def _flush_versioned(db: Session) -> None:
    try:
        db.flush()
    except StaleDataError as exc:  # someone else updated the row between our read and our write
        raise StaleVersion("This task was changed by someone else. Reload and try again.") from exc


def transition(db: Session, user: User, task_id: int, action: Action, note: str | None, version: int) -> Task:
    with transaction(db):
        task = get_visible_task(db, user, task_id)
        snap = snapshot(task)
        workflow.check_permission(actor_of(user), snap, action)  # 403 before anything else
        if task.version != version:
            raise StaleVersion("This task was changed by someone else. Reload and try again.",
                               details={"current_version": task.version})
        new_status = workflow.next_status(snap, action, note)  # 409 / 422

        old_status = task.status
        now = datetime.now(UTC)
        task.status = new_status
        if action == Action.SUBMIT_FOR_REVIEW:
            task.submitted_at = now
        if new_status == TaskStatus.COMPLETED:
            task.completed_at = now
        db.add(_event(task, user, action.value, from_status=old_status.value, to_status=new_status.value, note=note))
        _flush_versioned(db)  # UPDATE ... WHERE version = :old — the concurrent-write guard

        if new_status == TaskStatus.COMPLETED:
            _complete_engagement_if_done(db, task.engagement)
    db.refresh(task)
    return task


def _complete_engagement_if_done(db: Session, engagement: Engagement) -> None:
    open_tasks = db.scalar(
        select(exists().where(Task.engagement_id == engagement.id, Task.status != TaskStatus.COMPLETED))
    )
    if not open_tasks:
        engagement.status = EngagementStatus.COMPLETED


def _active_user(db: Session, user_id: int, field: str) -> User:
    u = db.get(User, user_id)
    if u is None or not u.is_active:
        raise BusinessValidationError(f"{field}: user {user_id} does not exist or is inactive.")
    return u


def update_task(db: Session, user: User, task_id: int, data: TaskUpdate) -> Task:
    """Assign / reassign / set reviewer / set due date. Engagement manager or admin only."""
    fields = data.model_fields_set
    with transaction(db):
        task = get_visible_task(db, user, task_id)
        if not can_manage_engagement(user, task.engagement):
            raise PermissionDenied("Only the engagement's manager or an admin can assign tasks or set deadlines.")
        if task.version != data.version:
            raise StaleVersion("This task was changed by someone else. Reload and try again.",
                               details={"current_version": task.version})
        if task.status == TaskStatus.COMPLETED:
            raise Conflict("Completed tasks cannot be edited.", code="TASK_COMPLETED")

        events: list[TaskEvent] = []
        if "assignee_id" in fields and data.assignee_id != task.assignee_id:
            if data.assignee_id is not None:
                _active_user(db, data.assignee_id, "assignee_id")
            events.append(_event(task, user, "ASSIGNED",
                                 details={"from": task.assignee_id, "to": data.assignee_id}))
            task.assignee_id = data.assignee_id
        if "reviewer_id" in fields and data.reviewer_id != task.reviewer_id:
            if data.reviewer_id is not None:
                reviewer = _active_user(db, data.reviewer_id, "reviewer_id")
                if reviewer.role not in (Role.MANAGER, Role.ADMIN):
                    raise BusinessValidationError("reviewer_id: the reviewer must be a manager or admin.")
            events.append(_event(task, user, "REVIEWER_SET",
                                 details={"from": task.reviewer_id, "to": data.reviewer_id}))
            task.reviewer_id = data.reviewer_id
        if task.reviewer_id is not None and task.reviewer_id == task.assignee_id:
            raise BusinessValidationError("The reviewer cannot be the same person as the assignee.",
                                          code="REVIEWER_IS_ASSIGNEE")
        if "due_date" in fields and data.due_date != task.due_date:
            events.append(_event(task, user, "DUE_DATE_CHANGED",
                                 details={"from": task.due_date.isoformat(), "to": data.due_date.isoformat()}))
            task.due_date = data.due_date

        if events:
            db.add_all(events)
            _flush_versioned(db)
    db.expire(task)
    return _load_task(db, task_id)


def history(db: Session, user: User, task_id: int) -> list[TaskEventOut]:
    get_visible_task(db, user, task_id)
    events = db.scalars(
        select(TaskEvent).options(joinedload(TaskEvent.actor))
        .where(TaskEvent.task_id == task_id).order_by(TaskEvent.created_at, TaskEvent.id)
    ).all()
    return [
        TaskEventOut(id=e.id, action=e.action, from_status=e.from_status, to_status=e.to_status, note=e.note,
                     details=e.details, actor=_user_ref(e.actor), created_at=e.created_at)
        for e in events
    ]


def status_counts_by_engagement(db: Session, engagement_ids: list[int], user: User) -> dict[int, dict[str, int]]:
    """One GROUP BY query for the task counts shown on engagement cards."""
    if not engagement_ids:
        return {}
    rows = db.execute(
        select(Task.engagement_id, Task.status, func.count())
        .join(Task.engagement)
        .where(Task.engagement_id.in_(engagement_ids), task_scope(user))
        .group_by(Task.engagement_id, Task.status)
    ).all()
    out: dict[int, dict[str, int]] = {}
    for eid, status, n in rows:
        out.setdefault(eid, {})[status.value if hasattr(status, "value") else status] = n
    return out
