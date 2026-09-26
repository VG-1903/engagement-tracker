"use client";

import { useCallback, useEffect, useState } from "react";
import { TaskDrawer } from "@/components/TaskDrawer";
import { TaskTable } from "@/components/TaskTable";
import { Button, Card, ErrorBanner, PageHeader, Select, Spinner, cx } from "@/components/ui";
import { ApiError, api, type Task, type TaskStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/format";

type Quick = "all" | "overdue" | "due_today";

export default function TasksPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [quick, setQuick] = useState<Quick>("all");
  const [mine, setMine] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<number | null>(null);

  const query = useCallback(
    (after?: string | null) =>
      api.tasks({
        status: status || undefined,
        overdue: quick === "overdue",
        due_today: quick === "due_today",
        mine,
        limit: 25,
        cursor: after ?? undefined,
      }),
    [status, quick, mine],
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
    const p = await query(cursor);
    setTasks((t) => [...(t ?? []), ...p.items]);
    setCursor(p.next_cursor);
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={user?.role === "MEMBER" ? "Tasks assigned to you" : "Tasks in your scope, earliest due first"}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(["all", "overdue", "due_today"] as Quick[]).map((q) => (
            <button
              key={q}
              onClick={() => setQuick(q)}
              className={cx(
                "rounded px-3 py-1 text-sm",
                quick === q ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {q === "all" ? "All" : q === "overdue" ? "Overdue" : "Due today"}
            </button>
          ))}
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | "")} className="w-auto">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {user?.role !== "MEMBER" && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Only assigned to me
          </label>
        )}
      </div>
      <ErrorBanner error={error} />
      <Card className="overflow-hidden">
        {tasks === null ? (
          <Spinner />
        ) : (
          <TaskTable tasks={tasks} onOpen={(t) => setOpenTask(t.id)} empty="No tasks match these filters." />
        )}
      </Card>
      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={more}>
            Load more
          </Button>
        </div>
      )}
      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />
    </>
  );
}
