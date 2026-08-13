// Reporting what the reader did.
//
// One function, called from wherever an interaction happens. It never throws, never awaits and
// never blocks the thing it is reporting: a feature that stops working because telemetry failed is
// a worse product than one with a gap in a chart.
//
// What travels is a fixed action name from `ACTIONS` and, at most, a short label from a fixed
// alphabet — a ticker, a section id, a plan name. Never what somebody typed. The server drops
// anything else, but the rule is easier to keep if the client does not send it in the first place.
//
// This lives in `lib` rather than `components` because it renders nothing and has no hooks; the
// visitor id and session id it reads are the same ones `components/visit-tracker` mints.

import type { ActionKey } from "./analytics";

/** Where the browser keeps the id that makes one returning person countable as one person. */
const VISITOR_KEY = "stockers-visitor";
/** Per-tab, so a run of events can be read back as one sitting rather than as scattered hits. */
const SESSION_KEY = "stockers-session";

function mint(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * An id from the given store, minting and keeping one the first time.
 *
 * Null when storage is unavailable — a private-mode browser throws on access — in which case the
 * event is still reported, just without the id, and counts as one anonymous interaction.
 */
function idFrom(store: "localStorage" | "sessionStorage", key: string, prefix: string): string | null {
  try {
    const storage = window[store];
    const stored = storage.getItem(key) ?? "";
    const id = /^[A-Za-z0-9_-]{8,64}$/.test(stored) ? stored : mint(prefix);
    storage.setItem(key, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * Records one interaction. Fire and forget: nothing is returned and nothing is awaited.
 *
 * @param action one of the keys of `ACTIONS` — the closed list the server will accept.
 * @param label what it was done to: a ticker, a section id, a plan name. Optional.
 */
export function track(action: ActionKey, label?: string | null): void {
  try {
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // So an action reported as the reader navigates away — a checkout, a sign-out — still goes.
      keepalive: true,
      body: JSON.stringify({
        type: "action",
        action,
        label: label ?? null,
        path: window.location?.pathname ?? null,
        visitorId: idFrom("localStorage", VISITOR_KEY, "v"),
        sessionId: idFrom("sessionStorage", SESSION_KEY, "s"),
      }),
    }).catch(() => undefined);
  } catch {
    // No fetch, no window, no storage — none of which is worth an error in a reader's console.
  }
}
