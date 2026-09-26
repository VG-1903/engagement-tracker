from fastapi import APIRouter, status

from app.deps import DB, AdminUser, ManagerOrAdmin
from app.models import Role
from app.routers.common import DEFAULT, Cursor, Limit
from app.schemas import Page, UserCreate, UserOut, UserUpdate
from app.services import catalog

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=Page[UserOut])
def list_users(db: DB, _: AdminUser, role: Role | None = None, active: bool | None = None,
               limit: Limit = DEFAULT, cursor: Cursor = None):
    items, next_cursor = catalog.list_users(db, role=role, active=active, limit=limit, cursor=cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.get("/assignable", response_model=list[UserOut])
def assignable(db: DB, _: ManagerOrAdmin):
    """Active users, for assignee / reviewer pickers."""
    return catalog.assignable_users(db)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: DB, _: AdminUser):
    return catalog.create_user(db, body)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: DB, admin: AdminUser):
    return catalog.update_user(db, admin, user_id, body)


@router.delete("/{user_id}", response_model=UserOut)
def deactivate_user(user_id: int, db: DB, admin: AdminUser):
    """Soft delete: users are referenced by tasks and the audit trail."""
    return catalog.deactivate_user(db, admin, user_id)
