from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas import LoginIn, TokenOut, UserOut
from app.services import catalog

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DB):
    token, expires_in, user = catalog.authenticate(db, body.email, body.password)
    return TokenOut(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
