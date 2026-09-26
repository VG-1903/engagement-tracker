"""initial schema: users, clients, service types + templates, engagements, tasks, task_events

Key constraints:
- uq_engagements_recurring_period: partial UNIQUE (client_id, service_type_id, period_start)
  WHERE period_start IS NOT NULL  -> DB-level guard against duplicate recurring engagements
- uq_tasks_engagement_id_template_id: a template is instantiated once per engagement
- ck_service_types_recurrence_iff_recurring, ck_tasks_reviewer_not_assignee,
  ck_tasks_completed_at_iff_completed, ck_engagements_period_fields_together

Revision ID: 0001
Revises: 
Create Date: 2026-09-26 13:38:32.309339
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('clients',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('gstin', sa.String(length=15), nullable=True),
    sa.Column('contact_email', sa.String(length=254), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('gstin IS NULL OR char_length(gstin) = 15', name=op.f('ck_clients_gstin_length')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_clients')),
    sa.UniqueConstraint('gstin', name=op.f('uq_clients_gstin'))
    )
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('password_hash', sa.String(length=100), nullable=False),
    sa.Column('role', sa.Enum('ADMIN', 'MANAGER', 'MEMBER', name='user_role', native_enum=False, create_constraint=True, length=32), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('service_types',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_recurring', sa.Boolean(), nullable=False),
    sa.Column('recurrence', sa.Enum('MONTHLY', 'QUARTERLY', 'YEARLY', name='recurrence', native_enum=False, create_constraint=True, length=32), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('(recurrence IS NOT NULL) = is_recurring', name=op.f('ck_service_types_recurrence_iff_recurring')),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_service_types_created_by_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_service_types')),
    sa.UniqueConstraint('name', name=op.f('uq_service_types_name'))
    )
    op.create_table('engagements',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('client_id', sa.Integer(), nullable=False),
    sa.Column('service_type_id', sa.Integer(), nullable=False),
    sa.Column('period_start', sa.Date(), nullable=True),
    sa.Column('period_label', sa.String(length=32), nullable=True),
    sa.Column('manager_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'COMPLETED', name='engagement_status', native_enum=False, create_constraint=True, length=32), server_default='ACTIVE', nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('(period_start IS NULL) = (period_label IS NULL)', name=op.f('ck_engagements_period_fields_together')),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], name=op.f('fk_engagements_client_id_clients'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_engagements_created_by_users')),
    sa.ForeignKeyConstraint(['manager_id'], ['users.id'], name=op.f('fk_engagements_manager_id_users')),
    sa.ForeignKeyConstraint(['service_type_id'], ['service_types.id'], name=op.f('fk_engagements_service_type_id_service_types'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_engagements'))
    )
    op.create_index('ix_engagements_client_id_service_type_id', 'engagements', ['client_id', 'service_type_id'], unique=False)
    op.create_index('ix_engagements_manager_id', 'engagements', ['manager_id'], unique=False)
    op.create_index('uq_engagements_recurring_period', 'engagements', ['client_id', 'service_type_id', 'period_start'], unique=True, postgresql_where=sa.text('period_start IS NOT NULL'))
    op.create_table('task_templates',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('service_type_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('default_due_offset_days', sa.Integer(), nullable=False),
    sa.Column('sequence', sa.Integer(), nullable=False),
    sa.CheckConstraint('default_due_offset_days >= 0', name=op.f('ck_task_templates_offset_non_negative')),
    sa.ForeignKeyConstraint(['service_type_id'], ['service_types.id'], name=op.f('fk_task_templates_service_type_id_service_types'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_task_templates')),
    sa.UniqueConstraint('service_type_id', 'sequence', name=op.f('uq_task_templates_service_type_id_sequence'))
    )
    op.create_table('tasks',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('engagement_id', sa.Integer(), nullable=False),
    sa.Column('template_id', sa.Integer(), nullable=True),
    sa.Column('sequence', sa.Integer(), server_default='0', nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('assignee_id', sa.Integer(), nullable=True),
    sa.Column('reviewer_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('NOT_STARTED', 'IN_PROGRESS', 'WAITING_FOR_CLIENT', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'COMPLETED', name='task_status', native_enum=False, create_constraint=True, length=32), server_default='NOT_STARTED', nullable=False),
    sa.Column('due_date', sa.Date(), nullable=False),
    sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('version', sa.Integer(), server_default='1', nullable=False),
    sa.CheckConstraint("(status = 'COMPLETED') = (completed_at IS NOT NULL)", name=op.f('ck_tasks_completed_at_iff_completed')),
    sa.CheckConstraint('reviewer_id IS NULL OR reviewer_id <> assignee_id', name=op.f('ck_tasks_reviewer_not_assignee')),
    sa.CheckConstraint('version >= 1', name=op.f('ck_tasks_version_positive')),
    sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], name=op.f('fk_tasks_assignee_id_users')),
    sa.ForeignKeyConstraint(['engagement_id'], ['engagements.id'], name=op.f('fk_tasks_engagement_id_engagements'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], name=op.f('fk_tasks_reviewer_id_users')),
    sa.ForeignKeyConstraint(['template_id'], ['task_templates.id'], name=op.f('fk_tasks_template_id_task_templates'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tasks')),
    sa.UniqueConstraint('engagement_id', 'template_id', name=op.f('uq_tasks_engagement_id_template_id'))
    )
    op.create_index('ix_tasks_assignee_id_status', 'tasks', ['assignee_id', 'status'], unique=False)
    op.create_index('ix_tasks_engagement_id', 'tasks', ['engagement_id'], unique=False)
    op.create_index('ix_tasks_status_due_date', 'tasks', ['status', 'due_date'], unique=False)
    op.create_table('task_events',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('task_id', sa.BigInteger(), nullable=False),
    sa.Column('actor_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=40), nullable=False),
    sa.Column('from_status', sa.String(length=32), nullable=True),
    sa.Column('to_status', sa.String(length=32), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_task_events_actor_id_users')),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], name=op.f('fk_task_events_task_id_tasks'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_task_events'))
    )
    op.create_index('ix_task_events_task_id_created_at', 'task_events', ['task_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_task_events_task_id_created_at', table_name='task_events')
    op.drop_table('task_events')
    op.drop_index('ix_tasks_status_due_date', table_name='tasks')
    op.drop_index('ix_tasks_engagement_id', table_name='tasks')
    op.drop_index('ix_tasks_assignee_id_status', table_name='tasks')
    op.drop_table('tasks')
    op.drop_table('task_templates')
    op.drop_index('uq_engagements_recurring_period', table_name='engagements', postgresql_where=sa.text('period_start IS NOT NULL'))
    op.drop_index('ix_engagements_manager_id', table_name='engagements')
    op.drop_index('ix_engagements_client_id_service_type_id', table_name='engagements')
    op.drop_table('engagements')
    op.drop_table('service_types')
    op.drop_table('users')
    op.drop_table('clients')
