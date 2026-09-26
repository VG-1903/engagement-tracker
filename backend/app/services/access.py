"""Row-level visibility rules, expressed as SQL predicates so lists are filtered in the database.

ADMIN   sees everything.
MANAGER sees engagements they manage, plus any task where they are assignee or reviewer.
MEMBER  sees only tasks assigned to them (and the engagements those tasks belong to).
"""

from sqlalchemy import ColumnElement, exists, or_, select, true

from app.domain.workflow import Actor
from app.models import Engagement, Role, Task, User


def actor_of(user: User) -> Actor:
    return Actor(id=user.id, role=user.role)


def task_scope(user: User) -> ColumnElement[bool]:
    """Predicate over Task JOIN Engagement."""
    if user.role == Role.ADMIN:
        return true()
    if user.role == Role.MANAGER:
        return or_(Engagement.manager_id == user.id, Task.assignee_id == user.id, Task.reviewer_id == user.id)
    return Task.assignee_id == user.id


def engagement_scope(user: User) -> ColumnElement[bool]:
    """Predicate over Engagement."""
    if user.role == Role.ADMIN:
        return true()
    own_task = select(Task.id).where(Task.engagement_id == Engagement.id)
    if user.role == Role.MANAGER:
        return or_(
            Engagement.manager_id == user.id,
            exists(own_task.where(or_(Task.assignee_id == user.id, Task.reviewer_id == user.id))),
        )
    return exists(own_task.where(Task.assignee_id == user.id))


def can_manage_engagement(user: User, engagement: Engagement) -> bool:
    return user.role == Role.ADMIN or (user.role == Role.MANAGER and engagement.manager_id == user.id)


def can_view_task(user: User, task: Task) -> bool:
    if can_manage_engagement(user, task.engagement):
        return True
    if user.role == Role.MANAGER and user.id in (task.assignee_id, task.reviewer_id):
        return True
    return task.assignee_id == user.id
