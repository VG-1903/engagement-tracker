"""Admin-managed reference data: users, clients, service types and task templates."""

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db import transaction
from app.errors import Conflict, Duplicate, NotFound, Unauthenticated
from app.models import Client, Engagement, Role, ServiceType, TaskTemplate, User
from app.pagination import decode_cursor, page
from app.schemas import (
    ClientIn, ServiceTypeIn, ServiceTypeUpdate, TemplateIn, TemplateUpdate, UserCreate, UserUpdate,
)
from app.security import DUMMY_HASH, create_access_token, hash_password, verify_password


def _id_page(db: Session, stmt, model, limit: int, cursor: str | None):
    if (after := decode_cursor(cursor)) is not None:
        stmt = stmt.where(model.id > int(after[0]))
    rows = list(db.scalars(stmt.order_by(model.id).limit(limit + 1)))
    return page(rows, limit, lambda r: [r.id])


def _or_404(db: Session, model, id_: int, what: str):
    obj = db.get(model, id_)
    if obj is None:
        raise NotFound(f"{what} not found.")
    return obj


# ---------- auth ----------
def authenticate(db: Session, email: str, password: str) -> tuple[str, int, User]:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        verify_password(password, DUMMY_HASH)  # constant-ish time for unknown emails
        raise Unauthenticated("Invalid email or password.", code="INVALID_CREDENTIALS")
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise Unauthenticated("Invalid email or password.", code="INVALID_CREDENTIALS")
    token, expires_in = create_access_token(user.id, user.role.value)
    return token, expires_in, user


# ---------- users ----------
def list_users(db: Session, *, role: Role | None, active: bool | None, limit: int, cursor: str | None):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if active is not None:
        stmt = stmt.where(User.is_active.is_(active))
    return _id_page(db, stmt, User, limit, cursor)


def create_user(db: Session, data: UserCreate) -> User:
    user = User(name=data.name, email=data.email.lower(), password_hash=hash_password(data.password),
                role=data.role, is_active=True)
    try:
        with transaction(db):
            db.add(user)
    except IntegrityError as exc:
        raise Duplicate("A user with this email already exists.", code="DUPLICATE_EMAIL") from exc
    return user


def update_user(db: Session, admin: User, user_id: int, data: UserUpdate) -> User:
    with transaction(db):
        user = _or_404(db, User, user_id, "User")
        if user.id == admin.id and (data.is_active is False or (data.role and data.role != Role.ADMIN)):
            raise Conflict("You cannot deactivate or demote your own account.", code="SELF_LOCKOUT")
        if data.name is not None:
            user.name = data.name
        if data.role is not None:
            user.role = data.role
        if data.is_active is not None:
            user.is_active = data.is_active
        if data.password:
            user.password_hash = hash_password(data.password)
    return user


def deactivate_user(db: Session, admin: User, user_id: int) -> User:
    """Users are never hard-deleted: they are referenced by tasks and the audit trail."""
    return update_user(db, admin, user_id, UserUpdate(is_active=False))


# ---------- clients ----------
def list_clients(db: Session, *, q: str | None, limit: int, cursor: str | None):
    stmt = select(Client)
    if q:
        stmt = stmt.where(Client.name.ilike(f"%{q}%"))
    return _id_page(db, stmt, Client, limit, cursor)


def _save_client(db: Session, client: Client, data: ClientIn) -> Client:
    client.name, client.gstin, client.contact_email = data.name, data.gstin, data.contact_email
    try:
        with transaction(db):
            db.add(client)
    except IntegrityError as exc:
        raise Duplicate("A client with this GSTIN already exists.", code="DUPLICATE_GSTIN") from exc
    return client


def create_client(db: Session, data: ClientIn) -> Client:
    return _save_client(db, Client(), data)


def update_client(db: Session, client_id: int, data: ClientIn) -> Client:
    return _save_client(db, _or_404(db, Client, client_id, "Client"), data)


def delete_client(db: Session, client_id: int) -> None:
    with transaction(db):
        client = _or_404(db, Client, client_id, "Client")
        if db.scalar(select(exists().where(Engagement.client_id == client_id))):
            raise Conflict("Client has engagements and cannot be deleted.", code="IN_USE")
        db.delete(client)


# ---------- service types ----------
def list_service_types(db: Session) -> list[ServiceType]:
    return list(db.scalars(select(ServiceType).options(selectinload(ServiceType.templates)).order_by(ServiceType.name)))


def get_service_type(db: Session, st_id: int) -> ServiceType:
    st = db.scalars(select(ServiceType).options(selectinload(ServiceType.templates))
                    .where(ServiceType.id == st_id)).one_or_none()
    if st is None:
        raise NotFound("Service type not found.")
    return st


def create_service_type(db: Session, admin: User, data: ServiceTypeIn) -> ServiceType:
    st = ServiceType(name=data.name, description=data.description, is_recurring=data.is_recurring,
                     recurrence=data.recurrence, created_by=admin.id,
                     templates=[TaskTemplate(**t.model_dump()) for t in data.templates])
    try:
        with transaction(db):
            db.add(st)
    except IntegrityError as exc:
        raise Duplicate("A service type with this name already exists.", code="DUPLICATE_NAME") from exc
    return get_service_type(db, st.id)


def update_service_type(db: Session, st_id: int, data: ServiceTypeUpdate) -> ServiceType:
    """Recurrence is immutable once created: existing engagements' periods depend on it."""
    try:
        with transaction(db):
            st = get_service_type(db, st_id)
            if data.name is not None:
                st.name = data.name
            if "description" in data.model_fields_set:
                st.description = data.description
    except IntegrityError as exc:
        raise Duplicate("A service type with this name already exists.", code="DUPLICATE_NAME") from exc
    return get_service_type(db, st_id)


def delete_service_type(db: Session, st_id: int) -> None:
    with transaction(db):
        st = get_service_type(db, st_id)
        if db.scalar(select(exists().where(Engagement.service_type_id == st_id))):
            raise Conflict("Service type has engagements and cannot be deleted.", code="IN_USE")
        db.delete(st)


# ---------- templates ----------
# Templates are blueprints: editing one never changes tasks already generated from it.
def add_template(db: Session, st_id: int, data: TemplateIn) -> TaskTemplate:
    get_service_type(db, st_id)
    tpl = TaskTemplate(service_type_id=st_id, **data.model_dump())
    try:
        with transaction(db):
            db.add(tpl)
    except IntegrityError as exc:
        raise Duplicate("Another template already uses this sequence number.", code="DUPLICATE_SEQUENCE") from exc
    return tpl


def update_template(db: Session, template_id: int, data: TemplateUpdate) -> TaskTemplate:
    try:
        with transaction(db):
            tpl = _or_404(db, TaskTemplate, template_id, "Template")
            for k, v in data.model_dump(exclude_unset=True).items():
                if v is not None or k == "description":
                    setattr(tpl, k, v)
    except IntegrityError as exc:
        raise Duplicate("Another template already uses this sequence number.", code="DUPLICATE_SEQUENCE") from exc
    return tpl


def delete_template(db: Session, template_id: int) -> None:
    with transaction(db):
        tpl = _or_404(db, TaskTemplate, template_id, "Template")
        db.delete(tpl)  # generated tasks keep their data; tasks.template_id becomes NULL


def assignable_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.name)))

