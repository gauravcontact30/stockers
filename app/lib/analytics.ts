import "server-only";

// Product analytics: who arrives, who signs in, who signs up, and which AI feature the audience
// actually opens.
//
// One module, two backends, decided by configuration alone â€” the same split as `./store`:
//
//   * Supabase (Postgres, over PostgREST) when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
//   * A JSON file on disk when they are not.
//
// Unlike the account store, a failure here is swallowed rather than raised. That difference is
// deliberate and is the single most important property of this file: analytics is an observer, and
// an observer must never be able to fail the thing it is observing. A Supabase outage has to cost
// a missing row on a chart, never a sign-up that a visitor was told had failed. `recordEvent`
// therefore resolves either way and reports nothing back to its caller.
//
// What is *not* stored here is as deliberate. An event carries a user id, never a name, address or
// number â€” those are read back out of the account store at the moment the dashboard is rendered.
// Denormalising them onto every row would scatter personal data across a table nobody thinks of as
// holding any, and would leave a deleted account's details behind in it forever.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { isAnalyticsExcludedEmail } from "./analytics-exclusions";
import { isFeatureKey } from "./plan-tiers";
import { supabaseConfigured, supabaseRequest } from "./supabase";

/**
 * The five things worth counting.
 *
 * `visit` is a page view and `action` is something the reader did on it â€” both reported by the
 * browser. The other three are recorded on the server at the moment the thing itself happens, so
 * they cannot be inflated by anyone posting at the ingest endpoint: sign-ins and sign-ups from the
 * auth routes, feature opens from the paywall guard that every AI route already calls.
 */
export type AnalyticsEventType = "visit" | "signin" | "signup" | "feature" | "action";

/**
 * Every interaction the app reports, and what each one means.
 *
 * A closed list, not free text. The ingest endpoint is unauthenticated by necessity â€” a signed-out
 * visitor is the most interesting thing it counts â€” so anything it stores has to be something this
 * build already knows the name of. An unrecognised action is dropped rather than written, which
 * keeps the dashboard's "what people do" table a list of real product events instead of whatever
 * somebody decided to POST.
 *
 * The labels are what the admin dashboard shows, so they read as sentences about a person rather
 * than as event names.
 */
export const ACTIONS = {
  "nav.section": "Opened a dashboard section",
  "stock.open": "Opened a stock's detail sheet",
  "stock.search": "Searched for a stock",
  "ai.ask": "Asked the AI a question",
  "ai.report": "Opened a full AI report",
  "paywall.hit": "Reached a locked feature",
  "paywall.plans": "Opened the plans from a locked feature",
  "checkout.open": "Opened checkout",
  "checkout.paid": "Completed a payment",
  "portfolio.add": "Added a portfolio holding",
  "portfolio.remove": "Removed a portfolio holding",
  // Which of the seven portfolio views people actually open is the argument for what that section
  // should look like next â€” and a tab change is not a page view, so nothing else would record it.
  "portfolio.tab": "Opened a portfolio view",
  "portfolio.screen": "Ran a portfolio screen",
  "watchlist.add": "Added to the watchlist",
  "watchlist.remove": "Removed from the watchlist",
  "contact.submit": "Sent a support message",
  "theme.set": "Switched the colour theme",
  "auth.logout": "Signed out",
} as const;

export type ActionKey = keyof typeof ACTIONS;

export function isActionKey(value: unknown): value is ActionKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACTIONS, value);
}

export type DeviceKind = "mobile" | "tablet" | "desktop";

export type AnalyticsEvent = {
  id: string;
  type: AnalyticsEventType;
  /** Exact instant, ISO-8601 UTC. */
  at: string;
  /** The IST calendar date `at` falls on â€” what "daily" means everywhere in this app. */
  day: string;
  /** The signed-in account, or null for a visitor who has not signed in. */
  userId: string | null;
  /**
   * A random per-browser id, minted client-side and kept in localStorage.
   *
   * This is what makes "how many users visited" answerable for people who never sign in. It is not
   * a fingerprint and identifies nobody: it is a random string the browser hands back, and clearing
   * site data discards it.
   */
  visitorId: string | null;
  /**
   * A random per-tab id, so a run of events can be read back as one sitting.
   *
   * This is what makes "how many sessions" and "pages per session" answerable at all â€” without it
   * a person who came back three times in a day is indistinguishable from three page views.
   */
  sessionId: string | null;
  /** The AI feature key, on `feature` events. Null on every other type. */
  feature: string | null;
  /** What the reader did, on `action` events: one of the keys of ACTIONS. */
  action: string | null;
  /** What they did it to â€” a ticker, a section, a plan name. Never free text from a form. */
  label: string | null;
  /** The path visited, on `visit` events. Query strings are stripped before it reaches here. */
  path: string | null;
  /** The referring host, on `visit` events. Host only â€” never the full URL someone came from. */
  referrer: string | null;
  device: DeviceKind | null;
  /**
   * True when a `feature` event was a refusal rather than an open â€” the caller reached for a
   * feature their plan does not include, or one an admin has locked.
   *
   * Worth keeping: the features people are turned away from most are the ones with the clearest
   * demand, and that is not visible in a count of successful opens.
   */
  blocked: boolean;
};

/**
 * How far back the dashboard can look.
 *
 * Bounded because this table grows with traffic rather than with sign-ups, and nothing in the
 * product asks a question about last year. Older rows are dropped by the file backend as it writes
 * and by the retention statement in `supabase/schema.sql`.
 */
export const ANALYTICS_RETENTION_DAYS = 120;

/** A hard ceiling on a single read, so one query can never try to page in a year of traffic. */
const MAX_EVENTS = 20_000;

/**
 * Where the JSON event log lives when the JSON backend is in use.
 *
 * Overridable for the same two reasons the account store's path is: a deployment that keeps state
 * off the application directory, and a test suite, which Jest runs in parallel workers that would
 * otherwise interleave writes into one file.
 */
const filePath = process.env.STOCKERS_ANALYTICS_FILE || path.join(process.cwd(), "app", "data", "analytics-events.json");

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * The IST calendar date an instant falls on.
 *
 * Defined here rather than imported from `./subscription` so this module pulls in neither the
 * market client nor the NSE holiday calendar â€” analytics is written to on the hot path of every
 * gated request, and it has no business dragging that in. "en-CA" formats as YYYY-MM-DD.
 */
export function istDay(at: Date | string = new Date()): string {
  const date = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return istDay(new Date());
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** The IST date `days` before `day`, as YYYY-MM-DD. Used to open the dashboard's window. */
export function dayBefore(day: string, days: number): string {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed)) return day;
  const date = new Date(parsed);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Every IST date from `from` to `to` inclusive, so a chart has a bar for a day nobody visited. */
export function daysBetween(from: string, to: string, cap = ANALYTICS_RETENTION_DAYS + 1): string[] {
  const days: string[] = [];
  let cursor = from;

  for (let guard = 0; guard < cap && cursor <= to; guard++) {
    days.push(cursor);
    const date = new Date(`${cursor}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cursor = date.toISOString().slice(0, 10);
  }

  return days;
}

// ---------------------------------------------------------------------------
// What arrives from outside
// ---------------------------------------------------------------------------

/** A user agent, reduced to the only three buckets a dashboard reader acts on. */
export function deviceFrom(userAgent: string | null | undefined): DeviceKind | null {
  if (!userAgent) return null;
  const agent = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(agent)) return "tablet";
  if (/mobi|android|iphone|ipod|phone/.test(agent)) return "mobile";
  return "desktop";
}

/**
 * A path we are willing to store: same-origin, query string removed, length capped.
 *
 * The query string goes because it is where the personal data is â€” a search term, a referral code,
 * an email in a verification link â€” and none of it is needed to count a page view.
 */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed.split(/[?#]/)[0].slice(0, 120);
}

/** The host someone arrived from, or null for a direct visit. Never the full referring URL. */
export function cleanReferrer(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value).host.slice(0, 120) || null;
  } catch {
    return null;
  }
}

/** A browser-minted visitor or session id, accepted only in the shape this app issues. */
export function cleanVisitorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

/**
 * What an action was done to, reduced to something safe to store.
 *
 * A ticker, a section id, a plan name â€” short, and from a fixed alphabet. Anything else becomes
 * null rather than being stored, because the one thing a label must never carry is what somebody
 * typed into a form.
 */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim().slice(0, 40);
  return /^[A-Za-z0-9 ._&-]{1,40}$/.test(label) ? label : null;
}

/**
 * The cookie the visit tracker mirrors its visitor id into.
 *
 * The id itself lives in localStorage, but a cookie is what lets the *server* attribute an event
 * to a signed-out browser â€” the paywall guard sees a request, not a React tree, and without this a
 * visitor exploring locked features would be a hundred anonymous rows rather than one person.
 * SameSite=Lax and not HttpOnly, because the client mints and reads it; it carries no authority.
 */
export const VISITOR_COOKIE = "stockers_visitor";

export function visitorIdFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === VISITOR_COOKIE) {
      try {
        return cleanVisitorId(decodeURIComponent(rest.join("=")));
      } catch {
        // A malformed percent-escape is not a visitor id.
        return null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Throttling
// ---------------------------------------------------------------------------

/**
 * The last time a given subject was recorded doing a given thing.
 *
 * Needed because several panels poll. The market pulse refreshes itself on a timer, and every one
 * of those refreshes calls the paywall guard â€” so without this, one reader who leaves a tab open
 * would out-count a hundred who actually read something, and the "most explored feature" ranking
 * would measure refresh intervals rather than interest.
 *
 * In memory, so it is per server instance and best-effort. That is the right trade: the cost of a
 * miss is one extra row, and the alternative is a round trip to the database to decide whether to
 * make a round trip to the database.
 */
const lastSeen = new Map<string, number>();
const THROTTLE_CAPACITY = 5_000;

/** How long one subject's repeat of the same event is folded into the first. */
export const FEATURE_THROTTLE_MS = 10 * 60_000;
export const VISIT_THROTTLE_MS = 30 * 60_000;
/**
 * Short, because doing the same thing twice on purpose is two events.
 *
 * This only exists to swallow a double-tap and the double-fire a React remount can cause; a reader
 * who opens the same stock again five seconds later meant to.
 */
export const ACTION_THROTTLE_MS = 3_000;

/** Exposed for tests, which must not inherit a throttle window from the suite before them. */
export function resetAnalyticsThrottle(): void {
  lastSeen.clear();
}

function throttled(key: string, windowMs: number, now: number): boolean {
  const previous = lastSeen.get(key);
  if (previous !== undefined && now - previous < windowMs) return true;

  // Bounded before the insert, so the map never exceeds capacity even by one. Oldest-write-first,
  // which for a window this short is close enough to least-useful.
  if (lastSeen.size >= THROTTLE_CAPACITY) {
    const oldest = lastSeen.keys().next().value;
    if (oldest !== undefined) lastSeen.delete(oldest);
  }

  lastSeen.set(key, now);
  return false;
}

// ---------------------------------------------------------------------------
// Backend: JSON file
// ---------------------------------------------------------------------------

async function readFileEvents(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AnalyticsEvent[]) : [];
  } catch {
    // No file yet, or an unreadable one. Either way there is no history, which is not an error.
    return [];
  }
}

async function writeFileEvents(events: AnalyticsEvent[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(/* turbopackIgnore: true */ filePath, JSON.stringify(events, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Backend: Supabase / Postgres
// ---------------------------------------------------------------------------

/** One row of `public.analytics_events`, in the column names Postgres actually has. */
type EventRow = {
  id: string;
  type: string;
  at: string;
  day: string;
  user_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  feature: string | null;
  action: string | null;
  label: string | null;
  path: string | null;
  referrer: string | null;
  device: string | null;
  blocked: boolean | null;
};

function toRow(event: AnalyticsEvent): EventRow {
  return {
    id: event.id,
    type: event.type,
    at: event.at,
    day: event.day,
    user_id: event.userId,
    visitor_id: event.visitorId,
    session_id: event.sessionId,
    feature: event.feature,
    action: event.action,
    label: event.label,
    path: event.path,
    referrer: event.referrer,
    device: event.device,
    blocked: event.blocked,
  };
}

function fromRow(row: EventRow): AnalyticsEvent {
  return {
    id: row.id,
    type: row.type as AnalyticsEventType,
    at: row.at,
    day: row.day,
    userId: row.user_id,
    visitorId: row.visitor_id,
    sessionId: row.session_id ?? null,
    feature: row.feature,
    action: row.action ?? null,
    label: row.label ?? null,
    path: row.path,
    referrer: row.referrer,
    device: (row.device as DeviceKind | null) ?? null,
    blocked: row.blocked === true,
  };
}

// ---------------------------------------------------------------------------
// The store itself
// ---------------------------------------------------------------------------

/**
 * The fields that can arrive from a request body are typed `unknown` on purpose.
 *
 * Everything a browser sends is sanitised on the way in by the `clean*` functions above, and typing
 * these as strings would only mean a caller had to assert them into shape first â€” moving the lie
 * one line up rather than removing it.
 */
export type RecordEventInput = {
  type: AnalyticsEventType;
  userId?: string | null;
  /**
   * The account's address, when the caller already has it â€” which every caller does, because each
   * resolves the session before it records anything.
   *
   * Present purely so `recordEvent` can drop operator accounts before they are written; see
   * ./analytics-exclusions. It is never stored: `buildEvent` does not read it, and no row on the
   * events table has an email column. Optional because a signed-out visit has no account at all,
   * and because omitting it must fail open â€” an event that cannot be attributed is still a real
   * visit and is counted.
   */
  userEmail?: string | null;
  visitorId?: unknown;
  sessionId?: unknown;
  feature?: unknown;
  action?: unknown;
  label?: unknown;
  path?: unknown;
  referrer?: unknown;
  userAgent?: string | null;
  blocked?: boolean;
  /**
   * Fold a repeat from the same subject within this window into the first one.
   *
   * Zero for the events that are already once-per-action â€” a sign-in is a sign-in even if the same
   * person signs in twice in a minute.
   */
  throttleMs?: number;
};

/** Builds the record without storing it, so the shaping rules can be tested on their own. */
export function buildEvent(input: RecordEventInput, now = new Date()): AnalyticsEvent {
  const at = now.toISOString();
  const feature = typeof input.feature === "string" && isFeatureKey(input.feature) ? input.feature : null;

  return {
    id: `evt_${now.getTime().toString(36)}_${randomBytes(4).toString("hex")}`,
    type: input.type,
    at,
    day: istDay(now),
    userId: input.userId ?? null,
    visitorId: cleanVisitorId(input.visitorId),
    sessionId: cleanVisitorId(input.sessionId),
    feature,
    // Unknown actions are dropped rather than stored: see the note on ACTIONS.
    action: isActionKey(input.action) ? input.action : null,
    label: cleanLabel(input.label),
    path: cleanPath(input.path),
    referrer: cleanReferrer(input.referrer),
    device: deviceFrom(input.userAgent),
    blocked: input.blocked === true,
  };
}

/**
 * Records one event, or quietly does nothing.
 *
 * Never throws and never reports failure: see the header. Callers are on the request path of
 * something a user cares about, and none of them should have to decide what to do about a
 * telemetry write that did not land.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    // The operators' own accounts are not audience. Dropped here rather than filtered out of the
    // dashboard, so the row never exists to be counted by anything later â€” see
    // ./analytics-exclusions for why it is this list and not "every admin".
    if (isAnalyticsExcludedEmail(input.userEmail)) return;

    // An `action` event whose action this build does not know is not stored at all. Writing it
    // with a null action would leave a row that counts towards traffic and names nothing.
    if (input.type === "action" && !isActionKey(input.action)) return;

    const now = Date.now();
    const throttleMs = input.throttleMs ?? 0;

    if (throttleMs > 0) {
      // The subject is whoever we can identify: the account if there is one, else the browser. An
      // event with neither is not throttled at all, because there is nothing to throttle it by.
      const subject = input.userId ?? cleanVisitorId(input.visitorId);
      // Scoped to the thing done, so throttling a repeat of one action never swallows a different
      // one â€” opening two stocks in a minute is two events, not one.
      const scope =
        (typeof input.feature === "string" ? input.feature : "") ||
        (isActionKey(input.action) ? `${input.action}:${cleanLabel(input.label) ?? ""}` : "") ||
        cleanPath(input.path) ||
        "";
      if (subject && throttled(`${input.type}:${subject}:${scope}`, throttleMs, now)) return;
    }

    const event = buildEvent(input, new Date(now));

    if (supabaseConfigured()) {
      await supabaseRequest({ method: "POST", path: "analytics_events", body: toRow(event) });
      return;
    }

    const events = await readFileEvents();
    events.push(event);
    // Trimmed as it is written rather than by a sweep nobody would remember to run. Oldest first,
    // so the tail that survives is the recent history the dashboard actually reads.
    await writeFileEvents(events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events);
  } catch (error) {
    // Deliberately swallowed. A chart with a gap in it is a smaller problem than a sign-up that
    // 500s because a telemetry row could not be written.
    console.error("analytics: could not record event", error);
  }
}

/**
 * Every event on or after `fromDay` (an IST date), newest first.
 *
 * Unlike `recordEvent` this does throw, because its only caller is the admin dashboard: an admin
 * asking for figures is better told the query failed than shown an empty chart that looks like a
 * site with no visitors.
 */
export async function listEvents(fromDay: string, limit = MAX_EVENTS): Promise<AnalyticsEvent[]> {
  const capped = Math.min(Math.max(1, limit), MAX_EVENTS);

  if (supabaseConfigured()) {
    const rows = await supabaseRequest<EventRow>({
      method: "GET",
      path: `analytics_events?day=gte.${encodeURIComponent(fromDay)}&select=*&order=at.desc&limit=${capped}`,
    });
    return rows.map(fromRow);
  }

  return (await readFileEvents())
    .filter((event) => event.day >= fromDay)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, capped);
}

/** Which store is in use, so the dashboard can say where its figures come from. */
export function analyticsBackendName(): "supabase" | "file" {
  return supabaseConfigured() ? "supabase" : "file";
}
