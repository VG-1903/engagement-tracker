"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { IconAlert, IconCheck } from "./icons";
import { cx } from "./ui";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-sm animate-toast-in items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-pop"
          >
            <span
              className={cx(
                "flex size-5 shrink-0 items-center justify-center rounded-full",
                t.tone === "success" && "bg-emerald-50 text-emerald-600",
                t.tone === "error" && "bg-rose-50 text-rose-600",
                t.tone === "info" && "bg-accent-soft text-accent",
              )}
            >
              {t.tone === "error" ? <IconAlert width={12} height={12} /> : <IconCheck width={12} height={12} />}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
