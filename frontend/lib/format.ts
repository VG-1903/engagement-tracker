import type { Action, TaskStatus } from "./api";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING_FOR_CLIENT: "Waiting for client",
  READY_FOR_REVIEW: "Ready for review",
  CHANGES_REQUESTED: "Changes requested",
  COMPLETED: "Completed",
};

/** Dot colour + soft tint per status. Kept low-saturation on purpose. */
export const STATUS_TONE: Record<TaskStatus, { dot: string; chip: string; bar: string }> = {
  NOT_STARTED: { dot: "bg-stone-400", chip: "bg-stone-100 text-stone-600", bar: "bg-stone-300" },
  IN_PROGRESS: { dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800", bar: "bg-sky-400" },
  WAITING_FOR_CLIENT: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800", bar: "bg-amber-400" },
  READY_FOR_REVIEW: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-800", bar: "bg-violet-400" },
  CHANGES_REQUESTED: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-800", bar: "bg-rose-400" },
  COMPLETED: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800", bar: "bg-emerald-500" },
};

export const STATUS_ORDER: TaskStatus[] = [
  "COMPLETED",
  "READY_FOR_REVIEW",
  "IN_PROGRESS",
  "CHANGES_REQUESTED",
  "WAITING_FOR_CLIENT",
  "NOT_STARTED",
];

export const ACTION_LABEL: Record<Action, string> = {
  START: "Start work",
  WAIT_FOR_CLIENT: "Waiting on client",
  RESUME: "Resume work",
  SUBMIT_FOR_REVIEW: "Submit for review",
  APPROVE: "Approve",
  REQUEST_CHANGES: "Request changes",
};

export const ACTION_HINT: Record<Action, string> = {
  START: "Move to In progress",
  WAIT_FOR_CLIENT: "Pause until the client responds",
  RESUME: "Back to In progress",
  SUBMIT_FOR_REVIEW: "Send to your manager",
  APPROVE: "Mark as completed",
  REQUEST_CHANGES: "Send back for correction",
};

export const ACTION_NEEDS_NOTE: Partial<Record<Action, string>> = {
  WAIT_FOR_CLIENT: "What are you waiting for from the client?",
  REQUEST_CHANGES: "What needs to change?",
};

export const EVENT_LABEL: Record<string, string> = {
  CREATED: "Created",
  ASSIGNED: "Reassigned",
  REVIEWER_SET: "Reviewer changed",
  DUE_DATE_CHANGED: "Due date changed",
  START: "Started work",
  WAIT_FOR_CLIENT: "Waiting on client",
  RESUME: "Resumed work",
  SUBMIT_FOR_REVIEW: "Submitted for review",
  APPROVE: "Approved",
  REQUEST_CHANGES: "Requested changes",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(parseDay(iso)) : "—";
}

export function fmtShort(iso: string): string {
  return shortFmt.format(parseDay(iso));
}

export function fmtLong(iso: string): string {
  return longFmt.format(parseDay(iso));
}

export function fmtDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDay(toIso).getTime() - parseDay(fromIso).getTime()) / 86_400_000);
}

/** "Due today", "Tomorrow", "In 4 days", "3 days overdue" */
export function relativeDue(due: string, completed: boolean, today = todayIso()): string {
  if (completed) return fmtShort(due);
  const d = daysBetween(today, due);
  if (d === 0) return "Due today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "1 day overdue";
  if (d < 0) return `${-d} days overdue`;
  if (d <= 14) return `In ${d} days`;
  return fmtShort(due);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" });

/** "2026-09" -> "Sep 2026"; financial-year labels ("FY2026-27 Q2") are already readable. */
export function fmtPeriod(label: string | null | undefined): string {
  if (!label) return "One-time";
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  return m ? monthFmt.format(new Date(Number(m[1]), Number(m[2]) - 1, 1)) : label;
}
