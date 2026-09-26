"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner, cx } from "@/components/ui";
import { ApiError, api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api
      .users()
      .then((p) => setUsers(p.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  async function update(u: User, body: Record<string, unknown>) {
    setError(null);
    try {
      await api.updateUser(u.id, body);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Users are deactivated rather than deleted, so task history stays intact."
        actions={<Button onClick={() => setCreating(true)}>Add user</Button>}
      />
      <div className="mb-4">
        <ErrorBanner error={error} />
      </div>
      <Card className="overflow-hidden">
        {users === null ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {users.map((u) => (
                  <tr key={u.id} className={cx(!u.is_active && "text-slate-400")}>
                    <td className="px-4 py-2.5 font-medium">{u.name}</td>
                    <td className="px-4 py-2.5">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <Select
                        value={u.role}
                        disabled={u.id === me?.id}
                        onChange={(e) => update(u, { role: e.target.value })}
                        className="w-auto"
                        aria-label={`Role for ${u.name}`}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MANAGER">Manager</option>
                        <option value="MEMBER">Member</option>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">{u.is_active ? "Active" : "Deactivated"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" onClick={() => update(u, { is_active: !u.is_active })}>
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && (
        <NewUser
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

function NewUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "MEMBER" as Role });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createUser(form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title="Add user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Name">
          <Input value={form.name} onChange={set("name")} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Initial password" hint="At least 8 characters">
          <Input type="password" value={form.password} onChange={set("password")} minLength={8} required />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={set("role")}>
            <option value="MEMBER">Member</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
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
