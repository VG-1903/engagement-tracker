import type { Action, TaskStatus } from "./api";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CLIENT: "Waiting for client",
  READY_FOR_REVIEW: "Ready for review",
  CHANGES_REQUESTED: "Changes requested",
  COMPLETED: "Completed",
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700 ring-slate-200",
  IN_PROGRESS: "bg-sky-50 text-sky-800 ring-sky-200",
  WAITING_FOR_CLIENT: "bg-amber-50 text-amber-800 ring-amber-200",
  READY_FOR_REVIEW: "bg-violet-50 text-violet-800 ring-violet-200",
  CHANGES_REQUESTED: "bg-rose-50 text-rose-800 ring-rose-200",
  COMPLETED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export const ACTION_LABEL: Record<Action, string> = {
  START: "Start work",
  WAIT_FOR_CLIENT: "Waiting for client",
  RESUME: "Resume work",
  SUBMIT_FOR_REVIEW: "Submit for review",
  APPROVE: "Approve",
  REQUEST_CHANGES: "Request changes",
};

export const ACTION_NEEDS_NOTE: Partial<Record<Action, string>> = {
  WAIT_FOR_CLIENT: "What are you waiting for?",
  REQUEST_CHANGES: "What needs to change?",
};

export const EVENT_LABEL: Record<string, string> = {
  CREATED: "Created",
  ASSIGNED: "Assignee changed",
  REVIEWER_SET: "Reviewer changed",
  DUE_DATE_CHANGED: "Due date changed",
  ...ACTION_LABEL,
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

export function fmtDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function daysFrom(today: string, due: string): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+due.slice(0, 4), +due.slice(5, 7) - 1, +due.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
