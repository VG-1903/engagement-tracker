"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconFolder, IconPlus, IconRepeat } from "@/components/icons";
import { Progress } from "@/components/Progress";
import { useToast } from "@/components/toast";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Person,
  Segmented,
  Select,
  SkeletonRows,
  cx,
} from "@/components/ui";
import { ApiError, api, type Client, type EngagementSummary, type ServiceType, type User } from "@/lib/api";
import { isManagerish, useAuth } from "@/lib/auth";
import { fmtPeriod } from "@/lib/format";

type Filter = "ACTIVE" | "COMPLETED" | "ALL";

export default function EngagementsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [items, setItems] = useState<EngagementSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useCallback(
    (after?: string | null) =>
      api.engagements({ limit: 25, status: filter === "ALL" ? undefined : filter, cursor: after ?? undefined }),
    [filter],
  );

  const load = useCallback(() => {
    query()
      .then((p) => {
        setError(null);
        setItems(p.items);
        setCursor(p.next_cursor);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [query]);
  useEffect(load, [load]);

  async function more() {
    const p = await query(cursor);
    setItems((i) => [...(i ?? []), ...p.items]);
    setCursor(p.next_cursor);
  }

  return (
    <>
      <PageHeader
        title="Engagements"
        subtitle="Each engagement is one piece of client work. Its tasks are created from the service's checklist."
        actions={
          isManagerish(user) && (
            <Button onClick={() => setCreating(true)}>
              <IconPlus /> New engagement
            </Button>
          )
        }
      />

      <div className="mb-4">
        <Segmented
          label="Filter engagements"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "COMPLETED", label: "Completed" },
            { value: "ALL", label: "All" },
          ]}
        />
      </div>

      <ErrorBanner error={error} />
      <Card className="overflow-hidden">
        {items === null ? (
          <SkeletonRows />
        ) : items.length === 0 ? (
          <EmptyState icon={<IconFolder />} title="No engagements here">
            {isManagerish(user) ? "Create one to generate its tasks from a service checklist." : "You'll see engagements once you're assigned a task."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => router.push(`/engagements/${e.id}`)}
                  className="grid w-full grid-cols-1 items-center gap-x-6 gap-y-2 px-5 py-3.5 text-left transition-colors hover:bg-subtle/70 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{e.client.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
                      {e.service_type.is_recurring && <IconRepeat width={12} height={12} className="shrink-0 text-faint" />}
                      {e.service_type.name}
                    </div>
                  </div>
                  <div className="text-[13px]">
                    <span className="text-ink-2">{fmtPeriod(e.period_label)}</span>
                    {e.status === "COMPLETED" && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                        Done
                      </span>
                    )}
                  </div>
                  <Person user={e.manager} />
                  <Progress counts={e.task_counts} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" onClick={more}>
            Load more
          </Button>
        </div>
      )}
      {creating && <NewEngagement onClose={() => setCreating(false)} />}
    </>
  );
}

function NewEngagement({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [form, setForm] = useState({
    client_id: "",
    service_type_id: "",
    period: "",
    start_date: "",
    manager_id: "",
    default_assignee_id: "",
  });
  const [error, setError] = useState<{ message: string; existingId?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.clients(), api.serviceTypes(), api.assignableUsers()])
      .then(([c, s, u]) => {
        setClients(c.items);
        setServices(s);
        setPeople(u);
      })
      .catch((e) => setError({ message: e instanceof ApiError ? e.message : String(e) }));
  }, []);

  const service = services.find((s) => String(s.id) === form.service_type_id);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createEngagement({
        client_id: Number(form.client_id),
        service_type_id: Number(form.service_type_id),
        // <input type="month"> yields YYYY-MM; quarterly/yearly use a full date
        period_start: service?.is_recurring ? (form.period.length === 7 ? `${form.period}-01` : form.period) : undefined,
        start_date: !service?.is_recurring && form.start_date ? form.start_date : undefined,
        manager_id: form.manager_id ? Number(form.manager_id) : undefined,
        default_assignee_id: form.default_assignee_id ? Number(form.default_assignee_id) : undefined,
      });
      toast(`Engagement created with ${created.tasks.length} tasks`);
      router.push(`/engagements/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_ENGAGEMENT") {
        setError({ message: err.message, existingId: (err.details as { engagement_id?: number })?.engagement_id });
      } else setError({ message: err instanceof ApiError ? err.message : String(err) });
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title="New engagement"
      description="Tasks are generated from the service's checklist when you create it."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4" id="new-engagement">
        {error && (
          <div className="space-y-1">
            <ErrorBanner error={error.message} />
            {error.existingId && (
              <button
                type="button"
                onClick={() => router.push(`/engagements/${error.existingId}`)}
                className="pl-1 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
              >
                Open the existing engagement →
              </button>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" className="sm:col-span-2">
            <Select value={form.client_id} onChange={set("client_id")} required>
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service" className="sm:col-span-2">
            <Select value={form.service_type_id} onChange={set("service_type_id")} required>
              <option value="">Select a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.is_recurring ? s.recurrence?.toLowerCase() : "one-time"}
                </option>
              ))}
            </Select>
          </Field>

          {service?.is_recurring &&
            (service.recurrence === "MONTHLY" ? (
              <Field label="Period" hint="The month this compliance work covers">
                <Input type="month" value={form.period} onChange={set("period")} required />
              </Field>
            ) : (
              <Field
                label="Period start"
                hint={service.recurrence === "QUARTERLY" ? "1 Apr, 1 Jul, 1 Oct or 1 Jan" : "1 April (financial year)"}
              >
                <Input type="date" value={form.period} onChange={set("period")} required />
              </Field>
            ))}
          {service && !service.is_recurring && (
            <Field label="Start date" hint="Due dates count from here · defaults to today">
              <Input type="date" value={form.start_date} onChange={set("start_date")} />
            </Field>
          )}

          {user?.role === "ADMIN" && (
            <Field label="Manager">
              <Select value={form.manager_id} onChange={set("manager_id")} required>
                <option value="">Select…</option>
                {people
                  .filter((p) => p.role !== "MEMBER")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field label="Assign tasks to" hint="Optional. You can reassign individual tasks later.">
            <Select value={form.default_assignee_id} onChange={set("default_assignee_id")}>
              <option value="">Leave unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {service && (
          <div className="rounded-lg border border-line bg-subtle/60 p-3">
            <div className="mb-2 text-xs font-medium text-muted">
              {service.templates.length} tasks will be created
            </div>
            <ol className="space-y-1">
              {service.templates.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2 text-[13px] text-ink-2">
                  <span className="w-4 text-right text-xs tabular-nums text-faint">{t.sequence}</span>
                  <span className="flex-1">{t.title}</span>
                  <span className="text-xs text-muted">+{t.default_due_offset_days}d</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className={cx(busy && "cursor-wait")}>
            {busy ? "Creating…" : "Create engagement"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
