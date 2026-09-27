"use client";

import type { Task } from "@/lib/api";
import { fmtPeriod, fmtShort, relativeDue } from "@/lib/format";
import { IconInbox } from "./icons";
import { Avatar, EmptyState, Person, StatusBadge, StatusDot, cx } from "./ui";

function DueCell({ task }: { task: Task }) {
  const done = task.status === "COMPLETED";
  const label = relativeDue(task.due_date, done);
  const today = label === "Due today";
  return (
    <span
      title={fmtShort(task.due_date)}
      className={cx(
        "whitespace-nowrap text-[13px] tabular-nums",
        task.is_overdue ? "font-medium text-rose-700" : today ? "font-medium text-amber-700" : "text-muted",
      )}
    >
      {label}
    </span>
  );
}

export function TaskTable({
  tasks,
  onOpen,
  showEngagement = true,
  empty = "Nothing here.",
  emptyHint,
  selectedId,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  showEngagement?: boolean;
  empty?: string;
  emptyHint?: string;
  selectedId?: number | null;
}) {
  if (tasks.length === 0)
    return (
      <EmptyState icon={<IconInbox />} title={empty}>
        {emptyHint}
      </EmptyState>
    );

  return (
    <>
      {/* desktop */}
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-muted">
            <th className="border-b border-line py-2 pl-5 pr-4 font-medium">Task</th>
            <th className="w-20 border-b border-line px-4 py-2 font-medium xl:w-44">
              <span className="xl:hidden">Who</span>
              <span className="hidden xl:inline">Assignee</span>
            </th>
            <th className="w-36 border-b border-line px-4 py-2 font-medium">Due</th>
            <th className="w-44 border-b border-line py-2 pl-4 pr-5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr
              key={t.id}
              onClick={() => onOpen(t)}
              className={cx(
                "group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-subtle/70",
                selectedId === t.id && "bg-accent-soft/50",
              )}
            >
              <td className="min-w-0 py-3 pl-5 pr-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(t);
                  }}
                  className={cx(
                    "block max-w-full truncate text-left font-medium text-ink outline-none focus-visible:underline",
                    t.status === "COMPLETED" && "text-muted",
                  )}
                >
                  {t.title}
                </button>
                {showEngagement && (
                  <div className="mt-0.5 truncate text-[12.5px] text-muted">
                    {t.engagement.client_name}
                    <span className="text-faint"> · {t.engagement.service_type_name}</span>
                    {t.engagement.period_label && <span className="text-faint"> · {fmtPeriod(t.engagement.period_label)}</span>}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="xl:hidden">
                  {t.assignee ? <Avatar name={t.assignee.name} id={t.assignee.id} /> : <span className="text-faint">—</span>}
                </span>
                <span className="hidden xl:block">
                  <Person user={t.assignee} />
                </span>
              </td>
              <td className="px-4 py-3">
                <DueCell task={t} />
              </td>
              <td className="py-3 pl-4 pr-5">
                <StatusBadge status={t.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* mobile */}
      <ul className="divide-y divide-line md:hidden">
        {tasks.map((t) => (
          <li key={t.id}>
            <button onClick={() => onOpen(t)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-subtle">
              <StatusDot status={t.status} className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <div className={cx("font-medium", t.status === "COMPLETED" ? "text-muted" : "text-ink")}>{t.title}</div>
                {showEngagement && <div className="mt-0.5 truncate text-[12.5px] text-muted">{t.engagement.client_name}</div>}
                <div className="mt-1.5 flex items-center gap-2">
                  <DueCell task={t} />
                </div>
              </div>
              {t.assignee && <Avatar name={t.assignee.name} id={t.assignee.id} />}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
