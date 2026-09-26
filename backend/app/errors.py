"""Domain errors and the single place where they are mapped to HTTP responses.

Every error response has the shape: {"error": {"code": str, "message": str, "details"?: any}}
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errors")


class DomainError(Exception):
    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message: str, *, code: str | None = None, details: Any = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details


class Unauthenticated(DomainError):
    status_code = 401
    code = "UNAUTHENTICATED"


class PermissionDenied(DomainError):
    status_code = 403
    code = "FORBIDDEN"


class NotFound(DomainError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(DomainError):
    status_code = 409
    code = "CONFLICT"


class InvalidTransition(Conflict):
    code = "INVALID_TRANSITION"


class StaleVersion(Conflict):
    code = "STALE_VERSION"


class Duplicate(Conflict):
    code = "DUPLICATE"


class BusinessValidationError(DomainError):
    """Input is well-formed but violates a business invariant (checked in the service layer)."""

    status_code = 422
    code = "VALIDATION_ERROR"


_HTTP_CODES = {400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND",
               405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 422: "VALIDATION_ERROR"}


def error_response(status: int, code: str, message: str, details: Any = None, headers=None) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = jsonable_encoder(details)
    return JSONResponse(status_code=status, content={"error": body}, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_: Request, exc: DomainError):
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        return error_response(exc.status_code, exc.code, exc.message, exc.details, headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        errors = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
        first = errors[0] if errors else {}
        field = ".".join(str(p) for p in (first.get("loc") or [])[1:]) or "request"
        return error_response(422, "VALIDATION_ERROR", f"{field}: {first.get('msg', 'invalid input')}", errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        return error_response(exc.status_code, _HTTP_CODES.get(exc.status_code, "HTTP_ERROR"), str(exc.detail))

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, exc: IntegrityError):
        # Services translate expected violations themselves; this is the safety net for races.
        sqlstate = getattr(exc.orig, "sqlstate", None)
        if sqlstate == "23505":  # unique_violation: lost a race with a concurrent insert
            log.warning("unique_violation", extra={"detail": str(exc.orig)})
            return error_response(409, "CONFLICT", "The change conflicts with existing data.")
        if sqlstate == "23503":  # foreign_key_violation: referenced row missing
            return error_response(422, "VALIDATION_ERROR", "A referenced record does not exist.")
        # NOT NULL / CHECK violations mean the service let bad data through: that is our bug.
        log.error("integrity_error", extra={"sqlstate": sqlstate, "detail": str(exc.orig)})
        return error_response(500, "INTERNAL_ERROR", "An unexpected error occurred.")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled_error")
        return error_response(500, "INTERNAL_ERROR", "An unexpected error occurred.")
