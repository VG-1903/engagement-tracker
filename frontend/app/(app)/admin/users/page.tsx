"use client";

import { useCallback, useEffect, useState } from "react";
import { IconPlus } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Table,
  Td,
  Th,
  cx,
} from "@/components/ui";
import { ApiError, api, type Role, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const ROLE_HINT: Record<Role, string> = {
  ADMIN: "Full access, including setup",
  MANAGER: "Runs engagements and reviews work",
  MEMBER: "Works on assigned tasks",
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
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

  async function update(u: User, body: Record<string, unknown>, message: string) {
    setError(null);
    try {
      await api.updateUser(u.id, body);
      toast(message);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  return (
    <>
      <PageHeader
        title="People"
        subtitle="People are deactivated rather than deleted, so their history on tasks stays intact."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus /> Add person
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        </div>
      )}
      <Card className="overflow-hidden">
        {users === null ? (
          <SkeletonRows />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="w-44">Role</Th>
                <Th className="hidden w-32 sm:table-cell">Status</Th>
                <Th className="w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {users.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={cx("hover:bg-subtle/60", !u.is_active && "opacity-60")}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} id={u.id} size="md" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">
                            {u.name}
                            {self && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                          </div>
                          <div className="truncate text-[12.5px] text-muted">{u.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Select
                        value={u.role}
                        disabled={self}
                        onChange={(e) => update(u, { role: e.target.value }, `${u.name} is now ${e.target.value.toLowerCase()}`)}
                        className="h-8 w-36 text-[13px]"
                        aria-label={`Role for ${u.name}`}
                        title={ROLE_HINT[u.role]}
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MANAGER">Manager</option>
                        <option value="MEMBER">Team member</option>
                      </Select>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                        <span className={cx("size-1.5 rounded-full", u.is_active ? "bg-emerald-500" : "bg-stone-400")} />
                        {u.is_active ? "Active" : "Deactivated"}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {!self && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            update(u, { is_active: !u.is_active }, u.is_active ? `${u.name} deactivated` : `${u.name} reactivated`)
                          }
                        >
                          {u.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {creating && (
        <NewUser
          onClose={() => setCreating(false)}
          onSaved={(name) => {
            setCreating(false);
            toast(`${name} added`);
            load();
          }}
        />
      )}
    </>
  );
}

function NewUser({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "MEMBER" as Role });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createUser(form);
      onSaved(form.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <Modal open title="Add person" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={form.name} onChange={set("name")} required autoFocus />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} required />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters">
            <Input type="password" value={form.password} onChange={set("password")} minLength={8} required />
          </Field>
          <Field label="Role" hint={ROLE_HINT[form.role]}>
            <Select value={form.role} onChange={set("role")}>
              <option value="MEMBER">Team member</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add person</Button>
        </div>
      </form>
    </Modal>
  );
}
