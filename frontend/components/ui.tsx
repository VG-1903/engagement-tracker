"use client";

import { Children, cloneElement, isValidElement, useEffect, useId } from "react";
import type { TaskStatus } from "@/lib/api";
import { STATUS_LABEL, STATUS_TONE, initials } from "@/lib/format";
import { IconAlert, IconX } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- buttons */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-ink text-white shadow-xs hover:bg-ink-2",
        variant === "accent" && "bg-accent text-white shadow-xs hover:bg-accent/90",
        variant === "secondary" &&
          "border border-line-strong bg-surface text-ink shadow-xs hover:border-faint hover:bg-subtle",
        variant === "ghost" && "text-muted hover:bg-subtle hover:text-ink",
        variant === "danger" && "border border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100",
        className,
      )}
    />
  );
}

/* ---------------------------------------------------------------- form */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // Label and hint are linked by id (not by wrapping), so a <select>'s accessible name is just the
  // label, never the concatenated text of its options.
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const only = Children.only(children);
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(only)
    ? cloneElement(only, { id: only.props.id ?? id, "aria-describedby": hintId })
    : only;
  const controlId = isValidElement<{ id?: string }>(only) ? (only.props.id ?? id) : id;
  return (
    <div className={cx("block", className)}>
      <label htmlFor={controlId} className="mb-1.5 block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {control}
      {hint && (
        <span id={hintId} className="mt-1.5 block text-xs text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

const control =
  "block w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink shadow-xs outline-none transition-colors " +
  "placeholder:text-faint hover:border-faint focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:bg-subtle disabled:text-muted";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, "h-9", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(control, "py-2 leading-relaxed", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        control,
        "ui-select h-9 appearance-none pr-8",
        props.className,
      )}
    />
  );
}

/* ---------------------------------------------------------------- surfaces */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-surface shadow-card", className)}>{children}</div>;
}

export function CardHeader({ title, meta, actions }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {meta && <span className="text-xs text-muted">{meta}</span>}
      </div>
      {actions}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-[13px] text-muted">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- status & people */

export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", STATUS_TONE[status].dot, className)} />;
}

export function StatusBadge({ status, variant = "plain" }: { status: TaskStatus; variant?: "plain" | "chip" }) {
  if (variant === "chip")
    return (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
          STATUS_TONE[status].chip,
        )}
      >
        <StatusDot status={status} className="size-1.5" />
        {STATUS_LABEL[status]}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-ink-2">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const AVATAR_TONES = [
  "bg-[#e8ecf7] text-[#3b4a7a]",
  "bg-[#e9f2ec] text-[#35644a]",
  "bg-[#f5ebe4] text-[#7a4b32]",
  "bg-[#efe9f5] text-[#5b3f7a]",
  "bg-[#e6f1f3] text-[#2f6470]",
  "bg-[#f4ecd9] text-[#6d5626]",
];

export function Avatar({ name, id, size = "sm" }: { name: string; id: number; size?: "xs" | "sm" | "md" }) {
  return (
    <span
      title={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_TONES[id % AVATAR_TONES.length],
        size === "xs" && "size-5 text-[9px]",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Person({ user, empty = "Unassigned" }: { user: { id: number; name: string } | null; empty?: string }) {
  if (!user) return <span className="text-[13px] text-faint">{empty}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
      <Avatar name={user.name} id={user.id} />
      <span className="truncate">{user.name}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- feedback */

export function ErrorBanner({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex animate-fade-in items-start gap-2.5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-3 py-2.5 text-sm text-rose-800"
    >
      <IconAlert className="mt-0.5 shrink-0" />
      <span className="flex-1">{error}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="rounded p-0.5 text-rose-500 hover:bg-rose-100" aria-label="Dismiss">
          <IconX width={14} height={14} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-line bg-subtle text-muted">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-subtle", className)} />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-label="Loading" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="hidden h-3.5 w-1/4 sm:block" />
          <Skeleton className="ml-auto h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- segmented control */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-line bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cx("tabular-nums", value === o.value ? "text-muted" : "text-faint")}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- modal */

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-ink/25 p-4 pt-[8vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-lg animate-pop-in rounded-xl border border-line bg-surface shadow-pop"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 id={id} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-1 rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="px-5 pb-5 pt-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cx(
        "border-b border-line bg-subtle/50 px-4 py-2 text-left text-xs font-medium text-muted first:pl-5 last:pr-5",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-middle first:pl-5 last:pr-5", className)}>{children}</td>;
}

/* ---------------------------------------------------------------- confirm */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="text-sm text-ink-2">{body}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
