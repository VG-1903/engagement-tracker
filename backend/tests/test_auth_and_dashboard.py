"""Authentication, coarse role checks, admin CRUD guards, error shape and the dashboard."""

from app.config import business_today
from app.models import Role
from tests.conftest import headers, transition


def test_login_and_me(api, world):
    r = api.post("/auth/login", json={"email": "ALICE@example.com", "password": "Password@1"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    me = api.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "alice@example.com" and me.json()["role"] == "MEMBER"
    assert "password_hash" not in me.json()


def test_bad_credentials_and_missing_token(api, world):
    r = api.post("/auth/login", json={"email": "alice@example.com", "password": "wrong"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"
    r = api.post("/auth/login", json={"email": "nobody@example.com", "password": "wrong"})
    assert r.status_code == 401
    r = api.get("/dashboard")
    assert r.status_code == 401 and r.json() == {"error": {"code": "UNAUTHENTICATED", "message": "Missing bearer token."}}
    assert api.get("/dashboard", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_deactivated_user_is_locked_out(api, world):
    assert api.delete(f"/users/{world.bob.id}", headers=headers(world.admin)).json()["is_active"] is False
    assert api.get("/auth/me", headers=headers(world.bob)).status_code == 401
    r = api.post("/auth/login", json={"email": "bob@example.com", "password": "Password@1"})
    assert r.status_code == 401


def test_admin_endpoints_require_admin(api, world):
    for user in (world.mgr, world.alice):
        assert api.post("/clients", headers=headers(user), json={"name": "X"}).status_code == 403
        assert api.get("/users", headers=headers(user)).status_code == 403
        assert api.post("/service-types", headers=headers(user),
                        json={"name": "X", "is_recurring": False}).status_code == 403
    assert api.get("/clients", headers=headers(world.alice)).status_code == 403
    assert api.get("/clients", headers=headers(world.mgr)).status_code == 200


def test_admin_crud_validation_and_conflicts(api, world):
    h = headers(world.admin)
    r = api.post("/clients", headers=h, json={"name": "Dup", "gstin": "27AABCA1234F1Z5"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "DUPLICATE_GSTIN"
    r = api.post("/clients", headers=h, json={"name": "Bad", "gstin": "NOTAGSTIN"})
    assert r.status_code == 422 and r.json()["error"]["message"].startswith("gstin:")
    r = api.post("/service-types", headers=h, json={"name": "Odd", "is_recurring": True})
    assert r.status_code == 422
    r = api.post("/users", headers=h, json={"name": "A", "email": "alice@example.com", "password": "Password@1",
                                            "role": Role.MEMBER})
    assert r.status_code == 409
    assert api.patch(f"/users/{world.admin.id}", headers=h, json={"is_active": False}).status_code == 409


def test_client_in_use_cannot_be_deleted(api, world, engagement):
    assert api.delete(f"/clients/{world.client.id}", headers=headers(world.admin)).status_code == 409
    assert api.delete(f"/clients/{world.client2.id}", headers=headers(world.admin)).status_code == 204


def test_template_edits_do_not_change_existing_tasks(api, world, engagement):
    tpl = world.gst.templates[0]
    r = api.patch(f"/task-templates/{tpl.id}", headers=headers(world.admin), json={"title": "Collect everything"})
    assert r.status_code == 200
    detail = api.get(f"/engagements/{engagement['id']}", headers=headers(world.mgr)).json()
    assert detail["tasks"][0]["title"] == "Collect data"


def test_dashboard_buckets_are_scoped_and_correct(api, world, engagement):
    today = business_today()
    t1, t2, t3 = (t["id"] for t in engagement["tasks"])
    # t1 due today, t2 overdue and waiting for client, t3 ready for review (overdue too: Aug period)
    api.patch(f"/tasks/{t1}", headers=headers(world.mgr), json={"due_date": today.isoformat(), "version": 1})
    transition(api, world.alice, t2, "START")
    transition(api, world.alice, t2, "WAIT_FOR_CLIENT", note="docs")
    api.patch(f"/tasks/{t3}", headers=headers(world.mgr), json={"assignee_id": world.bob.id, "version": 1})
    transition(api, world.bob, t3, "START")
    transition(api, world.bob, t3, "SUBMIT_FOR_REVIEW")

    mgr = api.get("/dashboard", headers=headers(world.mgr)).json()
    assert mgr["counts"] == {"open": 3, "overdue": 2, "due_today": 1, "waiting_for_client": 1, "waiting_for_review": 1}
    assert [t["id"] for t in mgr["lists"]["due_today"]] == [t1]
    assert [t["id"] for t in mgr["lists"]["waiting_for_review"]] == [t3]

    alice = api.get("/dashboard", headers=headers(world.alice)).json()
    assert alice["counts"] == {"open": 2, "overdue": 1, "due_today": 1, "waiting_for_client": 1, "waiting_for_review": 0}

    other_mgr = api.get("/dashboard", headers=headers(world.mgr2)).json()
    assert other_mgr["counts"]["open"] == 0


def test_task_filters_overdue_and_due_today(api, world, engagement):
    today = business_today().isoformat()
    t1 = engagement["tasks"][0]["id"]
    api.patch(f"/tasks/{t1}", headers=headers(world.mgr), json={"due_date": today, "version": 1})
    due_today = api.get("/tasks", headers=headers(world.alice), params={"due_today": True}).json()["items"]
    overdue = api.get("/tasks", headers=headers(world.alice), params={"overdue": True}).json()["items"]
    assert [t["id"] for t in due_today] == [t1]
    assert len(overdue) == 2 and all(t["is_overdue"] for t in overdue)


def test_task_history_includes_assignment_changes(api, world, engagement):
    t1 = engagement["tasks"][0]["id"]
    api.patch(f"/tasks/{t1}", headers=headers(world.mgr),
              json={"assignee_id": world.bob.id, "due_date": "2026-12-31", "version": 1})
    actions = [e["action"] for e in api.get(f"/tasks/{t1}/history", headers=headers(world.bob)).json()]
    assert actions == ["CREATED", "ASSIGNED", "DUE_DATE_CHANGED"]


def test_overlong_password_is_a_validation_error_not_a_crash(api, world):
    body = {"name": "Long", "email": "long@example.com", "password": "x" * 73, "role": "MEMBER"}
    r = api.post("/users", headers=headers(world.admin), json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = api.post("/users", headers=headers(world.admin), json={**body, "password": "é" * 40})  # 80 bytes
    assert r.status_code == 422
    r = api.post("/auth/login", json={"email": "alice@example.com", "password": "x" * 100})
    assert r.status_code == 401


def test_business_date_header_matches_server_today(api, world):
    r = api.get("/health")
    assert r.headers["x-business-date"] == business_today().isoformat()
