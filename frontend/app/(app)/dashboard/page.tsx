"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconAlert, IconClock, IconEye, IconInbox, IconPause } from "@/components/icons";
import { TaskDrawer } from "@/components/TaskDrawer";
import { TaskTable } from "@/components/TaskTable";
import { Card, ErrorBanner, PageHeader, Skeleton, SkeletonRows, cx } from "@/components/ui";
import { ApiError, api, type Bucket, type Dashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtLong, greeting } from "@/lib/format";

const BUCKETS: {
  key: Bucket;
  label: string;
  full: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone: string;
  empty: string;
  hint: string;
}[] = [
  { key: "overdue", label: "Overdue", full: "Overdue tasks", icon: IconAlert, tone: "text-rose-600", empty: "Nothing overdue", hint: "Past the due date and not completed" },
  { key: "due_today", label: "Due today", full: "Tasks due today", icon: IconClock, tone: "text-amber-600", empty: "Nothing due today", hint: "Due by end of day" },
  { key: "waiting_for_review", label: "In review", full: "Tasks waiting for review", icon: IconEye, tone: "text-violet-600", empty: "Nothing awaiting review", hint: "Submitted, needs a reviewer" },
  { key: "waiting_for_client", label: "With client", full: "Tasks waiting for client", icon: IconPause, tone: "text-amber-600", empty: "Not waiting on any client", hint: "Paused until the client responds" },
  { key: "open", label: "Open", full: "Open tasks", icon: IconInbox, tone: "text-ink", empty: "No open tasks", hint: "Everything not yet completed" },
];

const VIEW_ALL: Record<Bucket, string> = {
  overdue: "/tasks?view=overdue",
  due_today: "/tasks?view=due_today",
  waiting_for_review: "/tasks?status=READY_FOR_REVIEW",
  waiting_for_client: "/tasks?status=WAITING_FOR_CLIENT",
  open: "/tasks?view=open",
};

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
    user?.role === "ADMIN"
      ? "Across every engagement in the firm."
      : user?.role === "MANAGER"
        ? "Engagements you manage, plus tasks you're assigned to or reviewing."
        : "Tasks assigned to you.";
  const current = BUCKETS.find((b) => b.key === active)!;
  const firstName = user?.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow={data ? fmtLong(data.today) : <Skeleton className="h-4 w-40" />}
        title={`${greeting()}, ${firstName}`}
        subtitle={scope}
      />
      <ErrorBanner error={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {BUCKETS.map((b) => {
          const Icon = b.icon;
          const n = data?.counts[b.key];
          const selected = active === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setActive(b.key)}
              aria-pressed={selected}
              title={b.full}
              className={cx(
                "group rounded-xl border bg-surface p-3.5 text-left transition-all sm:p-4",
                b.key === "open" && "col-span-2 md:col-span-1",
                selected
                  ? "border-ink/80 shadow-[0_0_0_1px_var(--color-ink)]"
                  : "border-line shadow-card hover:border-line-strong",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-[13px] text-muted">{b.label}</span>
                <Icon className={cx("hidden shrink-0 transition-colors lg:block", n ? b.tone : "text-faint")} />
              </div>
              {data ? (
                <div
                  className={cx(
                    "mt-2 text-2xl font-semibold leading-none tracking-[-0.02em] tabular-nums sm:mt-3 sm:text-[28px]",
                    n ? (b.key === "overdue" ? "text-rose-700" : "text-ink") : "text-faint",
                  )}
                >
                  {n}
                </div>
              ) : (
                <Skeleton className="mt-3 h-7 w-10" />
              )}
            </button>
          );
        })}
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{current.full}</h2>
            <p className="text-xs text-muted">{current.hint}</p>
          </div>
          {data && data.counts[active] > data.lists[active].length && (
            <Link
              href={VIEW_ALL[active]}
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              View all {data.counts[active]} →
            </Link>
          )}
        </div>
        {data ? (
          <TaskTable
            tasks={data.lists[active]}
            onOpen={(t) => setOpenTask(t.id)}
            selectedId={openTask}
            empty={current.empty}
            emptyHint="Nice. Pick another tile above to see other work."
          />
        ) : (
          <SkeletonRows rows={5} />
        )}
      </Card>

      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />
    </>
  );
}
