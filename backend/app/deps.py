"""FastAPI dependencies for authentication and coarse role checks.

Role checks here answer "may this kind of user call this endpoint at all?". Object-level checks
("is this YOUR task / YOUR engagement?") live in the services, next to the data they protect.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import PermissionDenied, Unauthenticated
from app.models import Role, User
from app.security import decode_access_token

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise Unauthenticated("Missing bearer token.")
    user = db.get(User, decode_access_token(creds.credentials))
    if user is None or not user.is_active:
        raise Unauthenticated("User no longer exists or is deactivated.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[[User], User]:
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise PermissionDenied(f"This action requires role: {', '.join(r.value for r in roles)}.")
        return user

    return checker


AdminUser = Annotated[User, Depends(require_roles(Role.ADMIN))]
ManagerOrAdmin = Annotated[User, Depends(require_roles(Role.ADMIN, Role.MANAGER))]
