"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { ApiError, api, type Recurrence, type ServiceType, type Template } from "@/lib/api";

export default function ServiceTypesPage() {
  const [items, setItems] = useState<ServiceType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .serviceTypes()
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : String(e));

  return (
    <>
      <PageHeader
        title="Services & templates"
        subtitle="Templates are blueprints: engagements copy them into tasks. Editing a template does not change existing tasks."
        actions={<Button onClick={() => setCreating(true)}>New service</Button>}
      />
      <div className="mb-4">
        <ErrorBanner error={error} />
      </div>
      <RecurringRunner />
      {items === null ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {items.map((st) => (
            <ServiceCard key={st.id} st={st} reload={load} onError={fail} />
          ))}
        </div>
      )}
      {creating && (
        <NewService
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </>
  );
}

function RecurringRunner() {
  const [asOf, setAsOf] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.generateDue(asOf || undefined);
      setResult(
        `As of ${r.as_of}: created ${r.created.length} engagement(s), ${r.already_existed} already up to date` +
          (r.failed.length ? `, ${r.failed.length} failed` : "") +
          ".",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">Recurring generation</h2>
          <p className="text-sm text-slate-500">
            Creates any missing recurring engagements up to the period containing the date. Safe to run repeatedly — it
            never creates duplicates. In production a scheduler calls this nightly.
          </p>
        </div>
        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-auto" aria-label="As of date" />
        <Button variant="secondary" onClick={run} disabled={busy}>
          Run now
        </Button>
      </div>
      {result && <p className="mt-3 text-sm text-emerald-700">{result}</p>}
      <div className="mt-2">
        <ErrorBanner error={error} />
      </div>
    </Card>
  );
}

function ServiceCard({ st, reload, onError }: { st: ServiceType; reload: () => void; onError: (e: unknown) => void }) {
  const [editing, setEditing] = useState<Template | "new" | null>(null);

  async function removeTemplate(t: Template) {
    if (!confirm(`Delete template “${t.title}”? Existing tasks are kept.`)) return;
    await api.deleteTemplate(t.id).then(reload).catch(onError);
  }
  async function removeService() {
    if (!confirm(`Delete service “${st.name}”?`)) return;
    await api.deleteServiceType(st.id).then(reload).catch(onError);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-900">
            {st.name}{" "}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {st.is_recurring ? st.recurrence?.toLowerCase() : "one-time"}
            </span>
          </h2>
          {st.description && <p className="mt-0.5 text-sm text-slate-500">{st.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            Add template
          </Button>
          <Button size="sm" variant="ghost" className="text-rose-700" onClick={removeService}>
            Delete
          </Button>
        </div>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-12 px-4 py-2">#</th>
            <th className="px-4 py-2">Task</th>
            <th className="px-4 py-2">Due</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {st.templates.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2 tabular-nums text-slate-500">{t.sequence}</td>
              <td className="px-4 py-2 text-slate-900">
                {t.title}
                {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                +{t.default_due_offset_days} days {st.is_recurring ? "after period end" : "after start"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => removeTemplate(t)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
          {st.templates.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                No templates — engagements cannot be created until you add one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {editing && (
        <TemplateForm
          st={st}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </Card>
  );
}

function TemplateForm({
  st,
  template,
  onClose,
  onSaved,
}: {
  st: ServiceType;
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const nextSeq = Math.max(0, ...st.templates.map((t) => t.sequence)) + 1;
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [offset, setOffset] = useState(String(template?.default_due_offset_days ?? 7));
  const [sequence, setSequence] = useState(String(template?.sequence ?? nextSeq));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title,
      description: description || null,
      default_due_offset_days: Number(offset),
      sequence: Number(sequence),
    };
    try {
      if (template) await api.updateTemplate(template.id, body);
      else await api.addTemplate(st.id, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title={template ? "Edit template" : `New template · ${st.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order">
            <Input type="number" min={1} value={sequence} onChange={(e) => setSequence(e.target.value)} required />
          </Field>
          <Field label="Due offset (days)" hint={st.is_recurring ? "After the period ends" : "After the start date"}>
            <Input type="number" min={0} value={offset} onChange={(e) => setOffset(e.target.value)} required />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function NewService({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence | "">("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createServiceType({
        name,
        description: description || null,
        is_recurring: recurrence !== "",
        recurrence: recurrence || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title="New service" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Recurrence" hint="Cannot be changed later, because existing periods depend on it">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence | "")}>
            <option value="">One-time</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly (financial-year quarters)</option>
            <option value="YEARLY">Yearly (April–March)</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create</Button>
        </div>
      </form>
    </Modal>
  );
}
