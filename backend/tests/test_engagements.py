"""Engagement creation, recurring generation, duplicate prevention and atomicity."""

from datetime import date

import pytest
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError

from app.models import Engagement, Task, TaskEvent, TaskStatus
from app.services import engagements as engagement_service
from tests.conftest import headers, transition


def count(db, model) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


def test_creating_engagement_generates_tasks_from_templates(api, world, engagement):
    assert engagement["period_label"] == "2026-08"
    assert [t["title"] for t in engagement["tasks"]] == ["Collect data", "File GSTR-1", "File GSTR-3B"]
    # recurring due dates count from period end (31 Aug) + template offset
    assert [t["due_date"] for t in engagement["tasks"]] == ["2026-09-03", "2026-09-11", "2026-09-20"]
    assert all(t["assignee"]["id"] == world.alice.id and t["status"] == "NOT_STARTED" for t in engagement["tasks"])


# --- required test 2 -------------------------------------------------------------------------------------
def test_duplicate_recurring_engagement_is_rejected(api, world, engagement, db):
    r = api.post("/engagements", headers=headers(world.admin), json={
        "client_id": world.client.id, "service_type_id": world.gst.id, "period_start": "2026-08-01",
        "manager_id": world.mgr2.id})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "DUPLICATE_ENGAGEMENT"
    assert r.json()["error"]["details"]["engagement_id"] == engagement["id"]
    assert count(db, Engagement) == 1 and count(db, Task) == 3


def test_database_unique_index_blocks_duplicates_even_bypassing_the_service(world, engagement, db):
    with pytest.raises(IntegrityError):
        db.execute(insert(Engagement).values(client_id=world.client.id, service_type_id=world.gst.id,
                                             period_start=date(2026, 8, 1), period_label="2026-08",
                                             manager_id=world.mgr.id))
    db.rollback()


def test_generate_next_twice_is_idempotent(api, world, engagement, db):
    url = f"/engagements/{engagement['id']}/generate-next"
    first = api.post(url, headers=headers(world.mgr))
    assert first.status_code == 201, first.text
    assert first.json()["created"] is True
    nxt = first.json()["engagement"]
    assert (nxt["period_start"], nxt["period_label"]) == ("2026-09-01", "2026-09")
    assert [t["due_date"] for t in nxt["tasks"]] == ["2026-10-03", "2026-10-11", "2026-10-20"]
    assert all(t["assignee"]["id"] == world.alice.id for t in nxt["tasks"])  # staffing carried forward

    second = api.post(url, headers=headers(world.mgr))
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["engagement"]["id"] == nxt["id"]
    assert count(db, Engagement) == 2 and count(db, Task) == 6


def test_one_time_services_allow_multiple_engagements(api, world):
    body = {"client_id": world.client.id, "service_type_id": world.reg.id, "default_assignee_id": world.bob.id}
    assert api.post("/engagements", headers=headers(world.mgr), json=body).status_code == 201
    assert api.post("/engagements", headers=headers(world.mgr), json=body).status_code == 201
    r = api.post(f"/engagements/1/generate-next", headers=headers(world.mgr))
    assert r.status_code == 409 and r.json()["error"]["code"] == "NOT_RECURRING"


def test_period_must_be_aligned_and_required(api, world):
    base = {"client_id": world.client.id, "service_type_id": world.gst.id}
    r = api.post("/engagements", headers=headers(world.mgr), json={**base, "period_start": "2026-08-15"})
    assert r.status_code == 422 and "2026-08-01" in r.json()["error"]["message"]
    assert api.post("/engagements", headers=headers(world.mgr), json=base).status_code == 422
    r = api.post("/engagements", headers=headers(world.mgr),
                 json={"client_id": world.client.id, "service_type_id": world.reg.id, "period_start": "2026-08-01"})
    assert r.status_code == 422


def test_engagement_creation_permissions(api, world):
    body = {"client_id": world.client.id, "service_type_id": world.gst.id, "period_start": "2026-08-01"}
    assert api.post("/engagements", headers=headers(world.alice), json=body).status_code == 403
    r = api.post("/engagements", headers=headers(world.mgr), json={**body, "manager_id": world.mgr2.id})
    assert r.status_code == 403
    r = api.post("/engagements", headers=headers(world.admin), json=body)
    assert r.status_code == 422  # admin must say who manages it


# --- required test 6 -------------------------------------------------------------------------------------
def _fail_on_second_task(monkeypatch):
    """Make the 2nd generated task violate a NOT NULL constraint, so the DB rejects it mid-way."""
    real, calls = engagement_service._build_task, {"n": 0}

    def flaky(*args, **kwargs):
        calls["n"] += 1
        task = real(*args, **kwargs)
        if calls["n"] == 2:
            task.due_date = None
        return task

    monkeypatch.setattr(engagement_service, "_build_task", flaky)


def test_engagement_creation_is_atomic(api, world, db, monkeypatch):
    _fail_on_second_task(monkeypatch)
    r = api.post("/engagements", headers=headers(world.mgr), json={
        "client_id": world.client.id, "service_type_id": world.gst.id, "period_start": "2026-08-01"})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"
    assert count(db, Engagement) == 0
    assert count(db, Task) == 0
    assert count(db, TaskEvent) == 0

    monkeypatch.undo()  # the same request succeeds afterwards: nothing half-created blocks it
    r = api.post("/engagements", headers=headers(world.mgr), json={
        "client_id": world.client.id, "service_type_id": world.gst.id, "period_start": "2026-08-01"})
    assert r.status_code == 201


def test_generate_next_failure_leaves_no_orphan(api, world, engagement, db, monkeypatch):
    _fail_on_second_task(monkeypatch)
    r = api.post(f"/engagements/{engagement['id']}/generate-next", headers=headers(world.mgr))
    assert r.status_code == 500
    assert count(db, Engagement) == 1 and count(db, Task) == 3


# --- scheduler entry point ---------------------------------------------------------------------------------
def test_generate_due_recurring_catches_up_and_is_idempotent(api, world, engagement, db):
    r = api.post("/admin/recurring/generate", headers=headers(world.admin), json={"as_of": "2026-10-15"})
    assert r.status_code == 200, r.text
    assert len(r.json()["created"]) == 2  # Sep and Oct were missing
    periods = db.scalars(select(Engagement.period_label).order_by(Engagement.period_start)).all()
    assert periods == ["2026-08", "2026-09", "2026-10"]

    again = api.post("/admin/recurring/generate", headers=headers(world.admin), json={"as_of": "2026-10-15"})
    assert again.json()["created"] == [] and again.json()["already_existed"] == 1
    assert count(db, Engagement) == 3 and count(db, Task) == 9

    assert api.post("/admin/recurring/generate", headers=headers(world.mgr), json={}).status_code == 403


def test_generate_due_recurring_reports_failures_and_retries_cleanly(world, engagement, db, monkeypatch):
    _fail_on_second_task(monkeypatch)
    result = engagement_service.generate_due_recurring(db, as_of=date(2026, 9, 10))
    assert result.created == [] and len(result.failed) == 1
    assert count(db, Engagement) == 1
    monkeypatch.undo()
    result = engagement_service.generate_due_recurring(db, as_of=date(2026, 9, 10))
    assert len(result.created) == 1


# --- visibility ------------------------------------------------------------------------------------------
def test_engagement_visibility_is_scoped_by_role(api, world, engagement):
    other = api.post("/engagements", headers=headers(world.mgr2), json={
        "client_id": world.client2.id, "service_type_id": world.reg.id, "default_assignee_id": world.bob.id})
    assert other.status_code == 201

    ids = lambda u: {e["id"] for e in api.get("/engagements", headers=headers(u)).json()["items"]}  # noqa: E731
    assert ids(world.admin) == {engagement["id"], other.json()["id"]}
    assert ids(world.mgr) == {engagement["id"]}
    assert ids(world.alice) == {engagement["id"]}
    assert ids(world.bob) == {other.json()["id"]}
    assert api.get(f"/engagements/{other.json()['id']}", headers=headers(world.alice)).status_code == 403
    assert api.get("/engagements/999", headers=headers(world.admin)).status_code == 404


def test_member_sees_only_own_tasks_inside_a_shared_engagement(api, world, engagement):
    tid = engagement["tasks"][0]["id"]
    api.patch(f"/tasks/{tid}", headers=headers(world.mgr), json={"assignee_id": world.bob.id, "version": 1})
    bob_view = api.get(f"/engagements/{engagement['id']}", headers=headers(world.bob)).json()
    assert [t["id"] for t in bob_view["tasks"]] == [tid]
    assert bob_view["can_manage"] is False
    alice_tasks = api.get("/tasks", headers=headers(world.alice)).json()["items"]
    assert tid not in [t["id"] for t in alice_tasks] and len(alice_tasks) == 2


def test_task_list_pagination_and_filters(api, world, engagement, db):
    for n in range(3):
        api.post(f"/engagements/{engagement['id'] + n}/generate-next", headers=headers(world.mgr))
    seen, cursor = [], None
    while True:
        params = {"limit": 5, **({"cursor": cursor} if cursor else {})}
        body = api.get("/tasks", headers=headers(world.mgr), params=params).json()
        seen += [(t["due_date"], t["id"]) for t in body["items"]]
        cursor = body["next_cursor"]
        if not cursor:
            break
    assert len(seen) == 12 and seen == sorted(seen) and len(set(seen)) == 12

    transition(api, world.alice, engagement["tasks"][0]["id"], "START")
    r = api.get("/tasks", headers=headers(world.alice), params={"status": "IN_PROGRESS"}).json()
    assert [t["status"] for t in r["items"]] == [TaskStatus.IN_PROGRESS.value]
    assert api.get("/tasks", headers=headers(world.alice), params={"cursor": "garbage!"}).status_code == 422


def test_catch_up_stops_at_a_failed_period_so_a_rerun_fills_the_gap(world, engagement, db, monkeypatch):
    """Aug exists; generating up to Oct must not create Oct if Sep failed, or Sep would never be retried."""
    real, calls = engagement_service._build_task, {"n": 0}

    def fail_first_period(*args, **kwargs):
        calls["n"] += 1
        task = real(*args, **kwargs)
        if calls["n"] == 1:  # first task of the first missing period (Sep)
            task.due_date = None
        return task

    monkeypatch.setattr(engagement_service, "_build_task", fail_first_period)
    result = engagement_service.generate_due_recurring(db, as_of=date(2026, 10, 15))
    assert result.created == [] and [f["period_start"] for f in result.failed] == ["2026-09-01"]
    assert count(db, Engagement) == 1

    monkeypatch.undo()
    result = engagement_service.generate_due_recurring(db, as_of=date(2026, 10, 15))
    assert len(result.created) == 2
    db.expire_all()
    assert db.scalars(select(Engagement.period_label).order_by(Engagement.period_start)).all() == [
        "2026-08", "2026-09", "2026-10"]
