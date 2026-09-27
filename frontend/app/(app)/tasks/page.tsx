"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TaskDrawer } from "@/components/TaskDrawer";
import { TaskTable } from "@/components/TaskTable";
import { Button, Card, ErrorBanner, PageHeader, Segmented, Select, SkeletonRows, cx } from "@/components/ui";
import { ApiError, api, type Task, type TaskStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/format";

type View = "open" | "overdue" | "due_today" | "all";
const OPEN_STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "WAITING_FOR_CLIENT", "READY_FOR_REVIEW", "CHANGES_REQUESTED"];
const VIEWS: { value: View; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "all", label: "All" },
];

export default function TasksPage() {
  return (
    <Suspense fallback={<SkeletonRows />}>
      <Tasks />
    </Suspense>
  );
}

function Tasks() {
  const { user } = useAuth();
  const params = useSearchParams();
  const initialView = (VIEWS.find((v) => v.value === params.get("view"))?.value ?? "open") as View;
  const initialStatus = (params.get("status") ?? "") as TaskStatus | "";

  const [view, setView] = useState<View>(initialStatus ? "all" : initialView);
  const [status, setStatus] = useState<TaskStatus | "">(initialStatus);
  const [mine, setMine] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ?task=123 deep-links straight to a task's drawer
  const [openTask, setOpenTask] = useState<number | null>(Number(params.get("task")) || null);

  const query = useCallback(
    (after?: string | null) =>
      api.tasks({
        status: status ? [status] : view === "open" ? OPEN_STATUSES : undefined,
        overdue: view === "overdue",
        due_today: view === "due_today",
        mine,
        limit: 25,
        cursor: after ?? undefined,
      }),
    [status, view, mine],
  );

  const reload = useCallback(() => {
    query()
      .then((p) => {
        setError(null);
        setTasks(p.items);
        setCursor(p.next_cursor);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [query]);
  useEffect(reload, [reload]);

  async function more() {
    setLoadingMore(true);
    try {
      const p = await query(cursor);
      setTasks((t) => [...(t ?? []), ...p.items]);
      setCursor(p.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  const isMember = user?.role === "MEMBER";

  return (
    <>
      <PageHeader
        title={isMember ? "My tasks" : "Tasks"}
        subtitle={isMember ? "Everything assigned to you, earliest due first." : "All tasks you can see, earliest due first."}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Segmented
          label="View"
          value={view}
          onChange={(v) => {
            setView(v);
            if (v !== "all") setStatus("");
          }}
          options={VIEWS}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TaskStatus | "");
            if (e.target.value) setView("all");
          }}
          className="h-8 w-auto text-[13px]"
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {!isMember && (
          <button
            onClick={() => setMine((m) => !m)}
            aria-pressed={mine}
            className={cx(
              "h-8 rounded-md border px-3 text-[13px] font-medium transition-colors",
              mine ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-muted hover:text-ink",
            )}
          >
            Assigned to me
          </button>
        )}
      </div>

      <ErrorBanner error={error} />
      <Card className="overflow-hidden">
        {tasks === null ? (
          <SkeletonRows />
        ) : (
          <TaskTable
            tasks={tasks}
            onOpen={(t) => setOpenTask(t.id)}
            selectedId={openTask}
            empty="No tasks match"
            emptyHint="Try a different view or clear the status filter."
          />
        )}
      </Card>
      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={more} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />
    </>
  );
}
