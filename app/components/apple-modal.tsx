"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A centered, translucent "sheet" matching macOS/iOS system dialogs: frosted-glass vibrancy,
// a continuous rounded panel, a drag-handle grabber, and Apple's own spring easing curve
// (cubic-bezier(0.32,0.72,0,1)) for the enter/exit transition.
export function AppleModal({
  open,
  onClose,
  label,
  header,
  footer,
  wide = false,
  compact = false,
  dense = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  compact?: boolean;
  dense?: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      let visibleFrame = 0;
      const mountedFrame = requestAnimationFrame(() => {
        setMounted(true);
        visibleFrame = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(mountedFrame);
        cancelAnimationFrame(visibleFrame);
      };
    }
    const frame = requestAnimationFrame(() => setVisible(false));
    const timeout = setTimeout(() => setMounted(false), 220);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
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
    if (open && mounted) panelRef.current?.focus();
  }, [mounted, open]);

  // Rendered on the server as nothing: a portal needs a document, and a sheet that starts closed
  // has nothing to show either way.
  if (!mounted || typeof document === "undefined") return null;

  // Portalled to the body rather than left where it was written.
  //
  // `position: fixed` covers the viewport, but painting order is decided inside whatever stacking
  // context the element sits in — and these sheets are opened from deep inside the page. The
  // subscribe sheet opens from a lock panel that lives in a `z-10` overlay, so its own `z-50` only
  // ever ranked it against that overlay's siblings: the sticky header and the cards around it went
  // straight over the top of it. An ancestor with a transform or a filter would have been worse
  // still, since that makes `fixed` behave like `absolute` and the nearest `overflow-hidden` then
  // clips the sheet into the card it came from. On the body there is no ancestor left to lose to.
  const widthClass = wide ? (dense ? "max-w-5xl" : "max-w-6xl") : compact ? "max-w-xl" : "max-w-3xl";
  const heightClass = dense ? "max-h-[72dvh]" : "max-h-[82dvh]";
  const headerClass = dense
    ? "flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/70 px-4 pt-1 pb-2.5 sm:px-5 dark:border-white/10"
    : "flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/70 px-5 pt-2 pb-4 sm:px-8 dark:border-white/10";
  const bodyClass = dense ? "flex-1 overflow-y-auto px-4 py-3 sm:px-4" : "flex-1 overflow-y-auto px-5 py-5 sm:px-6";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      role="presentation"
    >
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
        // 85dvh, not 85vh: on a phone `vh` is measured against the viewport with the browser's
        // address bar collapsed, so 85vh is taller than what is actually on screen and the foot of
        // the sheet — where its buttons are — sits below the fold. `dvh` tracks the real viewport.
        className={`relative mt-8 flex ${heightClass} w-full ${widthClass} flex-col overflow-hidden rounded-[24px] border border-white/60 bg-white/85 shadow-[0_40px_120px_-24px_rgba(0,0,0,0.45)] backdrop-blur-2xl outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] sm:mt-0 dark:border-white/10 dark:bg-slate-900/85 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"
        }`}
      >
        <div className="flex shrink-0 justify-center pt-2">
          <div className="h-1 w-9 rounded-full bg-slate-300/70 dark:bg-slate-600/70" />
        </div>

        <div className={headerClass}>
          <div className="min-w-0 flex-1">{header}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900/5 text-slate-500 transition hover:bg-slate-900/10 hover:text-slate-700 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={bodyClass}>{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-slate-200/70 bg-slate-50/70 px-5 py-3.5 sm:px-8 dark:border-white/10 dark:bg-slate-950/40">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
