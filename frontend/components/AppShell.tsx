"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  IconBuilding,
  IconCheckSquare,
  IconFolder,
  IconHome,
  IconLayers,
  IconLogout,
  IconMenu,
  IconUsers,
  IconX,
} from "./icons";
import { Avatar, Skeleton, cx } from "./ui";

type NavItem = { href: string; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; roles: Role[] };

const WORK: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconHome, roles: ["ADMIN", "MANAGER", "MEMBER"] },
  { href: "/tasks", label: "Tasks", icon: IconCheckSquare, roles: ["ADMIN", "MANAGER", "MEMBER"] },
  { href: "/engagements", label: "Engagements", icon: IconFolder, roles: ["ADMIN", "MANAGER", "MEMBER"] },
];
const ADMIN: NavItem[] = [
  { href: "/admin/clients", label: "Clients", icon: IconBuilding, roles: ["ADMIN"] },
  { href: "/admin/service-types", label: "Services", icon: IconLayers, roles: ["ADMIN"] },
  { href: "/admin/users", label: "People", icon: IconUsers, roles: ["ADMIN"] },
];

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MANAGER: "Manager", MEMBER: "Team member" };

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-md bg-ink text-white">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 4.5h10M3 8h7M3 11.5h4" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Ledgerline</span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) return <ShellSkeleton />;

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  const link = (n: NavItem) => {
    const active = pathname === n.href || pathname.startsWith(n.href + "/");
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={() => setMenuOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cx(
          "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors",
          active ? "bg-surface text-ink shadow-card" : "text-muted hover:bg-black/[0.035] hover:text-ink",
        )}
      >
        <Icon className={cx(active ? "text-ink" : "text-faint group-hover:text-muted")} />
        {n.label}
      </Link>
    );
  };

  const adminItems = ADMIN.filter((n) => n.roles.includes(user.role));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Logo />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2" aria-label="Main">
        {WORK.filter((n) => n.roles.includes(user.role)).map(link)}
        {adminItems.length > 0 && (
          <>
            <div className="mb-1 mt-6 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Admin</div>
            {adminItems.map(link)}
          </>
        )}
      </nav>
      <div className="m-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2.5 shadow-xs">
        <Avatar name={user.name} id={user.id} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-ink">{user.name}</div>
          <div className="truncate text-xs text-muted">{ROLE_LABEL[user.role]}</div>
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          <IconLogout />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-canvas lg:block">{sidebar}</aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button
          className="rounded-md p-2 text-muted hover:bg-subtle hover:text-ink"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <IconMenu width={18} height={18} />
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 animate-fade-in bg-ink/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMenuOpen(false)}>
          <aside className="relative h-full w-64 animate-slide-in bg-canvas shadow-pop" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute right-3 top-3.5 rounded-md p-1.5 text-muted hover:bg-subtle"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <IconX />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {pathname.startsWith("/admin") && user.role !== "ADMIN" ? (
            <div className="mx-auto max-w-sm py-24 text-center">
              <p className="text-sm font-medium text-ink">You don&apos;t have access to this page</p>
              <p className="mt-1 text-sm text-muted">Only admins can manage clients, services and people.</p>
              <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2">
                Back to dashboard
              </Link>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line p-5 lg:block">
        <Skeleton className="h-6 w-28" />
        <div className="mt-8 space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      </aside>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-3 h-4 w-72" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    </div>
  );
}
