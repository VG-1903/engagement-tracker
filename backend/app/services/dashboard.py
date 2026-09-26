"""Role-scoped dashboard in three queries total, independent of data volume:

1. one aggregate: COUNT(*) FILTER (WHERE <bucket>) for all five buckets in a single scan
2. one UNION ALL of the top-N task ids per bucket
3. one joined load of those tasks
"""

from sqlalchemy import and_, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.config import business_today
from app.models import Task, TaskStatus, User
from app.schemas import DashboardOut
from app.services.access import task_scope
from app.services.tasks import TASK_LOAD, to_out


def _buckets(today):
    is_open = Task.status != TaskStatus.COMPLETED
    return {
        "open": is_open,
        "overdue": and_(is_open, Task.due_date < today),
        "due_today": and_(is_open, Task.due_date == today),
        "waiting_for_client": Task.status == TaskStatus.WAITING_FOR_CLIENT,
        "waiting_for_review": Task.status == TaskStatus.READY_FOR_REVIEW,
    }


def get_dashboard(db: Session, user: User, list_limit: int = 8) -> DashboardOut:
    today = business_today()
    buckets = _buckets(today)
    scope = task_scope(user)

    counts_row = db.execute(
        select(*[func.count().filter(cond).label(name) for name, cond in buckets.items()])
        .select_from(Task).join(Task.engagement).where(scope)
    ).one()
    counts = dict(counts_row._mapping)

    top_n = union_all(*[
        select(literal(name).label("bucket"), Task.id.label("task_id"))
        .join(Task.engagement).where(scope, cond)
        .order_by(Task.due_date, Task.id).limit(list_limit)
        for name, cond in buckets.items()
    ])
    pairs = db.execute(top_n).all()
    ids = {tid for _, tid in pairs}
    by_id = {t.id: t for t in db.scalars(select(Task).options(*TASK_LOAD).where(Task.id.in_(ids))).unique()} if ids else {}

    lists: dict[str, list] = {name: [] for name in buckets}
    for name, tid in pairs:
        lists[name].append(by_id[tid])
    for name in lists:
        lists[name] = [to_out(t, today) for t in sorted(lists[name], key=lambda t: (t.due_date, t.id))]
    return DashboardOut(today=today, counts=counts, lists=lists)
