"use client";

import { useEffect, useRef, useState } from "react";

// A centered, translucent "sheet" matching macOS/iOS system dialogs: frosted-glass vibrancy,
// a continuous rounded panel, a drag-handle grabber, and Apple's own spring easing curve
// (cubic-bezier(0.32,0.72,0,1)) for the enter/exit transition.
export function AppleModal({
  open,
  onClose,
  label,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timeout = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mounted, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6" role="presentation">
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 bg-slate-950/40 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative mt-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/60 bg-white/85 shadow-[0_40px_120px_-24px_rgba(0,0,0,0.45)] backdrop-blur-2xl outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:mt-0 dark:border-white/10 dark:bg-slate-900/85 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"
        }`}
      >
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-10 rounded-full bg-slate-300/70 dark:bg-slate-600/70" />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/70 px-5 pt-2 pb-4 sm:px-8 dark:border-white/10">
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900/5 text-slate-500 transition hover:bg-slate-900/10 hover:text-slate-700 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/70 px-5 py-3.5 sm:px-8 dark:border-white/10 dark:bg-slate-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
