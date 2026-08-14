"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Pulls the server-rendered exchange section down again on a timer.
 *
 * The live market board is a Server Component: its figures are resolved on the server and streamed
 * into the page, which is what keeps 4,900 scrips of ranking out of the browser. That also means it
 * is a snapshot — without this it would show the session as it stood when the page was requested,
 * for as long as the tab stayed open.
 *
 * `router.refresh()` re-runs the server render and reconciles the result into the existing tree, so
 * the numbers change in place: no full navigation, no scroll jump, no loss of what the reader had
 * typed into the boards further down. The page's own `revalidate = 60` means a refresh inside the
 * same minute is served from the cache rather than re-hitting the exchange, which is why the
 * interval matches it.
 *
 * Paused while the tab is hidden. A background tab polling the exchange every minute for hours is
 * work nobody is looking at, and on a phone it is battery spent on a page that is not on screen.
 */
export function MarketRefresher({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };

    const start = () => {
      stop();
      timer = window.setInterval(() => router.refresh(), intervalMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Straight away on the way back: a reader returning to the tab is the moment the figures
        // are most likely to be stale, and waiting a full minute to correct that is the wrong way
        // round.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, intervalMs]);

  return null;
}
