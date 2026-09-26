from fastapi import APIRouter, Response, status

from app.deps import DB, AdminUser, CurrentUser, ManagerOrAdmin
from app.models import EngagementStatus
from app.routers.common import DEFAULT, Cursor, Limit
from app.schemas import (
    EngagementCreate, EngagementDetail, EngagementSummary, GenerateDueIn, GenerateDueOut, GenerateNextOut, Page,
)
from app.services import engagements as svc

router = APIRouter(tags=["engagements"])


@router.post("/engagements", response_model=EngagementDetail, status_code=status.HTTP_201_CREATED)
def create_engagement(body: EngagementCreate, db: DB, user: ManagerOrAdmin):
    engagement_id = svc.create_engagement(db, user, body)
    return svc.get_detail(db, user, engagement_id)


@router.get("/engagements", response_model=Page[EngagementSummary])
def list_engagements(db: DB, user: CurrentUser, client_id: int | None = None, service_type_id: int | None = None,
                     status: EngagementStatus | None = None, limit: Limit = DEFAULT, cursor: Cursor = None):
    items, next_cursor = svc.list_engagements(db, user, client_id=client_id, service_type_id=service_type_id,
                                              status=status, limit=limit, cursor=cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.get("/engagements/{engagement_id}", response_model=EngagementDetail)
def get_engagement(engagement_id: int, db: DB, user: CurrentUser):
    return svc.get_detail(db, user, engagement_id)


@router.post("/engagements/{engagement_id}/generate-next", response_model=GenerateNextOut,
             responses={200: {"description": "Next period already existed; returned unchanged"},
                        201: {"description": "Next period created"}})
def generate_next(engagement_id: int, db: DB, user: ManagerOrAdmin, response: Response):
    new_id, created = svc.generate_next(db, user, engagement_id)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return GenerateNextOut(created=created, engagement=svc.get_detail(db, user, new_id))


@router.post("/admin/recurring/generate", response_model=GenerateDueOut, tags=["admin"])
def generate_due_recurring(db: DB, admin: AdminUser, body: GenerateDueIn | None = None):
    """What a nightly scheduler calls. Idempotent: safe to re-run for the same date."""
    return svc.generate_due_recurring(db, as_of=body.as_of if body else None, actor=admin)
