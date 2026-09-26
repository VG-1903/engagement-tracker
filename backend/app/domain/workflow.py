"""The task workflow state machine: the ONLY place workflow rules live.

Pure Python — no database, no HTTP. The task service feeds it plain snapshots and applies the result,
the API exposes `allowed_actions()` so the UI never hard-codes rules.

    NOT_STARTED -> IN_PROGRESS -> READY_FOR_REVIEW -> COMPLETED
                   IN_PROGRESS -> WAITING_FOR_CLIENT -> IN_PROGRESS
                                  READY_FOR_REVIEW -> CHANGES_REQUESTED -> IN_PROGRESS
"""

from dataclasses import dataclass
from enum import StrEnum

from app.errors import BusinessValidationError, Conflict, InvalidTransition, PermissionDenied
from app.models import Role, TaskStatus as S


class Action(StrEnum):
    START = "START"
    WAIT_FOR_CLIENT = "WAIT_FOR_CLIENT"
    RESUME = "RESUME"
    SUBMIT_FOR_REVIEW = "SUBMIT_FOR_REVIEW"
    APPROVE = "APPROVE"
    REQUEST_CHANGES = "REQUEST_CHANGES"


class Kind(StrEnum):
    WORK = "WORK"  # done by the assignee (or the engagement's manager / an admin on their behalf)
    REVIEW = "REVIEW"  # done by the engagement's manager, the designated reviewer, or an admin — never the assignee


@dataclass(frozen=True)
class Transition:
    action: Action
    from_states: frozenset[S]
    to_state: S
    kind: Kind
    requires_note: bool = False
    label: str = ""


TRANSITIONS: dict[Action, Transition] = {
    t.action: t
    for t in [
        Transition(Action.START, frozenset({S.NOT_STARTED}), S.IN_PROGRESS, Kind.WORK, label="Start work"),
        Transition(Action.WAIT_FOR_CLIENT, frozenset({S.IN_PROGRESS}), S.WAITING_FOR_CLIENT, Kind.WORK,
                   requires_note=True, label="Waiting for client"),
        Transition(Action.RESUME, frozenset({S.WAITING_FOR_CLIENT, S.CHANGES_REQUESTED}), S.IN_PROGRESS,
                   Kind.WORK, label="Resume work"),
        Transition(Action.SUBMIT_FOR_REVIEW, frozenset({S.IN_PROGRESS}), S.READY_FOR_REVIEW, Kind.WORK,
                   label="Submit for review"),
        Transition(Action.APPROVE, frozenset({S.READY_FOR_REVIEW}), S.COMPLETED, Kind.REVIEW, label="Approve"),
        Transition(Action.REQUEST_CHANGES, frozenset({S.READY_FOR_REVIEW}), S.CHANGES_REQUESTED, Kind.REVIEW,
                   requires_note=True, label="Request changes"),
    ]
}


@dataclass(frozen=True)
class Actor:
    id: int
    role: Role


@dataclass(frozen=True)
class TaskSnapshot:
    status: S
    assignee_id: int | None
    reviewer_id: int | None
    engagement_manager_id: int


def manages(actor: Actor, task: TaskSnapshot) -> bool:
    """Admins manage everything; a manager manages the engagements they own."""
    return actor.role == Role.ADMIN or (actor.role == Role.MANAGER and actor.id == task.engagement_manager_id)


def check_permission(actor: Actor, task: TaskSnapshot, action: Action) -> None:
    t = TRANSITIONS[action]
    if t.kind == Kind.WORK:
        if actor.id != task.assignee_id and not manages(actor, task):
            raise PermissionDenied("You can only update tasks assigned to you.", code="NOT_TASK_ASSIGNEE")
        return
    # Review actions. Segregation of duties first: nobody approves their own work, whatever their role.
    if actor.id == task.assignee_id:
        raise PermissionDenied("You cannot review or approve your own work.", code="SELF_APPROVAL_FORBIDDEN")
    designated_reviewer = actor.role in (Role.MANAGER, Role.ADMIN) and actor.id == task.reviewer_id
    if not (manages(actor, task) or designated_reviewer):
        raise PermissionDenied(
            "Only the engagement's manager, the designated reviewer or an admin can review this task.",
            code="REVIEW_NOT_ALLOWED",
        )


def next_status(task: TaskSnapshot, action: Action, note: str | None = None) -> S:
    t = TRANSITIONS[action]
    if task.status not in t.from_states:
        raise InvalidTransition(
            f"Cannot {t.label.lower()} a task that is {task.status.value}.",
            details={"from_status": task.status.value, "action": action.value},
        )
    if action == Action.START and task.assignee_id is None:
        raise Conflict("Assign the task before starting work.", code="TASK_UNASSIGNED")
    if t.requires_note and not (note and note.strip()):
        raise BusinessValidationError(f"A note is required to {t.label.lower()}.", code="NOTE_REQUIRED")
    return t.to_state


def decide(actor: Actor, task: TaskSnapshot, action: Action, note: str | None = None) -> S:
    check_permission(actor, task, action)
    return next_status(task, action, note)


def allowed_actions(actor: Actor, task: TaskSnapshot) -> list[Action]:
    allowed = []
    for action, t in TRANSITIONS.items():
        if task.status not in t.from_states:
            continue
        if action == Action.START and task.assignee_id is None:
            continue
        try:
            check_permission(actor, task, action)
        except PermissionDenied:
            continue
        allowed.append(action)
    return allowed
