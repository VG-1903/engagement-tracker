"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DEMO = [
  { label: "Admin", email: "admin@example.com", password: "Admin@123" },
  { label: "Manager", email: "priya.manager@example.com", password: "Manager@123" },
  { label: "Member", email: "anita@example.com", password: "Member@123" },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Engagement Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage client engagements and tasks.</p>
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          <ErrorBanner error={error} />
          <Field label="Email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <Button
                key={d.label}
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
