"use client";

import type { EngagementSummary } from "@/lib/api";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from "@/lib/format";
import { cx } from "./ui";

export function Progress({ counts, wide = false }: { counts: EngagementSummary["task_counts"]; wide?: boolean }) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const done = counts.COMPLETED ?? 0;
  return (
    <div className={cx("flex items-center gap-3", wide ? "w-full" : "w-40")}>
      <div className="flex h-1.5 flex-1 gap-px overflow-hidden rounded-full bg-subtle">
        {total > 0 &&
          STATUS_ORDER.map((s) =>
            counts[s] ? (
              <div
                key={s}
                title={`${STATUS_LABEL[s]}: ${counts[s]}`}
                className={cx(STATUS_TONE[s].bar, "first:rounded-l-full last:rounded-r-full")}
                style={{ width: `${(counts[s]! / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted">
        {done}/{total}
      </span>
    </div>
  );
}

export function StatusLegend({ counts }: { counts: EngagementSummary["task_counts"] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className={cx("size-2 rounded-full", STATUS_TONE[s].bar)} />
          {STATUS_LABEL[s]}
          <span className="tabular-nums text-ink-2">{counts[s]}</span>
        </span>
      ))}
    </div>
  );
}
