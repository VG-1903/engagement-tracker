"use client";

import type { EngagementSummary } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";

const BAR: Record<keyof typeof STATUS_LABEL, string> = {
  COMPLETED: "bg-emerald-500",
  READY_FOR_REVIEW: "bg-violet-400",
  IN_PROGRESS: "bg-sky-400",
  WAITING_FOR_CLIENT: "bg-amber-400",
  CHANGES_REQUESTED: "bg-rose-400",
  NOT_STARTED: "bg-slate-300",
};

export function Progress({ counts }: { counts: EngagementSummary["task_counts"] }) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const done = counts.COMPLETED ?? 0;
  const order = Object.keys(BAR) as (keyof typeof BAR)[];
  return (
    <div className="flex min-w-40 items-center gap-2">
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        {order.map((s) =>
          counts[s] ? (
            <div
              key={s}
              title={`${STATUS_LABEL[s]}: ${counts[s]}`}
              className={`${BAR[s]} border-r border-white last:border-r-0`}
              style={{ width: `${(counts[s]! / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">
        {done}/{total}
      </span>
    </div>
  );
}
