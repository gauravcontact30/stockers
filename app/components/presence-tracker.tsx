"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isAdminPath } from "../lib/section-routes";
import { HEARTBEAT_MS } from "../lib/presence-report";
import { SESSION_KEY, idFrom } from "../lib/track";
import { visitorId } from "./visit-tracker";

/**
 * Says, once a minute, that this tab is still here.
 *
 * Mounted app-wide beside `VisitTracker`, and the difference between the two is the whole reason
 * this exists. A visit is reported once and then folded away for half an hour, which makes it a
 * good record of an arrival and useless as evidence of a person still reading — somebody twenty
 * minutes into an article emits nothing at all. The live count on the admin dashboard needs a
 * signal that repeats while nothing is happening, so here it is.
 *
 * It renders nothing, blocks nothing and sends the same three things the visit tracker does: a
 * random per-browser id, a random per-tab id and a path. No name, no account details, no query
 * string — the server attaches the account itself, from the session token.
 *
 * Only while the tab is actually in front of somebody. A backgrounded tab is not a person using
 * the site, and counting one would turn the headline figure into "tabs left open since Tuesday".
 * Nothing reports that a tab was closed — `beforeunload` does not fire reliably on a phone — so
 * going quiet is how leaving is expressed, and the server drops a sitting that stops beating.
 */
export function PresenceTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // The admin's own tour of the dashboard is not somebody using the site, and counting it would
    // put the person reading the live list onto the live list. The same rule `VisitTracker` follows.
    //
    // Membership rather than a `/admin` prefix: the admin pages sit in the `app/(admin)` route
    // group now, so they have no shared prefix left to test for. See `isAdminPath`.
    if (isAdminPath(pathname)) return;

    const beat = () => {
      // `hidden` covers a backgrounded tab and a locked phone; anything else — including the
      // "prerender" state — is treated as present, because the alternative is under-counting
      // somebody who is genuinely there.
      if (document.visibilityState === "hidden") return;

      try {
        void fetch("/api/analytics/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            path: pathname,
            visitorId: visitorId(),
            sessionId: idFrom("sessionStorage", SESSION_KEY, "s"),
          }),
        })
          // The empty body of the 204 is read, and thrown away, on purpose.
          //
          // Nothing here wants the answer - the route has none, by design - but a response nobody
          // reads is not free: Chrome cancels the unread stream and reports the request as
          // `net::ERR_ABORTED`, so every heartbeat this component sent turned up in the reader's
          // console as a failed request against a 204 that had in fact succeeded. Draining it is
          // what tells the browser the exchange is finished. Measured both ways in a headless
          // Chrome against the running app: unread aborts, drained does not, and the same is true
          // of a plain fetch as of a `keepalive` one.
          .then((response) => response.arrayBuffer())
          .catch(() => undefined);
      } catch {
        // No fetch, no storage, no network. None of it is worth an error in a reader's console,
        // and none of it changes the page they came for.
      }
    };

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    // So returning to a tab that has been in the background reports straight away rather than
    // leaving the reader missing from the list until the next tick.
    document.addEventListener("visibilitychange", beat);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [pathname]);

  return null;
}
