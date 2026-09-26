"""Tests run against a real PostgreSQL database (partial indexes, ON CONFLICT and CHECK constraints are
part of what is being tested, so SQLite or mocks would prove nothing).

The schema is created by running the Alembic migrations, so the migrations are tested too.
"""

import os
from datetime import date
from types import SimpleNamespace

import pytest

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/engagement_test"
)
if not TEST_DB_URL.rsplit("/", 1)[-1].split("?")[0].endswith("_test"):
    raise RuntimeError("Refusing to run tests against a database whose name does not end in _test")
os.environ["DATABASE_URL"] = TEST_DB_URL  # must happen before the app (and its engine) is imported
os.environ.setdefault("BCRYPT_ROUNDS", "4")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import normalize_db_url  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Recurrence, Role  # noqa: E402
from app.schemas import ClientIn, ServiceTypeIn, TemplateIn, UserCreate  # noqa: E402
from app.security import create_access_token  # noqa: E402
from app.services import catalog  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["database_url"] = normalize_db_url(TEST_DB_URL)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE task_events, tasks, engagements, task_templates, service_types, clients, users "
                          "RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def api():
    return TestClient(app, raise_server_exceptions=False)


def headers(user) -> dict[str, str]:
    token, _ = create_access_token(user.id, user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world(db):
    """Two managers with their own members, a monthly recurring service and a one-time service."""
    mk = lambda name, role: catalog.create_user(  # noqa: E731
        db, UserCreate(name=name, email=f"{name.lower()}@example.com", password="Password@1", role=role))
    admin = mk("Admin", Role.ADMIN)
    mgr, mgr2 = mk("Manager", Role.MANAGER), mk("Manager2", Role.MANAGER)
    alice, bob = mk("Alice", Role.MEMBER), mk("Bob", Role.MEMBER)
    client = catalog.create_client(db, ClientIn(name="Acme Pvt Ltd", gstin="27AABCA1234F1Z5"))
    client2 = catalog.create_client(db, ClientIn(name="Globex LLP"))
    gst = catalog.create_service_type(db, admin, ServiceTypeIn(
        name="Monthly GST", is_recurring=True, recurrence=Recurrence.MONTHLY, templates=[
            TemplateIn(sequence=1, title="Collect data", default_due_offset_days=3),
            TemplateIn(sequence=2, title="File GSTR-1", default_due_offset_days=11),
            TemplateIn(sequence=3, title="File GSTR-3B", default_due_offset_days=20),
        ]))
    reg = catalog.create_service_type(db, admin, ServiceTypeIn(
        name="GST Registration", is_recurring=False, templates=[
            TemplateIn(sequence=1, title="Collect KYC", default_due_offset_days=3),
            TemplateIn(sequence=2, title="File REG-01", default_due_offset_days=7),
        ]))
    return SimpleNamespace(admin=admin, mgr=mgr, mgr2=mgr2, alice=alice, bob=bob, client=client, client2=client2,
                           gst=gst, reg=reg, period=date(2026, 8, 1))


@pytest.fixture
def engagement(api, world):
    """Monthly GST engagement for Aug 2026 managed by `mgr`, all tasks assigned to Alice."""
    r = api.post("/engagements", headers=headers(world.mgr), json={
        "client_id": world.client.id, "service_type_id": world.gst.id,
        "period_start": world.period.isoformat(), "default_assignee_id": world.alice.id})
    assert r.status_code == 201, r.text
    return r.json()


def transition(api, user, task_id: int, action: str, note: str | None = None, version: int | None = None):
    if version is None:
        version = api.get(f"/tasks/{task_id}", headers=headers(user)).json()["version"]
    return api.post(f"/tasks/{task_id}/transitions", headers=headers(user),
                    json={"action": action, "note": note, "version": version})


