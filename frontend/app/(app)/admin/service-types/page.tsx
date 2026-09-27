"use client";

import { useCallback, useEffect, useState } from "react";
import { IconDots, IconPlus, IconRepeat } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  cx,
} from "@/components/ui";
import { ApiError, api, type Recurrence, type ServiceType, type Template } from "@/lib/api";
import { fmtLong } from "@/lib/format";

export default function ServiceTypesPage() {
  const toast = useToast();
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

  const fail = useCallback((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)), []);

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="Each service has a checklist of task templates. Engagements copy the checklist when they're created, so editing a template never changes existing work."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus /> New service
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <RecurringRunner />

      {items === null ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
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
          onSaved={(name) => {
            setCreating(false);
            toast(`${name} created. Add its checklist next.`);
            load();
          }}
        />
      )}
    </>
  );
}

function RecurringRunner() {
  const [asOf, setAsOf] = useState("");
  const [result, setResult] = useState<{ asOf: string; created: number; existing: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.generateDue(asOf || undefined);
      setResult({ asOf: r.as_of, created: r.created.length, existing: r.already_existed, failed: r.failed.length });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-subtle text-muted">
          <IconRepeat />
        </div>
        <div className="min-w-[240px] flex-1">
          <h2 className="text-sm font-semibold text-ink">Recurring generation</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Creates any missing monthly, quarterly or yearly engagements up to the chosen date. Running it twice never
            creates duplicates. In production a nightly job does this.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8 w-auto text-[13px]" aria-label="As of date" />
          <Button size="sm" variant="secondary" onClick={run} disabled={busy} className="h-8">
            {busy ? "Running…" : "Run now"}
          </Button>
        </div>
      </div>
      {(result || error) && (
        <div className="animate-fade-in border-t border-line bg-subtle/60 px-5 py-3 text-[13px]">
          {error ? (
            <span className="text-rose-700">{error}</span>
          ) : (
            result && (
              <span className="text-ink-2">
                Up to <span className="font-medium text-ink">{fmtLong(result.asOf)}</span>:{" "}
                <span className={cx("font-medium", result.created ? "text-emerald-700" : "text-ink")}>
                  {result.created} created
                </span>
                , {result.existing} already up to date
                {result.failed > 0 && <span className="text-rose-700">, {result.failed} failed</span>}.
              </span>
            )
          )}
        </div>
      )}
    </Card>
  );
}

function ServiceCard({ st, reload, onError }: { st: ServiceType; reload: () => void; onError: (e: unknown) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "service" } | { kind: "template"; t: Template } | null>(null);
  const [menu, setMenu] = useState(false);

  async function doDelete() {
    if (!confirm) return;
    try {
      if (confirm.kind === "service") {
        await api.deleteServiceType(st.id);
        toast(`${st.name} deleted`);
      } else {
        await api.deleteTemplate(confirm.t.id);
        toast("Template removed");
      }
      reload();
    } catch (e) {
      onError(e);
    } finally {
      setConfirm(null);
    }
  }

  return (
    <section aria-label={st.name}>
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink">{st.name}</h2>
            <span
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                st.is_recurring ? "bg-accent-soft text-accent" : "bg-subtle text-muted",
              )}
            >
              {st.is_recurring && <IconRepeat width={11} height={11} />}
              {st.is_recurring ? st.recurrence?.toLowerCase() : "one-time"}
            </span>
          </div>
          {st.description && <p className="mt-1 text-[13px] text-muted">{st.description}</p>}
        </div>
        <div className="relative flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <IconPlus width={14} height={14} /> Add task
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMenu((m) => !m)} aria-label="More" className="px-1.5">
            <IconDots />
          </Button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 animate-pop-in rounded-lg border border-line bg-surface p-1 shadow-pop">
                <button
                  onClick={() => {
                    setMenu(false);
                    setConfirm({ kind: "service" });
                  }}
                  className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-rose-700 hover:bg-rose-50"
                >
                  Delete service
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {st.templates.length === 0 ? (
        <div className="mx-5 mb-5 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
          No checklist yet. Engagements can&apos;t be created until you add at least one task.
        </div>
      ) : (
        <ol className="border-t border-line">
          {st.templates.map((t) => (
            <li key={t.id} className="group flex items-center gap-4 border-b border-line/70 px-5 py-2.5 last:border-0 hover:bg-subtle/60">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10.5px] tabular-nums text-muted">
                {t.sequence}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-ink">{t.title}</div>
                {t.description && <div className="truncate text-xs text-muted">{t.description}</div>}
              </div>
              <span className="hidden whitespace-nowrap text-xs text-muted sm:block">
                Due {t.default_due_offset_days}d after {st.is_recurring ? "period end" : "start"}
              </span>
              <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="hover:text-rose-700" onClick={() => setConfirm({ kind: "template", t })}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <TemplateForm
          st={st}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast("Checklist updated");
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === "service" ? `Delete ${st.name}?` : "Remove this task from the checklist?"}
        body={
          confirm?.kind === "service"
            ? "Only possible if no engagements use this service."
            : "Future engagements won't include it. Tasks already created from it are kept."
        }
        confirmLabel={confirm?.kind === "service" ? "Delete" : "Remove"}
        onConfirm={doDelete}
        onClose={() => setConfirm(null)}
      />
    </Card>
    </section>
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
    const body = { title, description: description || null, default_due_offset_days: Number(offset), sequence: Number(sequence) };
    try {
      if (template) await api.updateTemplate(template.id, body);
      else await api.addTemplate(st.id, body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title={template ? "Edit task" : "Add task to checklist"} description={st.name} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position">
            <Input type="number" min={1} value={sequence} onChange={(e) => setSequence(e.target.value)} required />
          </Field>
          <Field label="Due after (days)" hint={st.is_recurring ? "Counted from the end of the period" : "Counted from the start date"}>
            <Input type="number" min={0} value={offset} onChange={(e) => setOffset(e.target.value)} required />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function NewService({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence | "">("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createServiceType({ name, description: description || null, is_recurring: recurrence !== "", recurrence: recurrence || null });
      onSaved(name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title="New service" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Quarterly TDS Returns" required autoFocus />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Repeats" hint="Can't be changed later, because existing periods depend on it.">
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence | "")}>
            <option value="">Doesn&apos;t repeat (one-time)</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly (Apr–Jun, Jul–Sep, …)</option>
            <option value="YEARLY">Yearly (April–March)</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create service</Button>
        </div>
      </form>
    </Modal>
  );
}
