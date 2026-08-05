"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AccessState = "admin" | "trial" | "active" | "expired";

export type SubscriptionStatus = {
  state: AccessState;
  allowed: boolean;
  isAdmin: boolean;
  marketDaysUsed: number;
  marketDaysLeft: number;
  trialStartedAt: string | null;
  subscribedUntil: string | null;
  today: string;
  locks: Record<string, boolean>;
  features: { key: string; label: string }[];
  signedIn: boolean;
  name: string | null;
};

type SubscriptionValue = {
  status: SubscriptionStatus | null;
  loading: boolean;
  /** Whether one named AI feature is usable right now. */
  canUse: (feature: string) => boolean;
  isLocked: (feature: string) => boolean;
  refresh: () => Promise<void>;
  /** A failed renewal always carries a message, so callers never have to invent one. */
  renew: () => Promise<{ ok: true } | { ok: false; error: string }>;
  setLock: (feature: string, locked: boolean) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionValue | null>(null);

// The auth form stores { token, user } under this key; the same shape is read here rather than
// duplicating a second source of truth for the session.
const STORAGE_KEY = "stockers-auth";

/** The session token the auth form stores. Read lazily so SSR never touches localStorage. */
export function readToken(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    // Private-mode browsers throw on localStorage access, and a corrupted blob throws on parse;
    // both mean "no usable session".
    return null;
  }
}

export function authHeaders(): Record<string, string> {
  const token = readToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const SESSION_COOKIE = "stockers_session";

/**
 * Mirrors the stored token into a same-site cookie.
 *
 * Gated endpoints are called from a dozen existing components; rather than thread an
 * Authorization header through every one of them, the cookie rides along automatically on
 * same-origin requests. Signing out clears it by expiring the cookie.
 */
export function syncSessionCookie() {
  try {
    const token = readToken();
    document.cookie = token
      ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`
      : `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // Cookies disabled — the Authorization header path still works for the status call.
  }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Kept in step on every refresh so a sign-in or sign-out in another tab is picked up.
    syncSessionCookie();

    try {
      const response = await fetch("/api/subscription", { headers: authHeaders() });
      if (!response.ok) throw new Error("Failed");
      setStatus(await response.json());
    } catch {
      // A failed status check must not lock a paying user out of the UI; the server-side guard
      // on each endpoint is what actually enforces access, so the client fails open.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    refresh();
  }, [refresh]);

  const renew = useCallback<SubscriptionValue["renew"]>(async () => {
    try {
      const response = await fetch("/api/subscription/renew", { method: "POST", headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) return { ok: false, error: data?.error ?? "Couldn't renew right now." };
      await refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Couldn't reach the subscription service." };
    }
  }, [refresh]);

  const setLock = useCallback(
    async (feature: string, locked: boolean) => {
      await fetch("/api/admin/feature-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ feature, locked }),
      });
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<SubscriptionValue>(() => {
    const isLocked = (feature: string) => status?.locks?.[feature] === true;

    return {
      status,
      loading,
      isLocked,
      canUse: (feature: string) => {
        // Until the status lands, nothing is hidden — a flash of locked UI for a subscriber is
        // worse than a moment of optimism, and the API is authoritative either way.
        if (!status) return true;
        if (status.isAdmin) return true;
        if (isLocked(feature)) return false;
        return status.allowed;
      },
      refresh,
      renew,
      setLock,
    };
  }, [status, loading, refresh, renew, setLock]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionValue {
  const value = useContext(SubscriptionContext);
  if (!value) {
    // Rendered outside the provider (an isolated test, say): behave as fully unlocked rather
    // than throwing, so a missing provider can never blank out a page.
    return {
      status: null,
      loading: false,
      canUse: () => true,
      isLocked: () => false,
      refresh: async () => {},
      renew: async () => ({ ok: true }),
      setLock: async () => {},
    };
  }
  return value;
}
