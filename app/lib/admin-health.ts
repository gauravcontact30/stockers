// Is this deployment wired up?
//
// The app degrades rather than fails when a service is missing: no Supabase and the account store
// falls back to a JSON file, no OpenRouter key and the AI reads are composed from the figures
// instead, no Razorpay and checkout cannot open. Each of those is deliberate and each is silent —
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
// return — the Supabase project URL — is not a secret: it ships in the browser bundle of every app
// that uses one. Everything else is "configured: true". A health endpoint that echoed its own
// credentials back would be a far worse bug than the misconfiguration it was built to find.

import { supabaseConfig, supabaseConfigured, supabaseRequest } from "./supabase";

export type CheckState = "ok" | "degraded" | "off";

export type HealthCheck = {
  key: string;
  label: string;
  state: CheckState;
  /** What is true right now, in one line. */
  detail: string;
  /** What the app does in this state — the reason `degraded` is not always a problem. */
  consequence: string;
};

export type HealthReport = {
  checks: HealthCheck[];
  /** The worst state across the checks, for the panel's headline. */
  worst: CheckState;
  /** Which store the account data is actually in. */
  backend: "supabase" | "file";
  /** The project URL, or null. Not a secret — see the header. */
  projectUrl: string | null;
  checkedAt: string;
};

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** True when any of the names is set — for a service with more than one accepted variable. */
function anyConfigured(...names: string[]): boolean {
  return names.some(configured);
}

/**
 * Whether a table is actually reachable, not merely configured.
 *
 * A zero-row read rather than a count: this runs on every load of the overview, and the question is
 * "does PostgREST answer for this table", which one row settles as well as ten thousand.
 */
async function tableReachable(table: string): Promise<boolean> {
  try {
    await supabaseRequest({ method: "GET", path: `${table}?select=*&limit=1` });
    return true;
  } catch {
    return false;
  }
}

const ORDER: Record<CheckState, number> = { ok: 0, degraded: 1, off: 2 };

export function worstOf(checks: HealthCheck[]): CheckState {
  return checks.reduce<CheckState>((worst, check) => (ORDER[check.state] > ORDER[worst] ? check.state : worst), "ok");
}

/**
 * Every integration, and what the app does without it.
 *
 * The table reads run together rather than in sequence — there are three of them and they are
 * independent, so doing them one after another would put three round trips in front of a panel
 * that is meant to be a glance.
 */
export async function buildHealthReport(): Promise<HealthReport> {
  const config = supabaseConfig();
  const hasSupabase = supabaseConfigured();

  const [users, events, holdings, payments] = hasSupabase
    ? await Promise.all([
        tableReachable("users"),
        tableReachable("analytics_events"),
        tableReachable("portfolio_holdings"),
        tableReachable("subscription_payments"),
      ])
    : [false, false, false, false];

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
    },
    {
      key: "mail",
      label: "Email",
      state: configured("RESEND_API_KEY") ? "ok" : "degraded",
      detail: configured("RESEND_API_KEY") ? "Resend is configured." : "RESEND_API_KEY is not set.",
      consequence: configured("RESEND_API_KEY")
        ? "Verification and contact mail is delivered."
        : "Verification links are not sent, so new accounts cannot verify by email.",
    },
    {
      key: "sms",
      label: "SMS",
      state: anyConfigured("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN") ? "ok" : "degraded",
      detail: anyConfigured("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN") ? "Twilio is configured." : "Twilio is not set.",
      consequence: anyConfigured("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN")
        ? "SMS notifications can be sent."
        : "No SMS is sent. Nothing else is affected.",
    },
    {
      key: "auth",
      label: "Session signing",
      state: configured("AUTH_TOKEN_SECRET") ? "ok" : "off",
      detail: configured("AUTH_TOKEN_SECRET") ? "AUTH_TOKEN_SECRET is set." : "AUTH_TOKEN_SECRET is not set.",
      consequence: configured("AUTH_TOKEN_SECRET")
        ? "Session tokens are signed with a deployment secret."
        : "Sessions are signed with a fallback. Set this before taking real accounts.",
    },
  ];

  return {
    checks,
    worst: worstOf(checks),
    backend: hasSupabase ? "supabase" : "file",
    projectUrl: config?.url ?? null,
    checkedAt: new Date().toISOString(),
  };
}
