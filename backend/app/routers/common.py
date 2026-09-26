from typing import Annotated

from fastapi import Query

from app.pagination import DEFAULT_LIMIT, MAX_LIMIT

Limit = Annotated[int, Query(ge=1, le=MAX_LIMIT)]
Cursor = Annotated[str | None, Query(description="Opaque cursor from the previous page (next_cursor)")]
DEFAULT = DEFAULT_LIMIT
