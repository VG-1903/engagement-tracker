"""SQLAlchemy 2.0 typed models. The Alembic migration in alembic/versions mirrors these exactly."""

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class Role(StrEnum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    MEMBER = "MEMBER"


class Recurrence(StrEnum):
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"
    YEARLY = "YEARLY"


class EngagementStatus(StrEnum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"


class TaskStatus(StrEnum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_CLIENT = "WAITING_FOR_CLIENT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    COMPLETED = "COMPLETED"


def str_enum(enum_cls: type[StrEnum], name: str) -> SAEnum:
    # VARCHAR + CHECK instead of a native PG enum: adding a status later is a one-line migration
    # and never needs ALTER TYPE outside a transaction.
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        validate_strings=True,
        values_callable=lambda e: [m.value for m in e],
    )


created_at_col = lambda: mapped_column(  # noqa: E731
    DateTime(timezone=True), server_default=func.now(), nullable=False
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)  # stored lower-cased by the service
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(str_enum(Role, "user_role"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), default=True)
    created_at: Mapped[datetime] = created_at_col()


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (CheckConstraint("gstin IS NULL OR char_length(gstin) = 15", name="gstin_length"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    gstin: Mapped[str | None] = mapped_column(String(15), unique=True)
    contact_email: Mapped[str | None] = mapped_column(String(254))
    created_at: Mapped[datetime] = created_at_col()


class ServiceType(Base):
    __tablename__ = "service_types"
    __table_args__ = (
        CheckConstraint("(recurrence IS NOT NULL) = is_recurring", name="recurrence_iff_recurring"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_recurring: Mapped[bool] = mapped_column(Boolean)
    recurrence: Mapped[Recurrence | None] = mapped_column(str_enum(Recurrence, "recurrence"))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = created_at_col()

    templates: Mapped[list["TaskTemplate"]] = relationship(
        back_populates="service_type", order_by="TaskTemplate.sequence", cascade="all, delete-orphan"
    )


class TaskTemplate(Base):
    __tablename__ = "task_templates"
    __table_args__ = (
        UniqueConstraint("service_type_id", "sequence"),
        CheckConstraint("default_due_offset_days >= 0", name="offset_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    service_type_id: Mapped[int] = mapped_column(ForeignKey("service_types.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    default_due_offset_days: Mapped[int] = mapped_column(Integer)
    sequence: Mapped[int] = mapped_column(Integer)

    service_type: Mapped[ServiceType] = relationship(back_populates="templates")


class Engagement(Base):
    __tablename__ = "engagements"
    __table_args__ = (
        CheckConstraint("(period_start IS NULL) = (period_label IS NULL)", name="period_fields_together"),
        # The database-level duplicate guard for recurring work: one engagement per client/service/period.
        # Partial, so one-time services (period_start NULL) can have many engagements per client.
        Index(
            "uq_engagements_recurring_period",
            "client_id", "service_type_id", "period_start",
            unique=True,
            postgresql_where=text("period_start IS NOT NULL"),
        ),
        Index("ix_engagements_client_id_service_type_id", "client_id", "service_type_id"),
        Index("ix_engagements_manager_id", "manager_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="RESTRICT"))
    service_type_id: Mapped[int] = mapped_column(ForeignKey("service_types.id", ondelete="RESTRICT"))
    period_start: Mapped[date | None] = mapped_column(Date)
    period_label: Mapped[str | None] = mapped_column(String(32))
    manager_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[EngagementStatus] = mapped_column(
        str_enum(EngagementStatus, "engagement_status"), default=EngagementStatus.ACTIVE,
        server_default=EngagementStatus.ACTIVE.value,
    )
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = created_at_col()

    client: Mapped[Client] = relationship()
    service_type: Mapped[ServiceType] = relationship()
    manager: Mapped[User] = relationship(foreign_keys=[manager_id])
    tasks: Mapped[list["Task"]] = relationship(back_populates="engagement", order_by="Task.sequence")

    @property
    def label(self) -> str:
        return f"{self.client.name} · {self.service_type.name} · {self.period_label or 'One-time'}"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        # A template is instantiated at most once per engagement (NULL template_id = ad-hoc task).
        UniqueConstraint("engagement_id", "template_id"),
        CheckConstraint("reviewer_id IS NULL OR reviewer_id <> assignee_id", name="reviewer_not_assignee"),
        CheckConstraint("(status = 'COMPLETED') = (completed_at IS NOT NULL)", name="completed_at_iff_completed"),
        CheckConstraint("version >= 1", name="version_positive"),
        Index("ix_tasks_assignee_id_status", "assignee_id", "status"),
        Index("ix_tasks_status_due_date", "status", "due_date"),
        Index("ix_tasks_engagement_id", "engagement_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    engagement_id: Mapped[int] = mapped_column(ForeignKey("engagements.id", ondelete="CASCADE"))
    template_id: Mapped[int | None] = mapped_column(ForeignKey("task_templates.id", ondelete="SET NULL"))
    sequence: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[TaskStatus] = mapped_column(
        str_enum(TaskStatus, "task_status"), default=TaskStatus.NOT_STARTED,
        server_default=TaskStatus.NOT_STARTED.value,
    )
    due_date: Mapped[date] = mapped_column(Date)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Optimistic locking: every UPDATE is issued as "... WHERE id = :id AND version = :old".
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    engagement: Mapped[Engagement] = relationship(back_populates="tasks")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    reviewer: Mapped[User | None] = relationship(foreign_keys=[reviewer_id])

    __mapper_args__ = {"version_id_col": version}


class TaskEvent(Base):
    """Append-only audit trail. Written in the same transaction as the change it describes."""

    __tablename__ = "task_events"
    __table_args__ = (Index("ix_task_events_task_id_created_at", "task_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # NULL = system (scheduler)
    action: Mapped[str] = mapped_column(String(40))
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str | None] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created_at_col()

    actor: Mapped[User | None] = relationship()
