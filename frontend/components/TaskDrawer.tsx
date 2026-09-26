"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Action, type TaskDetail, type TaskEvent, type User } from "@/lib/api";
import { ACTION_LABEL, ACTION_NEEDS_NOTE, EVENT_LABEL, STATUS_LABEL, fmtDate, fmtDateTime } from "@/lib/format";
import { Button, ErrorBanner, Field, Input, Select, Spinner, StatusBadge, Textarea, cx } from "./ui";

const REVIEW_ACTIONS: Action[] = ["APPROVE", "REQUEST_CHANGES"];

/**
 * Side panel for one task. The status buttons come from the API's `allowed_actions`, so the UI
 * never re-implements workflow or permission rules; it only renders what the server allows.
 */
export function TaskDrawer(props: { taskId: number | null; onClose: () => void; onChanged?: () => void }) {
  if (props.taskId == null) return null;
  // keyed by task id: opening another task starts from fresh state
  return <Drawer key={props.taskId} {...props} taskId={props.taskId} />;
}

function Drawer({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
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

  async function run(fn: () => Promise<unknown>) {
    if (!task) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load(task.id);
      onChanged?.();
      setPendingAction(null);
      setNote("");
    } catch (e) {
      if (e instanceof ApiError && e.code === "STALE_VERSION") {
        setError("Someone else updated this task. It has been reloaded; please review and try again.");
        await load(task.id);
      } else {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function clickAction(action: Action) {
    if (ACTION_NEEDS_NOTE[action] || REVIEW_ACTIONS.includes(action)) {
      setPendingAction(action);
      return;
    }
    run(() => api.transition(task!.id, action, task!.version));
  }

  const managers = users.filter((u) => u.role !== "MEMBER");

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Task details"
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            {task ? (
              <>
                <Link
                  href={`/engagements/${task.engagement.id}`}
                  className="text-xs font-medium text-indigo-700 hover:underline"
                  onClick={onClose}
                >
                  {task.engagement.label}
                </Link>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{task.title}</h2>
              </>
            ) : (
              <h2 className="text-lg font-semibold text-slate-900">Task</h2>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>

        {!task ? (
          error ? (
            <div className="p-6">
              <ErrorBanner error={error} />
            </div>
          ) : (
            <Spinner />
          )
        ) : (
          <div className="space-y-6 px-6 py-5">
            <ErrorBanner error={error} />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={task.status} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Due</dt>
                <dd className={cx("mt-0.5 font-medium", task.is_overdue ? "text-rose-700" : "text-slate-900")}>
                  {fmtDate(task.due_date)} {task.is_overdue && "· overdue"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Assignee</dt>
                <dd className="mt-0.5 text-slate-900">{task.assignee?.name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Reviewer</dt>
                <dd className="mt-0.5 text-slate-900">{task.reviewer?.name ?? "Engagement manager"}</dd>
              </div>
            </dl>
            {task.description && <p className="text-sm text-slate-600">{task.description}</p>}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Actions</h3>
              {task.allowed_actions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {task.status === "COMPLETED"
                    ? "This task is complete."
                    : "No status changes are available to you for this task right now."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {task.allowed_actions.map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      disabled={busy}
                      variant={a === "APPROVE" ? "primary" : a === "REQUEST_CHANGES" ? "danger" : "secondary"}
                      onClick={() => clickAction(a)}
                    >
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>
              )}
              {pendingAction && (
                <form
                  className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => api.transition(task.id, pendingAction, task.version, note));
                  }}
                >
                  <Field label={ACTION_NEEDS_NOTE[pendingAction] ?? "Note (optional)"}>
                    <Textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required={!!ACTION_NEEDS_NOTE[pendingAction]}
                      autoFocus
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button size="sm" type="submit" disabled={busy}>
                      {ACTION_LABEL[pendingAction]}
                    </Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => setPendingAction(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </section>

            {task.can_edit && (
              <ManagerEdit key={task.version} task={task} users={users} managers={managers} busy={busy} run={run} />
            )}

            <section>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">History</h3>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {events
                  .slice()
                  .reverse()
                  .map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500 ring-1 ring-indigo-200" />
                      <div className="text-sm text-slate-900">
                        <span className="font-medium">{EVENT_LABEL[e.action] ?? e.action}</span>
                        {e.from_status && e.to_status && (
                          <span className="text-slate-500">
                            {" "}
                            · {STATUS_LABEL[e.from_status as keyof typeof STATUS_LABEL]} →{" "}
                            {STATUS_LABEL[e.to_status as keyof typeof STATUS_LABEL]}
                          </span>
                        )}
                        {e.action === "DUE_DATE_CHANGED" && e.details && (
                          <span className="text-slate-500">
                            {" "}
                            · {fmtDate(String(e.details.from))} → {fmtDate(String(e.details.to))}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {e.actor?.name ?? "System"} · {fmtDateTime(e.created_at)}
                      </div>
                      {e.note && (
                        <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-sm text-slate-700">“{e.note}”</p>
                      )}
                    </li>
                  ))}
              </ol>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function ManagerEdit({
  task,
  users,
  managers,
  busy,
  run,
}: {
  task: TaskDetail;
  users: User[];
  managers: User[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
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
    <section className="rounded-md border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Assignment & deadline</h3>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api.updateTask(task.id, { ...changes, version: task.version }));
        }}
      >
        <Field label="Assignee">
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role.toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reviewer" hint="Defaults to the engagement manager">
          <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
            <option value="">Engagement manager</option>
            {managers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={!dirty || busy}>
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}
