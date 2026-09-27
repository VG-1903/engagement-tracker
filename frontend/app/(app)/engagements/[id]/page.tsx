"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconRepeat } from "@/components/icons";
import { Progress, StatusLegend } from "@/components/Progress";
import { TaskDrawer } from "@/components/TaskDrawer";
import { TaskTable } from "@/components/TaskTable";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, ErrorBanner, PageHeader, Person, Skeleton } from "@/components/ui";
import { ApiError, api, type EngagementDetail } from "@/lib/api";
import { fmtDate, fmtPeriod, relativeDue } from "@/lib/format";

export default function EngagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<EngagementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: number; label: string | null } | null>(null);
  const [openTask, setOpenTask] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .engagement(Number(id))
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [id]);
  useEffect(load, [load]);

  async function generateNext() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.generateNext(Number(id));
      if (res.created) {
        toast(`Created ${fmtPeriod(res.engagement.period_label)} with ${res.engagement.tasks.length} tasks`);
        router.push(`/engagements/${res.engagement.id}`);
      } else {
        setExisting({ id: res.engagement.id, label: fmtPeriod(res.engagement.period_label) });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href="/engagements" className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
      <IconArrowLeft width={14} height={14} /> Engagements
    </Link>
  );

  if (!data)
    return error ? (
      <>
        <div className="mb-4 text-[13px] text-muted">{back}</div>
        <ErrorBanner error={error} />
      </>
    ) : (
      <>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-7 w-72" />
        <Skeleton className="mt-8 h-24 w-full" />
        <Skeleton className="mt-6 h-64 w-full" />
      </>
    );

  const open = data.tasks.filter((t) => t.status !== "COMPLETED");
  const nextDue = open.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={data.client.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {data.service_type.is_recurring && <IconRepeat width={13} height={13} className="text-faint" />}
            {data.service_type.name}
            <span className="text-faint">·</span>
            {fmtPeriod(data.period_label)}
            {data.status === "COMPLETED" && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Completed</span>
            )}
          </span>
        }
        actions={
          data.can_manage &&
          data.service_type.is_recurring && (
            <Button variant="secondary" onClick={generateNext} disabled={busy}>
              <IconRepeat /> {busy ? "Generating…" : "Generate next period"}
            </Button>
          )
        }
      />

      {(error || existing) && (
        <div className="mb-4 space-y-2">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
          {existing && (
            <div className="flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-2 shadow-xs">
              <span>
                <span className="font-medium text-ink">{existing.label}</span> already exists, so nothing new was created.
                Running this again is always safe.
              </span>
              <Link href={`/engagements/${existing.id}`} className="font-medium text-ink underline underline-offset-2">
                Open {existing.label}
              </Link>
            </div>
          )}
        </div>
      )}

      <Card className="mb-6 grid divide-y divide-line sm:grid-cols-[1.4fr_1fr_1fr] sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <div className="text-xs text-muted">Progress</div>
          <div className="mt-3">
            <Progress counts={data.task_counts} wide />
          </div>
          <div className="mt-3">
            <StatusLegend counts={data.task_counts} />
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-muted">Manager</div>
          <div className="mt-2.5">
            <Person user={data.manager} />
          </div>
          <div className="mt-4 text-xs text-muted">Created</div>
          <div className="mt-1 text-[13px] text-ink-2">{fmtDate(data.created_at)}</div>
        </div>
        <div className="p-5">
          <div className="text-xs text-muted">Next deadline</div>
          {nextDue ? (
            <>
              <div className={nextDue.is_overdue ? "mt-2 text-[13px] font-medium text-rose-700" : "mt-2 text-[13px] font-medium text-ink"}>
                {relativeDue(nextDue.due_date, false)}
              </div>
              <div className="mt-0.5 truncate text-[13px] text-muted">{nextDue.title}</div>
            </>
          ) : (
            <div className="mt-2 text-[13px] text-muted">All tasks complete</div>
          )}
          {data.period_start && (
            <>
              <div className="mt-4 text-xs text-muted">Period starts</div>
              <div className="mt-1 text-[13px] text-ink-2">{fmtDate(data.period_start)}</div>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Tasks" meta={String(data.tasks.length)} />
        <TaskTable
          tasks={data.tasks}
          showEngagement={false}
          onOpen={(t) => setOpenTask(t.id)}
          selectedId={openTask}
          empty="No tasks visible to you"
        />
      </Card>
      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />
    </>
  );
}
