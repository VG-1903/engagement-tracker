from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import DB, CurrentUser
from app.models import TaskStatus
from app.routers.common import DEFAULT, Cursor, Limit
from app.schemas import Page, TaskDetail, TaskEventOut, TaskOut, TaskUpdate, TransitionIn
from app.services import tasks as svc

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=Page[TaskOut])
def list_tasks(
    db: DB,
    user: CurrentUser,
    status: Annotated[list[TaskStatus] | None, Query()] = None,
    overdue: bool = False,
    due_today: bool = False,
    engagement_id: int | None = None,
    assignee_id: int | None = None,
    mine: bool = False,
    limit: Limit = DEFAULT,
    cursor: Cursor = None,
):
    items, next_cursor = svc.list_tasks(db, user, status=status, overdue=overdue, due_today=due_today,
                                        engagement_id=engagement_id, assignee_id=assignee_id, mine=mine,
                                        limit=limit, cursor=cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: int, db: DB, user: CurrentUser):
    return svc.to_detail(svc.get_visible_task(db, user, task_id), user)


@router.patch("/{task_id}", response_model=TaskDetail)
def update_task(task_id: int, body: TaskUpdate, db: DB, user: CurrentUser):
    """Assign / reassign, set reviewer, set due date (engagement manager or admin)."""
    return svc.to_detail(svc.update_task(db, user, task_id, body), user)


@router.post("/{task_id}/transitions", response_model=TaskDetail)
def transition(task_id: int, body: TransitionIn, db: DB, user: CurrentUser):
    task = svc.transition(db, user, task_id, body.action, body.note, body.version)
    return svc.to_detail(task, user)


@router.get("/{task_id}/history", response_model=list[TaskEventOut])
def history(task_id: int, db: DB, user: CurrentUser):
    return svc.history(db, user, task_id)
