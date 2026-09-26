"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Progress } from "@/components/Progress";
import { TaskDrawer } from "@/components/TaskDrawer";
import { TaskTable } from "@/components/TaskTable";
import { Button, Card, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { ApiError, api, type EngagementDetail } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function EngagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
      if (res.created) router.push(`/engagements/${res.engagement.id}`);
      else setExisting({ id: res.engagement.id, label: res.engagement.period_label });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <ErrorBanner error={error} /> : <Spinner />;

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/engagements" className="text-slate-500 hover:text-slate-900">
          ← Engagements
        </Link>
      </div>
      <PageHeader
        title={data.client.name}
        subtitle={
          <>
            {data.service_type.name} · {data.period_label ?? "One-time"} · Managed by {data.manager.name} ·{" "}
            <span className={data.status === "COMPLETED" ? "font-medium text-emerald-700" : ""}>
              {data.status === "COMPLETED" ? "Completed" : "Active"}
            </span>
          </>
        }
        actions={
          data.can_manage &&
          data.service_type.is_recurring && (
            <Button variant="secondary" onClick={generateNext} disabled={busy}>
              Generate next period
            </Button>
          )
        }
      />
      <div className="mb-4 space-y-2">
        <ErrorBanner error={error} />
        {existing && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            The next period ({existing.label}) already exists, so nothing was duplicated.{" "}
            <Link href={`/engagements/${existing.id}`} className="font-medium underline">
              Open it
            </Link>
          </div>
        )}
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-slate-500">Progress</div>
          <div className="mt-2">
            <Progress counts={data.task_counts} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Period start</div>
          <div className="mt-1 font-medium text-slate-900">{fmtDate(data.period_start)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Created</div>
          <div className="mt-1 font-medium text-slate-900">{fmtDate(data.created_at)}</div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Tasks</h2>
        </div>
        <TaskTable tasks={data.tasks} showEngagement={false} onOpen={(t) => setOpenTask(t.id)} />
      </Card>
      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />
    </>
  );
}
