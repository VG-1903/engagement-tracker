"""Demo data. Everything is created through the real services, so the audit trail is genuine and
every seeded status was reached through legal workflow transitions.

Dates are relative to "today" so there are always overdue, due-today and upcoming tasks.
"""

from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import business_today
from app.domain import periods
from app.domain.workflow import Action
from app.models import Engagement, Recurrence, Role, Task, User
from app.schemas import ClientIn, EngagementCreate, ServiceTypeIn, TaskUpdate, TemplateIn, UserCreate
from app.services import catalog, engagements, tasks

A = Action
PASSWORDS = {Role.ADMIN: "Admin@123", Role.MANAGER: "Manager@123", Role.MEMBER: "Member@123"}

USERS = [
    ("Asha Admin", "admin@example.com", Role.ADMIN),
    ("Priya Sharma", "priya.manager@example.com", Role.MANAGER),
    ("Rahul Verma", "rahul.manager@example.com", Role.MANAGER),
    ("Anita Desai", "anita@example.com", Role.MEMBER),
    ("Karan Mehta", "karan@example.com", Role.MEMBER),
    ("Neha Iyer", "neha@example.com", Role.MEMBER),
    ("Vikram Singh", "vikram@example.com", Role.MEMBER),
]

CLIENTS = [
    ("Arora Textiles Pvt Ltd", "07AABCA1234F1Z5", "accounts@aroratextiles.example.com"),
    ("Bharat Agro Foods LLP", "27AAFFB5678K1Z2", "finance@bharatagro.example.com"),
    ("Coastal Logistics Pvt Ltd", "33AACCC9012M1Z8", "gst@coastallogistics.example.com"),
    ("Deccan Software Services", "36AADFD3456P1Z1", "cfo@deccansoft.example.com"),
    ("Evergreen Pharma Distributors", None, "owner@evergreenpharma.example.com"),
]

SERVICE_TYPES = [
    ServiceTypeIn(
        name="Monthly GST Compliance", is_recurring=True, recurrence=Recurrence.MONTHLY,
        description="GSTR-1 and GSTR-3B filing for the month. Due dates count from the end of the period.",
        templates=[
            TemplateIn(sequence=1, title="Collect sales & purchase data", default_due_offset_days=3,
                       description="Sales register, purchase invoices, debit/credit notes from the client."),
            TemplateIn(sequence=2, title="Reconcile purchases with GSTR-2B", default_due_offset_days=8,
                       description="Match ITC claimed in books against GSTR-2B; flag mismatches to the client."),
            TemplateIn(sequence=3, title="Prepare & file GSTR-1", default_due_offset_days=11),
            TemplateIn(sequence=4, title="Prepare & file GSTR-3B, pay tax", default_due_offset_days=20),
        ],
    ),
    ServiceTypeIn(
        name="GST Registration", is_recurring=False,
        description="New GSTIN registration (REG-01).",
        templates=[
            TemplateIn(sequence=1, title="Collect KYC & business documents", default_due_offset_days=3),
            TemplateIn(sequence=2, title="Prepare & submit REG-01 application", default_due_offset_days=7),
            TemplateIn(sequence=3, title="Respond to queries & obtain certificate", default_due_offset_days=21),
        ],
    ),
    ServiceTypeIn(
        name="GST Refund", is_recurring=False,
        description="Refund claim (RFD-01) for export / inverted duty structure.",
        templates=[
            TemplateIn(sequence=1, title="Compute refund & compile invoices", default_due_offset_days=7),
            TemplateIn(sequence=2, title="File RFD-01 with supporting statements", default_due_offset_days=14),
            TemplateIn(sequence=3, title="Follow up with officer until refund order", default_due_offset_days=45),
        ],
    ),
]

FULL = [A.START, A.SUBMIT_FOR_REVIEW, A.APPROVE]
NOTES = {A.WAIT_FOR_CLIENT: "Waiting for client to share documents.",
         A.REQUEST_CHANGES: "Figures do not tie to the sales register; please recheck."}


def reset(db: Session) -> None:
    db.execute(text("TRUNCATE task_events, tasks, engagements, task_templates, service_types, clients, users "
                    "RESTART IDENTITY CASCADE"))
    db.commit()


def seed(db: Session, force_reset: bool = False) -> None:
    if force_reset:
        reset(db)
    elif db.scalar(select(User.id).limit(1)) is not None:
        print("Database already has data; skipping. Use --reset to wipe and re-seed.")
        print_credentials()
        return

    today = business_today()
    users = {email: catalog.create_user(db, UserCreate(name=n, email=email, password=PASSWORDS[r], role=r))
             for n, email, r in USERS}
    admin = users["admin@example.com"]
    priya, rahul = users["priya.manager@example.com"], users["rahul.manager@example.com"]
    anita, karan, neha, vikram = (users[e] for e in
                                  ("anita@example.com", "karan@example.com", "neha@example.com", "vikram@example.com"))

    clients = [catalog.create_client(db, ClientIn(name=n, gstin=g, contact_email=e)) for n, g, e in CLIENTS]
    gst, reg, refund = (catalog.create_service_type(db, admin, st) for st in SERVICE_TYPES)

    def by_user(u: User) -> User:
        return db.get(User, u.id)

    def create(manager: User, client, st, *, period=None, start=None, assignee: User) -> Engagement:
        eid = engagements.create_engagement(db, by_user(manager), EngagementCreate(
            client_id=client.id, service_type_id=st.id, period_start=period, start_date=start,
            default_assignee_id=assignee.id))
        return db.get(Engagement, eid)

    def task_ids(e: Engagement) -> list[int]:
        return list(db.scalars(select(Task.id).where(Task.engagement_id == e.id).order_by(Task.sequence)))

    def move(task_id: int, *actions: Action) -> None:
        for action in actions:
            task = db.get(Task, task_id)
            db.refresh(task)
            e = db.get(Engagement, task.engagement_id)
            actor = e.manager if action in (A.APPROVE, A.REQUEST_CHANGES) else task.assignee
            tasks.transition(db, by_user(actor), task_id, action, NOTES.get(action), task.version)

    def edit(manager: User, task_id: int, **changes) -> None:
        task = db.get(Task, task_id)
        db.refresh(task)
        tasks.update_task(db, by_user(manager), task_id, TaskUpdate(version=task.version, **changes))

    cur = periods.period_start_for(today, Recurrence.MONTHLY)
    prev = cur - timedelta(days=1)
    prev = prev.replace(day=1)
    prev2 = (prev - timedelta(days=1)).replace(day=1)

    staffing = [(clients[0], priya, anita), (clients[1], priya, karan), (clients[2], rahul, neha), (clients[3], rahul, vikram)]

    # Two months ago: fully completed.
    for client, mgr, member in staffing:
        for tid in task_ids(create(mgr, client, gst, period=prev2, assignee=member)):
            move(tid, *FULL)

    # Last month: filing deadlines have passed, so unfinished work is overdue.
    last = [task_ids(create(mgr, client, gst, period=prev, assignee=member)) for client, mgr, member in staffing]
    move(last[0][0], *FULL); move(last[0][1], *FULL)
    move(last[0][2], A.START, A.SUBMIT_FOR_REVIEW)
    move(last[0][3], A.START)
    move(last[1][0], *FULL)
    move(last[1][1], A.START, A.WAIT_FOR_CLIENT)
    move(last[2][0], A.START, A.SUBMIT_FOR_REVIEW, A.REQUEST_CHANGES)
    move(last[3][0], *FULL); move(last[3][1], *FULL); move(last[3][2], *FULL)
    move(last[3][3], A.START, A.SUBMIT_FOR_REVIEW)

    # Current month: upcoming work; a couple of items pulled in to today.
    current = [task_ids(create(mgr, client, gst, period=cur, assignee=member)) for client, mgr, member in staffing]
    edit(priya, current[0][0], due_date=today)
    move(current[0][0], A.START)
    edit(rahul, current[2][0], due_date=today)
    move(current[3][0], A.START)

    # One-time engagements.
    reg_tasks = task_ids(create(rahul, clients[4], reg, start=today - timedelta(days=10), assignee=neha))
    move(reg_tasks[0], *FULL)
    move(reg_tasks[1], A.START)
    edit(rahul, reg_tasks[2], due_date=today)

    refund_tasks = task_ids(create(priya, clients[1], refund, start=today - timedelta(days=20), assignee=karan))
    move(refund_tasks[0], *FULL)
    move(refund_tasks[1], A.START, A.WAIT_FOR_CLIENT)
    # The manager is doing this one herself, so Rahul is the designated reviewer (she cannot approve it).
    edit(priya, refund_tasks[2], assignee_id=priya.id, reviewer_id=rahul.id)
    move(refund_tasks[2], A.START, A.SUBMIT_FOR_REVIEW)

    total = db.scalar(select(text("count(*)")).select_from(Task))
    print(f"Seeded {len(USERS)} users, {len(CLIENTS)} clients, 3 service types, {total} tasks (today = {today}).")
    print_credentials()


def print_credentials() -> None:
    print("\nDemo logins:")
    for name, email, role in USERS:
        print(f"  {role.value:<8} {email:<28} {PASSWORDS[role]:<12} ({name})")
