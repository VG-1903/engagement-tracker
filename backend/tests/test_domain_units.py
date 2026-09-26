"""Pure unit tests for the state machine and period arithmetic (no database)."""

from datetime import date

import pytest

from app.domain import periods
from app.domain.workflow import TRANSITIONS, Action, Actor, TaskSnapshot, allowed_actions, decide
from app.errors import BusinessValidationError, InvalidTransition, PermissionDenied
from app.models import Recurrence, Role, TaskStatus as S

MANAGER, MEMBER, OTHER_MEMBER, ADMIN, OTHER_MANAGER = (
    Actor(1, Role.MANAGER), Actor(2, Role.MEMBER), Actor(3, Role.MEMBER), Actor(4, Role.ADMIN), Actor(5, Role.MANAGER))


def snap(status: S, assignee=2, reviewer=None) -> TaskSnapshot:
    return TaskSnapshot(status=status, assignee_id=assignee, reviewer_id=reviewer, engagement_manager_id=1)


LEGAL = {(a, f): t.to_state for a, t in TRANSITIONS.items() for f in t.from_states}


@pytest.mark.parametrize("action", list(Action))
@pytest.mark.parametrize("status", list(S))
def test_every_action_from_every_state(action, status):
    """Exhaustive: the table of legal transitions is exactly the documented workflow."""
    actor = MANAGER if TRANSITIONS[action].kind == "REVIEW" else MEMBER
    note = "note"
    if (action, status) in LEGAL:
        assert decide(actor, snap(status), action, note) == LEGAL[(action, status)]
    else:
        with pytest.raises(InvalidTransition):
            decide(actor, snap(status), action, note)


def test_documented_workflow_edges():
    assert {(f, t) for (_, f), t in LEGAL.items()} == {
        (S.NOT_STARTED, S.IN_PROGRESS), (S.IN_PROGRESS, S.READY_FOR_REVIEW), (S.READY_FOR_REVIEW, S.COMPLETED),
        (S.IN_PROGRESS, S.WAITING_FOR_CLIENT), (S.WAITING_FOR_CLIENT, S.IN_PROGRESS),
        (S.READY_FOR_REVIEW, S.CHANGES_REQUESTED), (S.CHANGES_REQUESTED, S.IN_PROGRESS),
    }
    assert not any(f == S.COMPLETED for (_, f) in LEGAL)  # COMPLETED is terminal


def test_member_permissions():
    with pytest.raises(PermissionDenied):
        decide(OTHER_MEMBER, snap(S.NOT_STARTED), Action.START)
    with pytest.raises(PermissionDenied):
        decide(MEMBER, snap(S.READY_FOR_REVIEW), Action.APPROVE)  # own task -> self-approval
    with pytest.raises(PermissionDenied):
        decide(OTHER_MEMBER, snap(S.READY_FOR_REVIEW), Action.APPROVE)  # not a reviewer


def test_self_approval_blocked_for_every_role():
    for actor in (MANAGER, ADMIN):
        with pytest.raises(PermissionDenied) as e:
            decide(actor, snap(S.READY_FOR_REVIEW, assignee=actor.id), Action.APPROVE)
        assert e.value.code == "SELF_APPROVAL_FORBIDDEN"


def test_review_rights():
    assert decide(ADMIN, snap(S.READY_FOR_REVIEW), Action.APPROVE) == S.COMPLETED
    with pytest.raises(PermissionDenied):
        decide(OTHER_MANAGER, snap(S.READY_FOR_REVIEW), Action.APPROVE)
    assert decide(OTHER_MANAGER, snap(S.READY_FOR_REVIEW, reviewer=5), Action.APPROVE) == S.COMPLETED


def test_notes_required():
    with pytest.raises(BusinessValidationError):
        decide(MEMBER, snap(S.IN_PROGRESS), Action.WAIT_FOR_CLIENT, "  ")
    with pytest.raises(BusinessValidationError):
        decide(MANAGER, snap(S.READY_FOR_REVIEW), Action.REQUEST_CHANGES, None)


def test_allowed_actions_drive_the_ui():
    assert allowed_actions(MEMBER, snap(S.IN_PROGRESS)) == [Action.WAIT_FOR_CLIENT, Action.SUBMIT_FOR_REVIEW]
    assert allowed_actions(MEMBER, snap(S.READY_FOR_REVIEW)) == []
    assert allowed_actions(MANAGER, snap(S.READY_FOR_REVIEW)) == [Action.APPROVE, Action.REQUEST_CHANGES]
    assert allowed_actions(OTHER_MEMBER, snap(S.NOT_STARTED)) == []
    assert allowed_actions(MANAGER, snap(S.NOT_STARTED, assignee=None)) == []
    assert allowed_actions(MEMBER, snap(S.COMPLETED)) == []


@pytest.mark.parametrize("start, rec, label, nxt, end", [
    (date(2026, 9, 1), Recurrence.MONTHLY, "2026-09", date(2026, 10, 1), date(2026, 9, 30)),
    (date(2026, 12, 1), Recurrence.MONTHLY, "2026-12", date(2027, 1, 1), date(2026, 12, 31)),
    (date(2026, 2, 1), Recurrence.MONTHLY, "2026-02", date(2026, 3, 1), date(2026, 2, 28)),
    (date(2026, 4, 1), Recurrence.QUARTERLY, "FY2026-27 Q1", date(2026, 7, 1), date(2026, 6, 30)),
    (date(2027, 1, 1), Recurrence.QUARTERLY, "FY2026-27 Q4", date(2027, 4, 1), date(2027, 3, 31)),
    (date(2026, 4, 1), Recurrence.YEARLY, "FY2026-27", date(2027, 4, 1), date(2027, 3, 31)),
])
def test_periods(start, rec, label, nxt, end):
    assert periods.is_period_start(start, rec)
    assert periods.period_label(start, rec) == label
    assert periods.next_period_start(start, rec) == nxt
    assert periods.period_end(start, rec) == end


def test_period_alignment_and_catch_up():
    assert periods.period_start_for(date(2026, 2, 15), Recurrence.YEARLY) == date(2025, 4, 1)
    assert periods.period_start_for(date(2026, 8, 20), Recurrence.QUARTERLY) == date(2026, 7, 1)
    assert not periods.is_period_start(date(2026, 5, 1), Recurrence.QUARTERLY)
    assert periods.periods_between(date(2026, 7, 1), date(2026, 10, 3), Recurrence.MONTHLY) == [
        date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1)]
    assert periods.periods_between(date(2026, 10, 1), date(2026, 10, 3), Recurrence.MONTHLY) == []
