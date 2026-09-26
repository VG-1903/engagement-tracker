"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Progress } from "@/components/Progress";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner } from "@/components/ui";
import { ApiError, api, type Client, type EngagementSummary, type ServiceType, type User } from "@/lib/api";
import { isManagerish, useAuth } from "@/lib/auth";

export default function EngagementsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<EngagementSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .engagements({ limit: 25 })
      .then((p) => {
        setItems(p.items);
        setCursor(p.next_cursor);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  async function more() {
    const p = await api.engagements({ limit: 25, cursor });
    setItems((i) => [...(i ?? []), ...p.items]);
    setCursor(p.next_cursor);
  }

  return (
    <>
      <PageHeader
        title="Engagements"
        subtitle="Each engagement is one piece of client work, generated from a service's task templates."
        actions={isManagerish(user) && <Button onClick={() => setCreating(true)}>New engagement</Button>}
      />
      <ErrorBanner error={error} />
      <Card className="overflow-hidden">
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty>No engagements yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Service</th>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5">Manager</th>
                  <th className="px-4 py-2.5">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/engagements/${e.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                        {e.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{e.service_type.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.period_label ?? "One-time"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.manager.name}</td>
                    <td className="px-4 py-2.5">
                      <Progress counts={e.task_counts} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={more}>
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
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [form, setForm] = useState({ client_id: "", service_type_id: "", period: "", start_date: "", manager_id: "", default_assignee_id: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.clients(), api.serviceTypes(), api.assignableUsers()])
      .then(([c, s, u]) => {
        setClients(c.items);
        setServices(s);
        setPeople(u);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);

  const service = services.find((s) => String(s.id) === form.service_type_id);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let period_start: string | undefined;
      if (service?.is_recurring) {
        // <input type="month"> gives YYYY-MM; quarterly/yearly accept a full date.
        period_start = form.period.length === 7 ? `${form.period}-01` : form.period;
      }
      const created = await api.createEngagement({
        client_id: Number(form.client_id),
        service_type_id: Number(form.service_type_id),
        period_start,
        start_date: !service?.is_recurring && form.start_date ? form.start_date : undefined,
        manager_id: form.manager_id ? Number(form.manager_id) : undefined,
        default_assignee_id: form.default_assignee_id ? Number(form.default_assignee_id) : undefined,
      });
      router.push(`/engagements/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_ENGAGEMENT") {
        const id = (err.details as { engagement_id?: number })?.engagement_id;
        setError(`${err.message}${id ? ` (engagement #${id})` : ""}`);
      } else setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal open title="New engagement" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Client">
          <Select value={form.client_id} onChange={set("client_id")} required>
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service">
          <Select value={form.service_type_id} onChange={set("service_type_id")} required>
            <option value="">Select a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.is_recurring ? `(${s.recurrence?.toLowerCase()})` : "(one-time)"}
              </option>
            ))}
          </Select>
        </Field>
        {service?.is_recurring &&
          (service.recurrence === "MONTHLY" ? (
            <Field label="Period" hint="The month the compliance work covers">
              <Input type="month" value={form.period} onChange={set("period")} required />
            </Field>
          ) : (
            <Field
              label="Period start"
              hint={service.recurrence === "QUARTERLY" ? "First day of the quarter (Apr/Jul/Oct/Jan 1)" : "Financial year start (1 April)"}
            >
              <Input type="date" value={form.period} onChange={set("period")} required />
            </Field>
          ))}
        {service && !service.is_recurring && (
          <Field label="Start date" hint="Task due dates are counted from this date (default today)">
            <Input type="date" value={form.start_date} onChange={set("start_date")} />
          </Field>
        )}
        {user?.role === "ADMIN" && (
          <Field label="Manager">
            <Select value={form.manager_id} onChange={set("manager_id")} required>
              <option value="">Select a manager…</option>
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
        <Field label="Assign all tasks to" hint="Optional; you can reassign individual tasks later">
          <Select value={form.default_assignee_id} onChange={set("default_assignee_id")}>
            <option value="">Leave unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role.toLowerCase()})
              </option>
            ))}
          </Select>
        </Field>
        {service && (
          <p className="text-xs text-slate-500">
            Creates {service.templates.length} task{service.templates.length === 1 ? "" : "s"} from the “{service.name}”
            templates.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Create engagement
          </Button>
        </div>
      </form>
    </Modal>
  );
}
