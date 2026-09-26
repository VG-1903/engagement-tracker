from fastapi import APIRouter, Response, status

from app.deps import DB, AdminUser, CurrentUser
from app.schemas import ServiceTypeIn, ServiceTypeOut, ServiceTypeUpdate, TemplateIn, TemplateOut, TemplateUpdate
from app.services import catalog

router = APIRouter(tags=["service types"])


@router.get("/service-types", response_model=list[ServiceTypeOut])
def list_service_types(db: DB, _: CurrentUser):
    return catalog.list_service_types(db)


@router.get("/service-types/{st_id}", response_model=ServiceTypeOut)
def get_service_type(st_id: int, db: DB, _: CurrentUser):
    return catalog.get_service_type(db, st_id)


@router.post("/service-types", response_model=ServiceTypeOut, status_code=status.HTTP_201_CREATED)
def create_service_type(body: ServiceTypeIn, db: DB, admin: AdminUser):
    return catalog.create_service_type(db, admin, body)


@router.patch("/service-types/{st_id}", response_model=ServiceTypeOut)
def update_service_type(st_id: int, body: ServiceTypeUpdate, db: DB, _: AdminUser):
    return catalog.update_service_type(db, st_id, body)


@router.delete("/service-types/{st_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_type(st_id: int, db: DB, _: AdminUser):
    catalog.delete_service_type(db, st_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/service-types/{st_id}/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def add_template(st_id: int, body: TemplateIn, db: DB, _: AdminUser):
    return catalog.add_template(db, st_id, body)


@router.patch("/task-templates/{template_id}", response_model=TemplateOut)
def update_template(template_id: int, body: TemplateUpdate, db: DB, _: AdminUser):
    return catalog.update_template(db, template_id, body)


@router.delete("/task-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, db: DB, _: AdminUser):
    catalog.delete_template(db, template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
