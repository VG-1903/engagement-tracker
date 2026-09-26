from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas import DashboardOut
from app.services.dashboard import get_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DB, user: CurrentUser):
    return get_dashboard(db, user)
