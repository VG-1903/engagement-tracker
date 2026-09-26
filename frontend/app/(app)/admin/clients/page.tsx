"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, ErrorBanner, Field, Input, Modal, PageHeader, Spinner } from "@/components/ui";
import { ApiError, api, type Client } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  const load = useCallback(() => {
    api
      .clients()
      .then((p) => setClients(p.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  async function remove(c: Client) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await api.deleteClient(c.id);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHeader title="Clients" actions={<Button onClick={() => setEditing("new")}>Add client</Button>} />
      <div className="mb-4">
        <ErrorBanner error={error} />
      </div>
      <Card className="overflow-hidden">
        {clients === null ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <Empty>No clients yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">GSTIN</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">Added</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{c.gstin ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.contact_email ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtDate(c.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => remove(c)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <ClientForm
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ClientForm({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(client?.name ?? "");
  const [gstin, setGstin] = useState(client?.gstin ?? "");
  const [email, setEmail] = useState(client?.contact_email ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name, gstin: gstin || null, contact_email: email || null };
    try {
      if (client) await api.updateClient(client.id, body);
      else await api.createClient(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title={client ? "Edit client" : "Add client"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="GSTIN" hint="15 characters, e.g. 27AABCA1234F1Z5 (optional)">
          <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} maxLength={15} className="font-mono" />
        </Field>
        <Field label="Contact email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
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
