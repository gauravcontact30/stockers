"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const SubscriptionReminder = dynamic(() => import("./subscription-reminder").then((module) => module.SubscriptionReminder), {
  loading: () => null,
});

export function SubscriptionReminderLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const browser = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };

    if (typeof browser.requestIdleCallback === "function") {
      const id = browser.requestIdleCallback(() => setReady(true), { timeout: 4_000 });
      return () => browser.cancelIdleCallback?.(id);
    }

    const timer = globalThis.setTimeout(() => setReady(true), 1_500);
    return () => globalThis.clearTimeout(timer);
  }, []);

  return ready ? <SubscriptionReminder /> : null;
}
