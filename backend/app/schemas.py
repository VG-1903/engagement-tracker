"""Pydantic v2 request/response models: shape and format validation at the HTTP edge.

Business invariants (who may do what, uniqueness, workflow) are re-checked in the services.
"""

import re
from datetime import date, datetime
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator

from app.domain.workflow import Action
from app.models import EngagementStatus, Recurrence, Role, TaskStatus

T = TypeVar("T")

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None


# ---------- auth ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserOut"


# ---------- users ----------
class UserRef(ORM):
    id: int
    name: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime


class UserCreate(BaseModel):
    name: Name
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Role


class UserUpdate(BaseModel):
    name: Name | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


# ---------- clients ----------
class ClientIn(BaseModel):
    name: Name
    gstin: str | None = None
    contact_email: EmailStr | None = None

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip().upper()
        if not GSTIN_RE.match(v):
            raise ValueError("GSTIN must be a valid 15-character GST identification number")
        return v


class ClientOut(ORM):
    id: int
    name: str
    gstin: str | None
    contact_email: str | None
    created_at: datetime


# ---------- service types & templates ----------
class TemplateIn(BaseModel):
    title: Name
    description: str | None = None
    default_due_offset_days: int = Field(ge=0, le=730)
    sequence: int = Field(ge=1, le=1000)


class TemplateUpdate(BaseModel):
    title: Name | None = None
    description: str | None = None
    default_due_offset_days: int | None = Field(default=None, ge=0, le=730)
    sequence: int | None = Field(default=None, ge=1, le=1000)


class TemplateOut(ORM):
    id: int
    service_type_id: int
    title: str
    description: str | None
    default_due_offset_days: int
    sequence: int


class ServiceTypeIn(BaseModel):
    name: Name
    description: str | None = None
    is_recurring: bool
    recurrence: Recurrence | None = None
    templates: list[TemplateIn] = []

    @model_validator(mode="after")
    def _recurrence_iff_recurring(self):
        if self.is_recurring != (self.recurrence is not None):
            raise ValueError("recurrence must be set if and only if is_recurring is true")
        if len({t.sequence for t in self.templates}) != len(self.templates):
            raise ValueError("template sequences must be unique")
        return self


class ServiceTypeUpdate(BaseModel):
    name: Name | None = None
    description: str | None = None


class ServiceTypeOut(ORM):
    id: int
    name: str
    description: str | None
    is_recurring: bool
    recurrence: Recurrence | None
    templates: list[TemplateOut]


# ---------- engagements ----------
class EngagementCreate(BaseModel):
    client_id: int
    service_type_id: int
    period_start: date | None = Field(default=None, description="Required for recurring services; first day of the period")
    start_date: date | None = Field(default=None, description="One-time services: base date for due dates (default today)")
    manager_id: int | None = Field(default=None, description="Defaults to the caller when the caller is a manager")
    default_assignee_id: int | None = None


class EngagementSummary(BaseModel):
    id: int
    client: "ClientRef"
    service_type: "ServiceTypeRef"
    period_start: date | None
    period_label: str | None
    label: str
    manager: UserRef
    status: EngagementStatus
    created_at: datetime
    task_counts: dict[str, int] = {}


class ClientRef(ORM):
    id: int
    name: str


class ServiceTypeRef(ORM):
    id: int
    name: str
    is_recurring: bool
    recurrence: Recurrence | None


class EngagementRef(BaseModel):
    id: int
    label: str
    client_name: str
    service_type_name: str
    period_label: str | None
    manager_id: int


class TaskOut(BaseModel):
    id: int
    title: str
    description: str | None
    status: TaskStatus
    due_date: date
    is_overdue: bool
    sequence: int
    engagement: EngagementRef
    assignee: UserRef | None
    reviewer: UserRef | None
    submitted_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime
    version: int


class TaskDetail(TaskOut):
    allowed_actions: list[Action]
    can_edit: bool


class EngagementDetail(EngagementSummary):
    tasks: list[TaskOut]
    can_manage: bool


class GenerateNextOut(BaseModel):
    created: bool
    engagement: EngagementDetail


class GenerateDueIn(BaseModel):
    as_of: date | None = Field(default=None, description="Generate periods up to the one containing this date (default today)")


class GenerateDueOut(BaseModel):
    as_of: date
    created: list[int]
    already_existed: int
    failed: list[dict[str, Any]]


# ---------- tasks ----------
class TransitionIn(BaseModel):
    action: Action
    note: Note | None = None
    version: int = Field(ge=1)


class TaskUpdate(BaseModel):
    """Manager/admin edits. Omitted fields are unchanged; explicit null clears assignee/reviewer."""

    assignee_id: int | None = None
    reviewer_id: int | None = None
    due_date: date | None = None
    version: int = Field(ge=1)

    @model_validator(mode="after")
    def _something(self):
        if not (self.model_fields_set - {"version"}):
            raise ValueError("provide at least one of assignee_id, reviewer_id, due_date")
        if "due_date" in self.model_fields_set and self.due_date is None:
            raise ValueError("due_date cannot be cleared")
        return self


class TaskEventOut(BaseModel):
    id: int
    action: str
    from_status: str | None
    to_status: str | None
    note: str | None
    details: dict[str, Any] | None
    actor: UserRef | None  # None = system (scheduled generation)
    created_at: datetime


# ---------- dashboard ----------
class DashboardOut(BaseModel):
    today: date
    counts: dict[str, int]
    lists: dict[str, list[TaskOut]]


TokenOut.model_rebuild()
EngagementSummary.model_rebuild()
EngagementDetail.model_rebuild()
