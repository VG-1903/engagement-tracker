"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBuilding, IconPlus, IconSearch } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  SkeletonRows,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ApiError, api, type Client } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function ClientsPage() {
  const toast = useToast();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  const load = useCallback(() => {
    api
      .clients()
      .then((p) => setClients(p.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!clients || !needle) return clients;
    return clients.filter((c) => [c.name, c.gstin, c.contact_email].some((v) => v?.toLowerCase().includes(needle)));
  }, [clients, q]);

  async function remove() {
    if (!deleting) return;
    try {
      await api.deleteClient(deleting.id);
      toast(`${deleting.name} deleted`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The businesses you file for. Clients with engagements can't be deleted."
        actions={
          <Button onClick={() => setEditing("new")}>
            <IconPlus /> Add client
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, GSTIN, email" className="h-8 pl-8 text-[13px]" />
        </div>
      </div>
      <div className="mb-4 empty:hidden">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      </div>
      <Card className="overflow-hidden">
        {shown === null ? (
          <SkeletonRows />
        ) : shown.length === 0 ? (
          <EmptyState icon={<IconBuilding />} title={q ? "No matching clients" : "No clients yet"} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th className="w-48">GSTIN</Th>
                <Th className="hidden w-32 xl:table-cell">Added</Th>
                <Th className="w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {shown.map((c) => (
                <tr key={c.id} className="group hover:bg-subtle/60">
                  <Td>
                    <div className="font-medium text-ink">{c.name}</div>
                    <div className="mt-0.5 text-[12.5px] text-muted">{c.contact_email ?? "No contact email"}</div>
                  </Td>
                  <Td>
                    {c.gstin ? (
                      <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{c.gstin}</span>
                    ) : (
                      <span className="text-[13px] text-faint">Not registered</span>
                    )}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-[13px] text-muted xl:table-cell">{fmtDate(c.created_at)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="hover:text-rose-700" onClick={() => setDeleting(c)}>
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && (
        <ClientForm
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            toast(`${name} saved`);
            load();
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete client?"
        body={
          <>
            <span className="font-medium text-ink">{deleting?.name}</span> will be removed. This only works if the client has
            no engagements.
          </>
        }
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function ClientForm({
  client,
  onClose,
  onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(client?.name ?? "");
  const [gstin, setGstin] = useState(client?.gstin ?? "");
  const [email, setEmail] = useState(client?.contact_email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { name, gstin: gstin || null, contact_email: email || null };
    try {
      if (client) await api.updateClient(client.id, body);
      else await api.createClient(body);
      onSaved(name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal open title={client ? "Edit client" : "Add client"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Legal name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="GSTIN" hint="15 characters, e.g. 27AABCA1234F1Z5. Leave blank if not registered yet.">
          <Input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            maxLength={15}
            className="font-mono tracking-wide"
          />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {client ? "Save changes" : "Add client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
