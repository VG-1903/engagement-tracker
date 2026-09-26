"use client";

import { useCallback, useEffect, useState } from "react";
import { TaskDrawer } from "@/components/TaskDrawer";
import { TaskTable } from "@/components/TaskTable";
import { Card, ErrorBanner, PageHeader, Spinner, cx } from "@/components/ui";
import { ApiError, api, type Bucket, type Dashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

const BUCKETS: { key: Bucket; label: string; accent: string; empty: string }[] = [
  { key: "overdue", label: "Overdue", accent: "text-rose-700", empty: "Nothing overdue." },
  { key: "due_today", label: "Due today", accent: "text-amber-700", empty: "Nothing due today." },
  { key: "waiting_for_review", label: "Waiting for review", accent: "text-violet-700", empty: "Nothing awaiting review." },
  { key: "waiting_for_client", label: "Waiting for client", accent: "text-sky-700", empty: "Not waiting on any client." },
  { key: "open", label: "Open", accent: "text-slate-900", empty: "No open tasks." },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Bucket>("overdue");
  const [openTask, setOpenTask] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .dashboard()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const scope =
    user?.role === "ADMIN" ? "All engagements" : user?.role === "MANAGER" ? "Engagements you manage and tasks you're on" : "Your tasks";

  return (
    <>
      <PageHeader title="Dashboard" subtitle={data ? `${scope} · ${fmtDate(data.today)}` : scope} />
      <ErrorBanner error={error} />
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {BUCKETS.map((b) => (
              <button
                key={b.key}
                onClick={() => setActive(b.key)}
                className={cx(
                  "rounded-lg border bg-white p-4 text-left shadow-xs transition",
                  active === b.key ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <div className="text-sm text-slate-500">{b.label}</div>
                <div className={cx("mt-1 text-3xl font-semibold tabular-nums", b.accent)}>{data.counts[b.key]}</div>
              </button>
            ))}
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-900">{BUCKETS.find((b) => b.key === active)!.label}</h2>
              {data.counts[active] > data.lists[active].length && (
                <span className="text-xs text-slate-500">
                  Showing {data.lists[active].length} of {data.counts[active]} (earliest due first)
                </span>
              )}
            </div>
            <TaskTable
              tasks={data.lists[active]}
              onOpen={(t) => setOpenTask(t.id)}
              empty={BUCKETS.find((b) => b.key === active)!.empty}
            />
          </Card>
        </>
      )}
      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />
    </>
  );
}
