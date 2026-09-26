from fastapi import APIRouter, Response, status

from app.deps import DB, AdminUser, ManagerOrAdmin
from app.routers.common import DEFAULT, Cursor, Limit
from app.schemas import ClientIn, ClientOut, Page
from app.services import catalog

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=Page[ClientOut])
def list_clients(db: DB, _: ManagerOrAdmin, q: str | None = None, limit: Limit = DEFAULT, cursor: Cursor = None):
    items, next_cursor = catalog.list_clients(db, q=q, limit=limit, cursor=cursor)
    return Page(items=items, next_cursor=next_cursor)


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create_client(body: ClientIn, db: DB, _: AdminUser):
    return catalog.create_client(db, body)


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: int, body: ClientIn, db: DB, _: AdminUser):
    return catalog.update_client(db, client_id, body)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: DB, _: AdminUser):
    catalog.delete_client(db, client_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
