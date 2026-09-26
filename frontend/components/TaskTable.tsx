"use client";

import Link from "next/link";
import type { Task } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Empty, StatusBadge, cx } from "./ui";

export function TaskTable({
  tasks,
  onOpen,
  showEngagement = true,
  empty = "No tasks.",
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  showEngagement?: boolean;
  empty?: string;
}) {
  if (tasks.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Task</th>
            {showEngagement && <th className="px-4 py-2.5">Engagement</th>}
            <th className="px-4 py-2.5">Assignee</th>
            <th className="px-4 py-2.5">Due</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {tasks.map((t) => (
            <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(t)}>
              <td className="px-4 py-2.5">
                <button
                  className="text-left font-medium text-slate-900 hover:text-indigo-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(t);
                  }}
                >
                  {t.title}
                </button>
              </td>
              {showEngagement && (
                <td className="px-4 py-2.5 text-slate-600">
                  <Link
                    href={`/engagements/${t.engagement.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-indigo-700 hover:underline"
                  >
                    {t.engagement.client_name}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {t.engagement.service_type_name} · {t.engagement.period_label ?? "One-time"}
                  </div>
                </td>
              )}
              <td className="px-4 py-2.5 text-slate-600">{t.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
              <td className={cx("whitespace-nowrap px-4 py-2.5", t.is_overdue ? "font-medium text-rose-700" : "text-slate-600")}>
                {fmtDate(t.due_date)}
                {t.is_overdue && <span className="ml-1.5 text-xs">overdue</span>}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={t.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
