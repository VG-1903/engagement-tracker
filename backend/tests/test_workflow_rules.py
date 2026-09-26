"""Workflow rules through the API: permissions (403), invalid transitions (409), audit trail, locking."""

from sqlalchemy import select

from app.db import SessionLocal
from app.domain.workflow import Action
from app.errors import StaleVersion
from app.models import EngagementStatus, Engagement, Task, TaskEvent, TaskStatus
from app.services import tasks as task_service
from tests.conftest import headers, transition


def first_task(engagement):
    return engagement["tasks"][0]


# --- required test 1 -------------------------------------------------------------------------------------
def test_member_cannot_update_another_members_task(api, world, engagement):
    task = first_task(engagement)  # assigned to Alice
    r = transition(api, world.bob, task["id"], "START", version=task["version"])
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"

    # ...nor edit it, nor read its history
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.bob), json={"due_date": "2026-12-01", "version": 1})
    assert r.status_code == 403
    assert api.get(f"/tasks/{task['id']}/history", headers=headers(world.bob)).status_code == 403

    # and nothing changed
    assert api.get(f"/tasks/{task['id']}", headers=headers(world.alice)).json()["status"] == "NOT_STARTED"


def test_member_cannot_assign_or_set_deadlines_even_on_own_task(api, world, engagement):
    task = first_task(engagement)
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.alice),
                  json={"due_date": "2026-12-01", "version": task["version"]})
    assert r.status_code == 403


def test_other_manager_cannot_approve_or_assign(api, world, engagement):
    task = first_task(engagement)
    transition(api, world.alice, task["id"], "START")
    transition(api, world.alice, task["id"], "SUBMIT_FOR_REVIEW")
    assert transition(api, world.mgr2, task["id"], "APPROVE", version=3).status_code == 403
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr2), json={"assignee_id": world.bob.id, "version": 3})
    assert r.status_code == 403


# --- required test 3 -------------------------------------------------------------------------------------
def test_invalid_transition_not_started_to_completed_is_rejected(api, world, engagement):
    task = first_task(engagement)
    r = transition(api, world.mgr, task["id"], "APPROVE")  # manager may approve, but not from NOT_STARTED
    assert r.status_code == 409
    body = r.json()["error"]
    assert body["code"] == "INVALID_TRANSITION"
    assert body["details"] == {"from_status": "NOT_STARTED", "action": "APPROVE"}

    assert transition(api, world.alice, task["id"], "SUBMIT_FOR_REVIEW").status_code == 409
    assert transition(api, world.alice, task["id"], "RESUME").status_code == 409


def test_unknown_action_is_a_validation_error(api, world, engagement):
    task = first_task(engagement)
    r = api.post(f"/tasks/{task['id']}/transitions", headers=headers(world.alice),
                 json={"action": "COMPLETE", "version": 1})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


# --- required test 4 -------------------------------------------------------------------------------------
def test_manager_approval_completes_task_and_writes_audit_event(api, world, engagement, db):
    task = first_task(engagement)
    assert transition(api, world.alice, task["id"], "START").status_code == 200
    r = transition(api, world.alice, task["id"], "SUBMIT_FOR_REVIEW")
    assert r.json()["status"] == "READY_FOR_REVIEW"
    assert "APPROVE" not in r.json()["allowed_actions"]  # Alice can't approve her own work

    r = transition(api, world.mgr, task["id"], "APPROVE", note="Looks good")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "COMPLETED"
    assert r.json()["completed_at"] is not None

    events = db.scalars(select(TaskEvent).where(TaskEvent.task_id == task["id"]).order_by(TaskEvent.id)).all()
    approve = events[-1]
    assert (approve.action, approve.from_status, approve.to_status) == ("APPROVE", "READY_FOR_REVIEW", "COMPLETED")
    assert approve.actor_id == world.mgr.id and approve.note == "Looks good"
    assert [e.action for e in events] == ["CREATED", "START", "SUBMIT_FOR_REVIEW", "APPROVE"]

    history = api.get(f"/tasks/{task['id']}/history", headers=headers(world.alice)).json()
    assert history[-1]["actor"]["name"] == "Manager"


def test_engagement_completes_when_last_task_is_approved(api, world, engagement, db):
    for t in engagement["tasks"]:
        for action, who in [("START", world.alice), ("SUBMIT_FOR_REVIEW", world.alice), ("APPROVE", world.mgr)]:
            assert transition(api, who, t["id"], action).status_code == 200
    assert db.get(Engagement, engagement["id"]).status == EngagementStatus.COMPLETED


# --- required test 5 -------------------------------------------------------------------------------------
def test_assignee_cannot_approve_own_task_even_as_manager(api, world, engagement):
    task = first_task(engagement)
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr),
                  json={"assignee_id": world.mgr.id, "version": task["version"]})
    assert r.status_code == 200
    transition(api, world.mgr, task["id"], "START")
    transition(api, world.mgr, task["id"], "SUBMIT_FOR_REVIEW")

    r = transition(api, world.mgr, task["id"], "APPROVE")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "SELF_APPROVAL_FORBIDDEN"
    assert transition(api, world.mgr, task["id"], "REQUEST_CHANGES", note="x").status_code == 403

    # A designated reviewer (another manager) can approve it.
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr),
                  json={"reviewer_id": world.mgr2.id, "version": api.get(f"/tasks/{task['id']}", headers=headers(world.mgr)).json()["version"]})
    assert r.status_code == 200
    r = transition(api, world.mgr2, task["id"], "APPROVE")
    assert r.status_code == 200 and r.json()["status"] == "COMPLETED"


def test_admin_assignee_cannot_self_approve(api, world, engagement):
    task = first_task(engagement)
    api.patch(f"/tasks/{task['id']}", headers=headers(world.admin), json={"assignee_id": world.admin.id, "version": 1})
    transition(api, world.admin, task["id"], "START")
    transition(api, world.admin, task["id"], "SUBMIT_FOR_REVIEW")
    assert transition(api, world.admin, task["id"], "APPROVE").status_code == 403


def test_reviewer_cannot_be_the_assignee_or_a_member(api, world, engagement):
    task = first_task(engagement)
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr), json={"reviewer_id": world.bob.id, "version": 1})
    assert r.status_code == 422
    api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr), json={"assignee_id": world.mgr.id, "version": 1})
    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr), json={"reviewer_id": world.mgr.id, "version": 2})
    assert r.status_code == 422 and r.json()["error"]["code"] == "REVIEWER_IS_ASSIGNEE"


# --- required test 7 -------------------------------------------------------------------------------------
def test_stale_version_is_rejected(api, world, engagement):
    task = first_task(engagement)
    v = task["version"]
    assert transition(api, world.alice, task["id"], "START", version=v).status_code == 200
    r = transition(api, world.alice, task["id"], "WAIT_FOR_CLIENT", note="need invoices", version=v)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "STALE_VERSION"
    assert r.json()["error"]["details"]["current_version"] == v + 1

    r = api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr), json={"due_date": "2026-12-01", "version": v})
    assert r.status_code == 409 and r.json()["error"]["code"] == "STALE_VERSION"


def test_concurrent_write_is_caught_by_the_database_version_check(world, engagement):
    """Two sessions read version 1; the second write must fail even though its in-memory version matched."""
    task_id = first_task(engagement)["id"]
    s1, s2 = SessionLocal(), SessionLocal()
    try:
        alice1, alice2 = s1.get(type(world.alice), world.alice.id), s2.get(type(world.alice), world.alice.id)
        s2.get(Task, task_id)  # s2 now holds the task at version 1 in its identity map
        task_service.transition(s1, alice1, task_id, Action.START, None, 1)
        try:
            task_service.transition(s2, alice2, task_id, Action.START, None, 1)
            raise AssertionError("expected StaleVersion")
        except StaleVersion:
            pass
    finally:
        s1.close(), s2.close()
    with SessionLocal() as s:
        assert s.get(Task, task_id).version == 2
        # the losing write's audit event was rolled back with it
        assert len(s.scalars(select(TaskEvent).where(TaskEvent.task_id == task_id,
                                                     TaskEvent.action == "START")).all()) == 1


# --- other rules -----------------------------------------------------------------------------------------
def test_notes_required_for_waiting_and_request_changes(api, world, engagement):
    task = first_task(engagement)
    transition(api, world.alice, task["id"], "START")
    r = transition(api, world.alice, task["id"], "WAIT_FOR_CLIENT")
    assert r.status_code == 422 and r.json()["error"]["code"] == "NOTE_REQUIRED"
    transition(api, world.alice, task["id"], "SUBMIT_FOR_REVIEW")
    assert transition(api, world.mgr, task["id"], "REQUEST_CHANGES").status_code == 422
    r = transition(api, world.mgr, task["id"], "REQUEST_CHANGES", note="Fix HSN codes")
    assert r.json()["status"] == "CHANGES_REQUESTED"
    r = transition(api, world.alice, task["id"], "RESUME")
    assert r.json()["status"] == "IN_PROGRESS"


def test_full_happy_path_with_client_wait(api, world, engagement):
    tid = first_task(engagement)["id"]
    steps = [(world.alice, "START", None, "IN_PROGRESS"),
             (world.alice, "WAIT_FOR_CLIENT", "Need purchase register", "WAITING_FOR_CLIENT"),
             (world.alice, "RESUME", None, "IN_PROGRESS"),
             (world.alice, "SUBMIT_FOR_REVIEW", None, "READY_FOR_REVIEW"),
             (world.mgr, "APPROVE", None, "COMPLETED")]
    for who, action, note, expected in steps:
        r = transition(api, who, tid, action, note=note)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == expected


def test_completed_tasks_cannot_be_edited(api, world, engagement):
    tid = first_task(engagement)["id"]
    for who, action in [(world.alice, "START"), (world.alice, "SUBMIT_FOR_REVIEW"), (world.mgr, "APPROVE")]:
        transition(api, who, tid, action)
    r = api.patch(f"/tasks/{tid}", headers=headers(world.mgr), json={"due_date": "2026-12-01", "version": 4})
    assert r.status_code == 409 and r.json()["error"]["code"] == "TASK_COMPLETED"


def test_unassigned_task_cannot_be_started(api, world, engagement, db):
    task = first_task(engagement)
    api.patch(f"/tasks/{task['id']}", headers=headers(world.mgr), json={"assignee_id": None, "version": 1})
    r = transition(api, world.mgr, task["id"], "START")
    assert r.status_code == 409 and r.json()["error"]["code"] == "TASK_UNASSIGNED"
    assert db.get(Task, task["id"]).status == TaskStatus.NOT_STARTED
