"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Spinner, cx } from "./ui";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "MANAGER", "MEMBER"] },
  { href: "/tasks", label: "Tasks", roles: ["ADMIN", "MANAGER", "MEMBER"] },
  { href: "/engagements", label: "Engagements", roles: ["ADMIN", "MANAGER", "MEMBER"] },
  { href: "/admin/clients", label: "Clients", roles: ["ADMIN"] },
  { href: "/admin/service-types", label: "Services & templates", roles: ["ADMIN"] },
  { href: "/admin/users", label: "Users", roles: ["ADMIN"] },
];

const ROLE_STYLE: Record<Role, string> = {
  ADMIN: "bg-rose-100 text-rose-800",
  MANAGER: "bg-indigo-100 text-indigo-800",
  MEMBER: "bg-slate-200 text-slate-700",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <Spinner />;

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const adminStart = items.findIndex((n) => n.href.startsWith("/admin"));

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {items.map((n, i) => (
        <div key={n.href}>
          {i === adminStart && (
            <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Admin</div>
          )}
          <Link
            href={n.href}
            onClick={() => setMenuOpen(false)}
            className={cx(
              "block rounded-md px-3 py-2 text-sm font-medium",
              pathname.startsWith(n.href)
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {n.label}
          </Link>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="flex h-14 items-center border-b border-slate-200 px-5">
          <span className="font-semibold text-slate-900">Engagement Tracker</span>
        </div>
        {nav}
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={() => setMenuOpen(false)}>
          <aside className="h-full w-64 bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center border-b border-slate-200 px-5 font-semibold">Engagement Tracker</div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:px-8">
          <button
            className="rounded p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-700 sm:inline">{user.name}</span>
            <span className={cx("rounded px-1.5 py-0.5 text-xs font-semibold", ROLE_STYLE[user.role])}>{user.role}</span>
            <button
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="text-slate-500 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
