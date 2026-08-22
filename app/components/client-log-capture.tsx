"use client";

import { useEffect } from "react";

const ENDPOINT = "/api/admin/logs";
const MAX_PER_MINUTE = 30;
const SLOW_HTTP_MS = 5_000;
const FLUSH_DELAY_MS = 1_500;
const BATCH_SIZE = 10;

type ClientLogLevel = "info" | "warn" | "error";
type ClientLogPayload = {
  level: ClientLogLevel;
  source: "client";
  operation: string;
  message: string;
  path: string;
  method: string;
  statusCode: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
};

function payload(level: ClientLogLevel, message: string, operation: string, metadata: Record<string, unknown> = {}): ClientLogPayload {
  return {
    level,
    source: "client",
    operation,
    message,
    path: typeof metadata.path === "string" ? metadata.path : window.location.pathname,
    method: typeof metadata.method === "string" ? metadata.method : "CLIENT",
    statusCode: typeof metadata.statusCode === "number" ? metadata.statusCode : null,
    durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : null,
    metadata: {
      userAgent: navigator.userAgent,
      href: window.location.href,
      ...metadata,
    },
  };
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return window.location.pathname;
  }
}

function sendBatch(logs: ClientLogPayload[]) {
  if (logs.length === 0) return;
  const body = JSON.stringify({ logs });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(ENDPOINT, blob)) return;
  }

  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    // Drained rather than ignored - an unread response is reported as an aborted request in the
    // console, however well it went, and a log shipper that files console errors of its own is the
    // one thing this component must not be. See the note in ./presence-tracker.
    .then((response) => response.arrayBuffer())
    .catch(() => undefined);
}

export function ClientLogCapture() {
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let idle: number | null = null;
    let fallbackTimer: number | null = null;

    const install = () => {
      let windowStart = Date.now();
      let sent = 0;
      const allow = () => {
        const now = Date.now();
        if (now - windowStart >= 60_000) {
          windowStart = now;
          sent = 0;
        }
        if (sent >= MAX_PER_MINUTE) return false;
        sent++;
        return true;
      };

      const queue: ClientLogPayload[] = [];
      let flushTimer: number | null = null;
      const flush = () => {
        if (flushTimer !== null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        const batch = queue.splice(0, BATCH_SIZE);
        sendBatch(batch);
        if (queue.length > 0) flushTimer = window.setTimeout(flush, FLUSH_DELAY_MS);
      };
      const enqueue = (entry: ClientLogPayload) => {
        queue.push(entry);
        if (queue.length >= BATCH_SIZE) {
          flush();
          return;
        }
        flushTimer ??= window.setTimeout(flush, FLUSH_DELAY_MS);
      };

      const originalError = console.error;
      const originalWarn = console.warn;
      const originalInfo = console.info;
      const originalFetch = window.fetch.bind(window);

      console.error = (...args: unknown[]) => {
        originalError(...args);
        if (!allow()) return;
        enqueue(
          payload(
            "error",
            args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "),
            "client.console_error",
            {
              stack: args.find((arg): arg is Error => arg instanceof Error)?.stack ?? null,
            },
          ),
        );
      };
      console.warn = (...args: unknown[]) => {
        originalWarn(...args);
        if (!allow()) return;
        enqueue(payload("warn", args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "), "client.console_warn"));
      };
      console.info = (...args: unknown[]) => {
        originalInfo(...args);
        if (!allow()) return;
        enqueue(payload("info", args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" "), "client.console_info"));
      };
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const started = performance.now();
        try {
          const response = await originalFetch(input, init);
          const durationMs = Math.round(performance.now() - started);
          if (allow() && response.url && !response.url.includes(ENDPOINT) && (response.status >= 400 || durationMs >= SLOW_HTTP_MS)) {
            enqueue(
              payload(response.status >= 500 ? "error" : "warn", `Browser fetch returned HTTP ${response.status}.`, "client.fetch", {
                url: response.url,
                path: pathOf(response.url),
                statusCode: response.status,
                durationMs,
                method: init?.method ?? (input instanceof Request ? input.method : "GET"),
              }),
            );
          }
          return response;
        } catch (error) {
          if (allow()) {
            enqueue(
              payload("error", error instanceof Error ? error.message : "Browser fetch failed.", "client.fetch_exception", {
                stack: error instanceof Error ? error.stack : null,
                method: init?.method ?? (input instanceof Request ? input.method : "GET"),
              }),
            );
          }
          throw error;
        }
      };

      const onError = (event: ErrorEvent) => {
        if (!allow()) return;
        enqueue(payload("error", event.message || "Unhandled browser error.", "client.window_error", { stack: event.error?.stack ?? null }));
      };

      const onRejection = (event: PromiseRejectionEvent) => {
        if (!allow()) return;
        const reason = event.reason;
        enqueue(
          payload("error", reason instanceof Error ? reason.message : String(reason ?? "Unhandled promise rejection."), "client.unhandled_rejection", {
            stack: reason instanceof Error ? reason.stack : null,
          }),
        );
      };

      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onRejection);
      window.addEventListener("visibilitychange", flush);
      window.addEventListener("pagehide", flush);

      cleanup = () => {
        flush();
        console.error = originalError;
        console.warn = originalWarn;
        console.info = originalInfo;
        window.fetch = originalFetch;
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        window.removeEventListener("visibilitychange", flush);
        window.removeEventListener("pagehide", flush);
      };
    };

    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(install, { timeout: 3_000 });
    } else {
      fallbackTimer = window.setTimeout(install, 2_500);
    }

    return () => {
      if (idle !== null) window.cancelIdleCallback(idle);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      cleanup?.();
    };
  }, []);

  return null;
}
