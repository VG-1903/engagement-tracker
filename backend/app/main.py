import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_exception_handlers
from app.logging_setup import configure_logging
from app.routers import auth, clients, dashboard, engagements, service_types, tasks, users

configure_logging(settings.log_level)
log = logging.getLogger("app.http")

app = FastAPI(
    title="Engagement Tracker API",
    version="1.0.0",
    description="Task & engagement management for a CA / GST practice.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # bearer tokens, no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_log(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    log.info("request", extra={"request_id": request_id, "method": request.method, "path": request.url.path,
                               "status": response.status_code,
                               "duration_ms": round((time.perf_counter() - start) * 1000, 1)})
    return response


register_exception_handlers(app)
for module in (auth, users, clients, service_types, engagements, tasks, dashboard):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}
