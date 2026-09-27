"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Action, type TaskDetail, type TaskEvent, type TaskStatus, type User } from "@/lib/api";
import {
  ACTION_HINT,
  ACTION_LABEL,
  ACTION_NEEDS_NOTE,
  EVENT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  fmtDate,
  fmtDateTime,
  fmtPeriod,
  fmtShort,
  relativeDue,
} from "@/lib/format";
import { IconX } from "./icons";
import { useToast } from "./toast";
import { Avatar, Button, ErrorBanner, Field, Input, Person, Select, Skeleton, StatusBadge, Textarea, cx } from "./ui";

const REVIEW: Action[] = ["APPROVE", "REQUEST_CHANGES"];

/**
 * Side panel for one task. Status buttons come from the API's `allowed_actions`, so the UI never
 * re-implements workflow or permission rules; it renders what the server says this user may do.
 */
export function TaskDrawer(props: { taskId: number | null; onClose: () => void; onChanged?: () => void }) {
  if (props.taskId == null) return null;
  // keyed by task id: opening another task starts from fresh state
  return <Drawer key={props.taskId} {...props} taskId={props.taskId} />;
}

function Drawer({ taskId, onClose, onChanged }: { taskId: number; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Action | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async (id: number) => {
    const [t, h] = await Promise.all([api.task(id), api.taskHistory(id)]);
    setTask(t);
    setEvents(h);
    return t;
  }, []);

  useEffect(() => {
    Promise.all([api.task(taskId), api.taskHistory(taskId)])
      .then(([t, h]) => {
        setTask(t);
        setEvents(h);
        if (t.can_edit) api.assignableUsers().then(setUsers).catch(() => {});
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [taskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => Promise<unknown>, success: string) {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load(task.id);
      onChanged?.();
      setPending(null);
      setNote("");
      toast(success);
    } catch (e) {
      if (e instanceof ApiError && e.code === "STALE_VERSION") {
        setError("Someone else changed this task while you were looking at it. It has been refreshed; please try again.");
        await load(task.id);
      } else {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function clickAction(action: Action) {
    if (!task) return;
    if (ACTION_NEEDS_NOTE[action] || REVIEW.includes(action)) {
      setPending(action);
      setNote("");
      return;
    }
    run(() => api.transition(task.id, action, task.version), `${ACTION_LABEL[action]}: ${task.title}`);
  }

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in justify-end bg-ink/20" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={task?.title ?? "Task"}
        className="flex h-full w-full max-w-[560px] animate-slide-in flex-col bg-surface shadow-pop sm:border-l sm:border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
          <div className="min-w-0">
            {task ? (
              <>
                <Link
                  href={`/engagements/${task.engagement.id}`}
                  onClick={onClose}
                  className="text-[12.5px] text-muted transition-colors hover:text-ink"
                >
                  {task.engagement.client_name} · {task.engagement.service_type_name}
                  {task.engagement.period_label && ` · ${fmtPeriod(task.engagement.period_label)}`}
                </Link>
                <h2 className="mt-1 text-lg font-semibold leading-snug tracking-[-0.01em] text-ink">{task.title}</h2>
              </>
            ) : (
              <>
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="mt-2 h-6 w-64" />
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="-mr-2 rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-ink"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!task ? (
            error ? (
              <div className="p-6">
                <ErrorBanner error={error} />
              </div>
            ) : (
              <div className="space-y-4 p-6">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )
          ) : (
            <div className="space-y-7 px-6 py-5">
              {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}

              <Stepper status={task.status} />

              <dl className="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">
                <dt className="text-muted">Status</dt>
                <dd>
                  <StatusBadge status={task.status} variant="chip" />
                </dd>
                <dt className="text-muted">Due</dt>
                <dd className={cx(task.is_overdue ? "font-medium text-rose-700" : "text-ink-2")}>
                  {fmtDate(task.due_date)}
                  {task.status !== "COMPLETED" && (
                    <span className={cx("ml-2 font-normal", task.is_overdue ? "text-rose-600" : "text-muted")}>
                      {relativeDue(task.due_date, false)}
                    </span>
                  )}
                </dd>
                <dt className="text-muted">Assignee</dt>
                <dd>
                  <Person user={task.assignee} />
                </dd>
                <dt className="text-muted">Reviewer</dt>
                <dd>
                  <Person user={task.reviewer} empty="Engagement manager" />
                </dd>
                {task.completed_at && (
                  <>
                    <dt className="text-muted">Completed</dt>
                    <dd className="text-ink-2">{fmtDateTime(task.completed_at)}</dd>
                  </>
                )}
              </dl>

              {task.description && <p className="text-sm leading-relaxed text-ink-2">{task.description}</p>}

              <section>
                <h3 className="mb-2.5 text-xs font-medium uppercase tracking-[0.06em] text-faint">Next step</h3>
                {task.allowed_actions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line-strong px-3.5 py-3 text-[13px] text-muted">
                    {task.status === "COMPLETED"
                      ? "Done. This task was approved and is closed."
                      : task.status === "READY_FOR_REVIEW"
                        ? "Waiting for review. Someone other than the assignee has to approve it."
                        : "There's nothing for you to do on this task right now."}
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {task.allowed_actions.map((a, i) => {
                      const primary = i === 0 && pending !== a;
                      return (
                        <button
                          key={a}
                          disabled={busy}
                          onClick={() => clickAction(a)}
                          className={cx(
                            "rounded-lg border px-3.5 py-2.5 text-left transition-all active:translate-y-px disabled:opacity-50",
                            pending === a
                              ? "border-accent bg-accent-soft/60 ring-3 ring-accent/10"
                              : primary
                                ? "border-ink bg-ink hover:bg-ink-2"
                                : a === "REQUEST_CHANGES"
                                  ? "border-line-strong bg-surface hover:border-rose-300 hover:bg-rose-50/50"
                                  : "border-line-strong bg-surface hover:border-faint hover:bg-subtle",
                          )}
                        >
                          <div className={cx("text-[13.5px] font-medium", primary ? "text-white" : "text-ink")}>
                            {ACTION_LABEL[a]}
                          </div>
                          <div className={cx("text-xs", primary ? "text-white/60" : "text-muted")}>{ACTION_HINT[a]}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {pending && (
                  <form
                    className="mt-3 animate-pop-in space-y-3 rounded-lg border border-line bg-subtle/60 p-3.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        () => api.transition(task.id, pending, task.version, note),
                        `${ACTION_LABEL[pending]}: ${task.title}`,
                      );
                    }}
                  >
                    <Field label={ACTION_NEEDS_NOTE[pending] ?? "Add a note (optional)"}>
                      <Textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        required={!!ACTION_NEEDS_NOTE[pending]}
                        placeholder={pending === "APPROVE" ? "e.g. Checked against the sales register" : ""}
                        autoFocus
                      />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" type="button" variant="ghost" onClick={() => setPending(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        type="submit"
                        disabled={busy}
                        variant={pending === "REQUEST_CHANGES" ? "danger" : "primary"}
                      >
                        {ACTION_LABEL[pending]}
                      </Button>
                    </div>
                  </form>
                )}
              </section>

              {task.can_edit && <ManagerEdit key={task.version} task={task} users={users} busy={busy} run={run} />}

              <Activity events={events} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- workflow stepper */

const STEPS: { key: TaskStatus; label: string }[] = [
  { key: "NOT_STARTED", label: "Not started" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "READY_FOR_REVIEW", label: "Review" },
  { key: "COMPLETED", label: "Completed" },
];

function Stepper({ status }: { status: TaskStatus }) {
  const detour = status === "WAITING_FOR_CLIENT" || status === "CHANGES_REQUESTED";
  const complete = status === "COMPLETED";
  const current = detour ? 1 : STEPS.findIndex((s) => s.key === status);
  return (
    <div>
      <ol className="flex items-start" aria-label="Workflow progress">
        {STEPS.map((s, i) => {
          const done = i < current || complete;
          const here = i === current && !complete;
          return (
            <li key={s.key} className={cx("flex items-start", i < STEPS.length - 1 && "flex-1")}>
              <div className="flex w-16 flex-col items-center gap-1.5">
                <span
                  aria-current={here ? "step" : undefined}
                  className={cx(
                    "flex size-5 items-center justify-center rounded-full border transition-colors",
                    done && "border-ink bg-ink text-white",
                    here && !detour && "border-accent bg-surface ring-4 ring-accent/10",
                    here && status === "WAITING_FOR_CLIENT" && "border-amber-500 bg-surface ring-4 ring-amber-500/15",
                    here && status === "CHANGES_REQUESTED" && "border-rose-500 bg-surface ring-4 ring-rose-500/15",
                    !done && !here && "border-line-strong bg-surface",
                  )}
                >
                  {done ? (
                    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m2.5 6.5 2.2 2L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : here ? (
                    <span className={cx("size-1.5 rounded-full", detour ? STATUS_TONE[status].dot : "bg-accent")} />
                  ) : null}
                </span>
                <span className={cx("whitespace-nowrap text-[11.5px]", here || done ? "font-medium text-ink" : "text-faint")}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span className={cx("mt-2.5 h-px flex-1", i < current || complete ? "bg-ink" : "bg-line-strong")} />
              )}
            </li>
          );
        })}
      </ol>
      {detour && (
        <p className={cx("mt-3 rounded-md px-3 py-2 text-[12.5px]", STATUS_TONE[status].chip)}>
          {status === "WAITING_FOR_CLIENT"
            ? "On hold until the client responds. Resume once they do."
            : "Sent back by the reviewer. Resume work, fix it and resubmit."}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- manager edit */

function ManagerEdit({
  task,
  users,
  busy,
  run,
}: {
  task: TaskDetail;
  users: User[];
  busy: boolean;
  run: (fn: () => Promise<unknown>, success: string) => void;
}) {
  const [assignee, setAssignee] = useState(String(task.assignee?.id ?? ""));
  const [reviewer, setReviewer] = useState(String(task.reviewer?.id ?? ""));
  const [due, setDue] = useState(task.due_date);

  const changes: Record<string, unknown> = {};
  if (assignee !== String(task.assignee?.id ?? "")) changes.assignee_id = assignee ? Number(assignee) : null;
  if (reviewer !== String(task.reviewer?.id ?? "")) changes.reviewer_id = reviewer ? Number(reviewer) : null;
  if (due !== task.due_date) changes.due_date = due;
  const dirty = Object.keys(changes).length > 0;

  return (
    <section>
      <h3 className="mb-2.5 text-xs font-medium uppercase tracking-[0.06em] text-faint">Assignment & deadline</h3>
      <form
        className="rounded-lg border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.updateTask(task.id, { ...changes, version: task.version }), "Task updated");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assignee">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.role !== "MEMBER" ? ` (${u.role.toLowerCase()})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reviewer">
            <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">Engagement manager</option>
              {users
                .filter((u) => u.role !== "MEMBER")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
          </Field>
        </div>
        <div
          className={cx(
            "flex items-center justify-end gap-2 overflow-hidden transition-all duration-200",
            dirty ? "mt-4 max-h-12 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => {
              setAssignee(String(task.assignee?.id ?? ""));
              setReviewer(String(task.reviewer?.id ?? ""));
              setDue(task.due_date);
            }}
          >
            Discard
          </Button>
          <Button size="sm" type="submit" disabled={!dirty || busy}>
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

/* ---------------------------------------------------------------- activity */

function Activity({ events }: { events: TaskEvent[] }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-faint">Activity</h3>
      <ol>
        {events
          .slice()
          .reverse()
          .map((e, i, arr) => (
            <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < arr.length - 1 && <span className="absolute bottom-1 left-[11.5px] top-7 w-px bg-line" />}
              {e.actor ? (
                <Avatar name={e.actor.name} id={e.actor.id} />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-subtle text-[10px] font-semibold text-muted">
                  S
                </span>
              )}
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[13px] leading-snug text-ink-2">
                  <span className="font-medium text-ink">{e.actor?.name ?? "System"}</span>{" "}
                  {(EVENT_LABEL[e.action] ?? e.action).toLowerCase()}
                  {e.to_status && !["CREATED"].includes(e.action) && (
                    <span className="text-muted"> · {STATUS_LABEL[e.to_status as TaskStatus] ?? e.to_status}</span>
                  )}
                  {e.action === "DUE_DATE_CHANGED" && e.details && (
                    <span className="text-muted">
                      {" "}
                      · {fmtShort(String(e.details.from))} → {fmtShort(String(e.details.to))}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-faint">{fmtDateTime(e.created_at)}</p>
                {e.note && (
                  <p className="mt-2 rounded-lg border border-line bg-subtle/60 px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                    {e.note}
                  </p>
                )}
              </div>
            </li>
          ))}
      </ol>
    </section>
  );
}
