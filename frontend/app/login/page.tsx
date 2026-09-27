"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/AppShell";
import { Button, ErrorBanner, Field, Input, cx } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const DEMO = [
  { role: "Admin", who: "Asha Admin", email: "admin@example.com", password: "Admin@123", note: "Everything, plus setup" },
  { role: "Manager", who: "Priya Sharma", email: "priya.manager@example.com", password: "Manager@123", note: "Assigns and reviews work" },
  { role: "Member", who: "Anita Desai", email: "anita@example.com", password: "Member@123", note: "Works on assigned tasks" },
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

  async function signIn(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      {/* form */}
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">Client engagements, deadlines and reviews in one place.</p>

          <form onSubmit={signIn} className="mt-8 space-y-4">
            <ErrorBanner error={error} />
            <Field label="Email">
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.com"
                required
              />
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
              {busy ? "Signing in…" : "Continue"}
            </Button>
          </form>

          <div className="mt-10">
            <div className="flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-line" />
              Or try a demo account
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="mt-4 space-y-2">
              {DEMO.map((d) => (
                <button
                  key={d.role}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEmail(d.email);
                    setPassword(d.password);
                    signIn(undefined, d);
                  }}
                  className={cx(
                    "group flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left shadow-xs",
                    "transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50",
                  )}
                >
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">
                      {d.role} <span className="font-normal text-muted">· {d.who}</span>
                    </span>
                    <span className="block text-xs text-muted">{d.note}</span>
                  </span>
                  <span className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-faint">Demo data only. No real client information.</p>
      </div>

      {/* aside */}
      <div className="relative hidden overflow-hidden border-l border-line bg-subtle lg:block">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgb(28 27 25 / 0.09) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-14">
          <PreviewCard />
          <p className="mt-10 max-w-sm text-sm leading-relaxed text-muted">
            Monthly GST, registrations and refunds, each with its own checklist, owner and deadline. Managers review
            every piece of work before it&apos;s marked done.
          </p>
        </div>
      </div>
    </div>
  );
}

function PreviewCard() {
  const rows = [
    { t: "Collect sales & purchase data", s: "bg-emerald-500", d: "Done" },
    { t: "Reconcile purchases with GSTR-2B", s: "bg-emerald-500", d: "Done" },
    { t: "Prepare & file GSTR-1", s: "bg-violet-500", d: "In review" },
    { t: "Prepare & file GSTR-3B, pay tax", s: "bg-sky-500", d: "In 6 days" },
  ];
  return (
    <div className="w-full max-w-sm rotate-[-1.2deg] rounded-xl border border-line bg-surface p-5 shadow-pop">
      <div className="text-xs text-muted">Arora Textiles · Monthly GST</div>
      <div className="mt-0.5 font-semibold text-ink">September 2026</div>
      <div className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-subtle">
        <div className="w-1/2 bg-emerald-500" />
        <div className="w-1/4 bg-violet-400" />
        <div className="w-1/4 bg-sky-400" />
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.t} className="flex items-center gap-2.5 text-[13px]">
            <span className={cx("size-2 rounded-full", r.s)} />
            <span className="flex-1 truncate text-ink-2">{r.t}</span>
            <span className="text-xs text-muted">{r.d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
