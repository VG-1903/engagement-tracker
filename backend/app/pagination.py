"""Keyset (cursor) pagination. Cursors are opaque base64 JSON of the last row's sort key.

Unlike OFFSET, the cost of fetching page N does not grow with N, and rows inserted while a user
pages through a list do not cause duplicates or skips.
"""

import base64
import json
from typing import Any

from app.errors import BusinessValidationError

DEFAULT_LIMIT = 25
MAX_LIMIT = 100


def encode_cursor(values: list[Any]) -> str:
    raw = json.dumps(values, default=str, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> list[Any] | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        values = json.loads(base64.urlsafe_b64decode(padded))
        if not isinstance(values, list):
            raise ValueError
        return values
    except ValueError as exc:
        raise BusinessValidationError("Invalid cursor.", code="INVALID_CURSOR") from exc


def page(rows: list[Any], limit: int, key: Any) -> tuple[list[Any], str | None]:
    """`rows` was fetched with limit + 1; the extra row tells us whether another page exists."""
    if len(rows) > limit:
        rows = rows[:limit]
        return rows, encode_cursor(key(rows[-1]))
    return rows, None
