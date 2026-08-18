import "server-only";

// Is this deployment wired up?
//
// The app degrades rather than fails when a service is missing: no Supabase and the account store
// falls back to a JSON file, no OpenRouter key and the AI reads are composed from the figures
// instead, no Razorpay and checkout cannot open. Each of those is deliberate and each is silent â€”
// which is right for a visitor and wrong for the person running it. An admin looking at a quiet
// dashboard cannot currently tell "nobody subscribed today" from "payments were never configured".
//
// This is that answer, in one object.
//
// ---------------------------------------------------------------------------
// It reports booleans, never values
// ---------------------------------------------------------------------------
//
// Nothing here returns a key, a secret, a token or a connection string, and the one value it does
// return â€” the Supabase project URL â€” is not a secret: it ships in the browser bundle of every app
// that uses one. Everything else is "configured: true". A health endpoint that echoed its own
// credentials back would be a far worse bug than the misconfiguration it was built to find.

import { mailTransportName } from "./mailer";
import { smsTransportName } from "./sms";
import { supabaseConfig, supabaseConfigured, supabaseRequest } from "./supabase";

export type CheckState = "ok" | "degraded" | "off";

export type HealthCheck = {
  key: string;
  label: string;
  state: CheckState;
  /** What is true right now, in one line. */
  detail: string;
  /** What the app does in this state â€” the reason `degraded` is not always a problem. */
  consequence: string;
  /**
   * How long this check's probe took, in milliseconds. Null for a check that has nothing to probe.
   *
   * The measured half of the panel. A configuration flag can only ever say "set" or "not set",
   * which is enough to find a missing key and useless for finding a database that answers in two
   * seconds â€” and a store that is technically reachable but slow is the failure an admin actually
   * has to catch, because nothing else in the app reports it.
   */
  latencyMs: number | null;
};

/**
 * The measured figures behind the panel: how this process is doing, not merely how it is set up.
 *
 * Everything here is read at the moment the report is built and is true only of the instance that
 * answered â€” on a serverless host the next request may land on a different one, which is why the
 * panel labels the process figures as belonging to "this instance" rather than to the deployment.
 */
export type HealthStats = {
  /** How long this server process has been up, in whole seconds. */
  uptimeSeconds: number;
  /** Resident memory of this process, in MB. */
  memoryMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  nodeVersion: string;
  /** NODE_ENV, so a production dashboard cannot be mistaken for a development one. */
  environment: string;
  /** How long every probe in this report took, wall-clock, in milliseconds. */
  probeMs: number;
  /** The slowest single probe, or null when there was nothing to probe. */
  slowestMs: number | null;
  /** How the checks came out, for a one-glance count rather than a list to be read. */
  counts: { ok: number; degraded: number; off: number; total: number };
};

export type HealthReport = {
  checks: HealthCheck[];
  /** The worst state across the checks, for the panel's headline. */
  worst: CheckState;
  /** Which store the account data is actually in. */
  backend: "supabase" | "file";
  /** The project URL, or null. Not a secret â€” see the header. */
  projectUrl: string | null;
  /** The measured half â€” see `HealthStats`. */
  stats: HealthStats;
  checkedAt: string;
};

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** True when any of the names is set â€” for a service with more than one accepted variable. */
function anyConfigured(...names: string[]): boolean {
  return names.some(configured);
}

/** What one probe found: whether the table answered, and how long it took to say so. */
type Probe = { ok: boolean; ms: number };

/** A probe that never ran, for the checks that have nothing to reach. */
const NOT_PROBED: Probe = { ok: false, ms: 0 };

/**
 * Whether a table is actually reachable, not merely configured â€” and how quickly.
 *
 * A zero-row read rather than a count: this runs on every load of the overview, and the question is
 * "does PostgREST answer for this table", which one row settles as well as ten thousand.
 *
 * The duration is kept because the panel refreshes itself now, and a number that moves is the only
 * way a reader can tell a healthy store from one that is answering but struggling. It is measured
 * around the call rather than taken from the response, so it includes the network â€” which is the
 * part that actually goes wrong.
 */
async function tableReachable(table: string): Promise<Probe> {
  const started = Date.now();
  try {
    await supabaseRequest({ method: "GET", path: `${table}?select=*&limit=1` });
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

/** Bytes as whole MB, which is the only resolution a memory figure is read at. */
function megabytes(bytes: number): number {
  return Math.round(bytes / 1_048_576);
}

/**
 * The process figures.
 *
 * Guarded rather than read straight off `process`, because this module is also loaded in a jsdom
 * test environment and on runtimes where `memoryUsage` is not implemented â€” and a health panel
 * that throws while reporting how healthy things are would be the worst possible failure here.
 */
export function processStats(): Pick<HealthStats, "uptimeSeconds" | "memoryMb" | "heapUsedMb" | "heapTotalMb" | "nodeVersion" | "environment"> {
  let memory = { rss: 0, heapUsed: 0, heapTotal: 0 };
  let uptime = 0;

  try {
    const usage = process.memoryUsage();
    memory = { rss: usage.rss, heapUsed: usage.heapUsed, heapTotal: usage.heapTotal };
    uptime = process.uptime();
  } catch {
    // Left at zero, which the panel renders as "â€”" rather than as a healthy-looking nought.
  }

  return {
    uptimeSeconds: Math.max(0, Math.round(uptime)),
    memoryMb: megabytes(memory.rss),
    heapUsedMb: megabytes(memory.heapUsed),
    heapTotalMb: megabytes(memory.heapTotal),
    nodeVersion: process.version || "unknown",
    environment: process.env.NODE_ENV || "development",
  };
}

/** How the checks came out, counted by state. */
export function countStates(checks: HealthCheck[]): HealthStats["counts"] {
  return {
    ok: checks.filter((check) => check.state === "ok").length,
    degraded: checks.filter((check) => check.state === "degraded").length,
    off: checks.filter((check) => check.state === "off").length,
    total: checks.length,
  };
}

const ORDER: Record<CheckState, number> = { ok: 0, degraded: 1, off: 2 };

export function worstOf(checks: HealthCheck[]): CheckState {
  return checks.reduce<CheckState>((worst, check) => (ORDER[check.state] > ORDER[worst] ? check.state : worst), "ok");
}

/**
 * Every integration, and what the app does without it.
 *
 * The table reads run together rather than in sequence â€” there are three of them and they are
 * independent, so doing them one after another would put three round trips in front of a panel
 * that is meant to be a glance.
 */
export async function buildHealthReport(): Promise<HealthReport> {
  const config = supabaseConfig();
  const hasSupabase = supabaseConfigured();
  const mailTransport = mailTransportName();
  const smsTransport = smsTransportName();
  const startedAt = Date.now();

  const [store, analytics, portfolio, ledger, presence] = hasSupabase
    ? await Promise.all([
        tableReachable("users"),
        tableReachable("analytics_events"),
        tableReachable("portfolio_holdings"),
        tableReachable("subscription_payments"),
        tableReachable("live_sessions"),
      ])
    : [NOT_PROBED, NOT_PROBED, NOT_PROBED, NOT_PROBED, NOT_PROBED];

  const probeMs = Date.now() - startedAt;
  const probes = hasSupabase ? [store, analytics, portfolio, ledger, presence] : [];
  const users = store.ok;
  const events = analytics.ok;
  const holdings = portfolio.ok;
  const payments = ledger.ok;

  const checks: HealthCheck[] = [
    {
      key: "store",
      label: "Account store",
      state: !hasSupabase ? "degraded" : users ? "ok" : "off",
      detail: !hasSupabase
        ? "Supabase is not configured; accounts live in a JSON file on disk."
        : users
          ? "Supabase is reachable and the `users` table answers."
          : "Supabase is configured but the `users` table does not answer.",
      consequence: !hasSupabase
        ? "Fine for a local clone. On a serverless host the file is read-only, so sign-ups will not persist."
        : users
          ? "Sign-up, sign-in and the admin roster all read from Postgres."
          : "Sign-up and sign-in will fail. Apply supabase/schema.sql.",
      latencyMs: hasSupabase ? store.ms : null,
    },
    {
      key: "analytics",
      label: "Analytics store",
      state: !hasSupabase ? "degraded" : events ? "ok" : "off",
      detail: !hasSupabase
        ? "Events are being written to a JSON file."
        : events
          ? "The `analytics_events` table is reachable."
          : "The `analytics_events` table is missing.",
      consequence: events || !hasSupabase
        ? "Traffic & Usage reports from this store."
        : "Nothing is being recorded, so Traffic & Usage will stay empty. Apply supabase/schema.sql.",
      latencyMs: hasSupabase ? analytics.ms : null,
    },
    {
      key: "presence",
      label: "Live session store",
      state: !hasSupabase ? "degraded" : presence.ok ? "ok" : "off",
      detail: !hasSupabase
        ? "Heartbeats are being written to a JSON file."
        : presence.ok
          ? "The `live_sessions` table is reachable."
          : "The `live_sessions` table is missing.",
      consequence: presence.ok || !hasSupabase
        ? "Live Users can say who is on the site right now."
        : "Nobody will appear on Live Users, however many people are on the site. Apply supabase/schema.sql.",
      latencyMs: hasSupabase ? presence.ms : null,
    },
    {
      key: "portfolio",
      label: "Portfolio store",
      state: !hasSupabase ? "degraded" : holdings ? "ok" : "off",
      detail: !hasSupabase
        ? "Holdings are being written to a JSON file."
        : holdings
          ? "The `portfolio_holdings` table is reachable."
          : "The `portfolio_holdings` table is missing.",
      consequence: holdings || !hasSupabase
        ? "Readers can save positions against their account."
        : "My Portfolio will refuse to load. Apply supabase/schema.sql.",
      latencyMs: hasSupabase ? portfolio.ms : null,
    },
    {
      key: "payments",
      label: "Payments",
      state: !anyConfigured("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET")
        ? "off"
        : hasSupabase && !payments
          ? "degraded"
          : "ok",
      detail: !anyConfigured("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET")
        ? "Razorpay keys are not set."
        : hasSupabase && !payments
          ? "Razorpay is configured, but the `subscription_payments` ledger table is missing."
          : "Razorpay is configured and the ledger table is reachable.",
      consequence: !anyConfigured("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET")
        ? "Checkout cannot open, so nobody can subscribe."
        : hasSupabase && !payments
          ? "Payments still credit the account; the audit row is skipped and revenue cannot be reported."
          : "Payments credit the account and are recorded in the ledger.",
      latencyMs: hasSupabase ? ledger.ms : null,
    },
    {
      key: "webhook",
      label: "Payment webhook",
      state: configured("RAZORPAY_WEBHOOK_SECRET") ? "ok" : "degraded",
      detail: configured("RAZORPAY_WEBHOOK_SECRET")
        ? "The webhook signing secret is set."
        : "RAZORPAY_WEBHOOK_SECRET is not set.",
      consequence: configured("RAZORPAY_WEBHOOK_SECRET")
        ? "A payment is credited even if the buyer closes the tab before returning."
        : "A payment is credited only when the browser reports back. A closed tab means a charge with no subscription.",
      latencyMs: null,
    },
    {
      key: "ai",
      label: "AI model",
      state: configured("OPENROUTER_API_KEY") ? "ok" : "degraded",
      detail: configured("OPENROUTER_API_KEY")
        ? `OpenRouter is configured (${process.env.OPENROUTER_MODEL?.trim() || "default model"}).`
        : "OPENROUTER_API_KEY is not set.",
      consequence: configured("OPENROUTER_API_KEY")
        ? "Board reads and verdicts are written by the model."
        : "Every AI panel still renders, composed from its own measured figures, and says so.",
      latencyMs: null,
    },
    {
      key: "mail",
      label: "Email",
      // Any one of four providers counts: see the provider order in ./mailer. Naming the one in
      // use matters here, because "mail is configured" and "mail is arriving" came apart once.
      state: mailTransport ? "ok" : "degraded",
      detail: mailTransport ? `Mail is sent through ${mailTransport}.` : "No mail provider is set (Resend, Brevo, SendGrid or SMTP).",
      consequence: mailTransport
        ? "Verification, recovery and contact mail is delivered."
        : "Verification links and password reset codes are not sent, so nobody can verify an address or recover an account by email.",
      latencyMs: null,
    },
    {
      key: "sms",
      label: "SMS",
      state: smsTransport ? "ok" : "degraded",
      detail: smsTransport ? `SMS is sent through ${smsTransport}.` : "No SMS gateway is set (MSG91, Twilio or Fast2SMS).",
      consequence: smsTransport
        ? "Sign-in codes and password reset codes can be sent by SMS."
        : "No SMS is sent, so email is the only way to recover an account.",
      latencyMs: null,
    },
    {
      key: "auth",
      label: "Session signing",
      state: configured("AUTH_TOKEN_SECRET") ? "ok" : "off",
      detail: configured("AUTH_TOKEN_SECRET") ? "AUTH_TOKEN_SECRET is set." : "AUTH_TOKEN_SECRET is not set.",
      consequence: configured("AUTH_TOKEN_SECRET")
        ? "Session tokens are signed with a deployment secret."
        : "Sessions are signed with a fallback. Set this before taking real accounts.",
      latencyMs: null,
    },
  ];

  return {
    checks,
    worst: worstOf(checks),
    backend: hasSupabase ? "supabase" : "file",
    projectUrl: config?.url ?? null,
    stats: {
      ...processStats(),
      probeMs,
      // The slowest probe rather than the total: the total grows with the number of tables and
      // says nothing about any of them, while the slowest is the one that is actually holding a
      // page up. Null when nothing was probed, which the panel renders as "â€”".
      slowestMs: probes.length > 0 ? Math.max(...probes.map((probe) => probe.ms)) : null,
      counts: countStates(checks),
    },
    checkedAt: new Date().toISOString(),
  };
}
