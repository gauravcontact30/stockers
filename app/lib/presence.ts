// The live-presence store: one row per open tab, overwritten in place.
//
// The same two backends as `./analytics`, decided by configuration alone — Supabase when it is
// configured, a JSON file on disk when it is not — and the same rule about failure: writing a
// heartbeat is an observation, and an observation must never be able to fail the thing it is
// observing. `touchPresence` resolves either way and reports nothing back.
//
// Reading is the opposite, and throws: its only caller is the admin dashboard, and an admin asking
// how many people are on the site is better told the query failed than shown a zero that reads as
// an empty website.
//
// ---------------------------------------------------------------------------
// Why this table does not grow
// ---------------------------------------------------------------------------
//
// A heartbeat is an upsert keyed on the tab, not an insert, so a person sitting on the site for an
// hour is one row that keeps being rewritten rather than sixty rows of history. Rows past
// PRESENCE_RETENTION_MS are dropped as the table is read or written. The table is therefore
// bounded by *concurrent* traffic rather than by total traffic, which is what makes a
// once-a-minute write from every open tab an affordable thing to do at all.
//
// What is stored is what `analytics_events` already stores about a visit — an account id or a
// random browser id, a path, a device bucket — and nothing else. No name, no address, no number:
// those are read back out of the account store when the dashboard renders, never copied in here.

import { promises as fs } from "node:fs";
import path from "node:path";
import { cleanPath, cleanVisitorId, deviceFrom } from "./analytics";
import { PRESENCE_RETENTION_MS, type PresenceSession } from "./presence-report";
import { supabaseConfigured, supabaseRequest } from "./supabase";

/**
 * Where the JSON store lives when the file backend is in use.
 *
 * Overridable for the same two reasons every other path in this app is: a deployment that keeps
 * state off the application directory, and a test suite that Jest runs in parallel workers which
 * would otherwise interleave writes into one file.
 */
const filePath = process.env.STOCKERS_PRESENCE_FILE || path.join(process.cwd(), "app", "data", "live-sessions.json");

/** A hard ceiling on one read, so a busy minute can never page in an unbounded list. */
const MAX_SESSIONS = 5_000;

export type TouchPresenceInput = {
  /** The signed-in account, resolved from the session — never taken from the request body. */
  userId?: string | null;
  visitorId?: unknown;
  sessionId?: unknown;
  path?: unknown;
  userAgent?: string | null;
};

/**
 * The row this heartbeat belongs to.
 *
 * The tab first, so two tabs are two rows and "19 tabs behind 12 people" is answerable. The
 * browser next, for a client whose sessionStorage is unavailable. The account last, which is the
 * only key left for a browser with no storage at all.
 *
 * Namespaced, so a session id can never collide with a visitor id that happens to read the same.
 * Null when the heartbeat identifies nothing: without a key each ping would land as a new row and
 * one person with a tab open would be reported as sixty people an hour.
 */
export function presenceKey(input: TouchPresenceInput): string | null {
  const sessionId = cleanVisitorId(input.sessionId);
  if (sessionId) return `s:${sessionId}`;

  const visitorId = cleanVisitorId(input.visitorId);
  if (visitorId) return `v:${visitorId}`;

  return input.userId ? `u:${input.userId}` : null;
}

/** Builds the row without storing it, so the shaping rules can be tested on their own. */
export function buildSession(input: TouchPresenceInput, key: string, now = new Date()): PresenceSession {
  const at = now.toISOString();

  return {
    key,
    userId: input.userId ?? null,
    visitorId: cleanVisitorId(input.visitorId),
    sessionId: cleanVisitorId(input.sessionId),
    path: cleanPath(input.path),
    device: deviceFrom(input.userAgent),
    startedAt: at,
    lastSeenAt: at,
  };
}

// ---------------------------------------------------------------------------
// Backend: Supabase / Postgres
// ---------------------------------------------------------------------------

/** One row of `public.live_sessions`, in the column names Postgres actually has. */
type SessionRow = {
  key: string;
  user_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  path: string | null;
  device: string | null;
  started_at: string;
  last_seen_at: string;
};

function fromRow(row: SessionRow): PresenceSession {
  return {
    key: row.key,
    userId: row.user_id,
    visitorId: row.visitor_id,
    sessionId: row.session_id,
    path: row.path,
    device: (row.device as PresenceSession["device"]) ?? null,
    // A row written before the default landed would have no start; the last heartbeat is the
    // safest reading of "since when", and it is never later than now.
    startedAt: row.started_at ?? row.last_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

// ---------------------------------------------------------------------------
// Backend: JSON file
// ---------------------------------------------------------------------------

async function readFileSessions(): Promise<PresenceSession[]> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PresenceSession[]) : [];
  } catch {
    // No file yet, or an unreadable one. Either way nobody is on the site as far as this store
    // knows, which is not an error.
    return [];
  }
}

async function writeFileSessions(sessions: PresenceSession[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(/* turbopackIgnore: true */ filePath, JSON.stringify(sessions, null, 2), "utf8");
}

/** The instant a row has to have been seen at to still be worth keeping. */
function cutoff(now: Date): string {
  return new Date(now.getTime() - PRESENCE_RETENTION_MS).toISOString();
}

// ---------------------------------------------------------------------------
// The store itself
// ---------------------------------------------------------------------------

/**
 * Records that one tab is still there, or quietly does nothing.
 *
 * Never throws and never reports failure — see the header. The endpoint behind it is called by
 * every open tab once a minute, and none of those callers has anything useful to do about a
 * telemetry write that did not land.
 */
export async function touchPresence(input: TouchPresenceInput, now = new Date()): Promise<void> {
  try {
    const key = presenceKey(input);
    if (!key) return;

    const session = buildSession(input, key, now);

    if (supabaseConfigured()) {
      // `started_at` is deliberately absent from the payload. PostgREST builds the `do update set`
      // of an upsert from the keys it was sent, so leaving it out is what makes the column keep
      // the instant the sitting actually began instead of resetting it every minute. The column
      // default fills it on the insert.
      await supabaseRequest({
        method: "POST",
        path: "live_sessions?on_conflict=key",
        merge: true,
        body: {
          key: session.key,
          user_id: session.userId,
          visitor_id: session.visitorId,
          session_id: session.sessionId,
          path: session.path,
          device: session.device,
          last_seen_at: session.lastSeenAt,
        },
      });
      return;
    }

    const sessions = await readFileSessions();
    const existing = sessions.find((row) => row.key === key);

    if (existing) {
      // Everything but the start moves: a person who walked from the news page to a stock sheet is
      // the same sitting, and how long they have been here is the whole point of keeping it.
      Object.assign(existing, session, { startedAt: existing.startedAt });
    } else {
      sessions.push(session);
    }

    // Trimmed as it is written rather than by a sweep nobody would remember to run.
    const since = cutoff(now);
    await writeFileSessions(sessions.filter((row) => row.lastSeenAt >= since));
  } catch (error) {
    // Deliberately swallowed. A missing dot on the live list is a smaller problem than a page view
    // that 500s because a presence row could not be written.
    console.error("presence: could not record a heartbeat", error);
  }
}

/**
 * Every sitting still inside the retention window, most recently seen first.
 *
 * Wider than "online" on purpose: the report marks which of these are current and which have just
 * left, and it cannot do that from a list that has already dropped them.
 */
export async function listPresence(now = new Date()): Promise<PresenceSession[]> {
  const since = cutoff(now);

  if (supabaseConfigured()) {
    const rows = await supabaseRequest<SessionRow>({
      method: "GET",
      path: `live_sessions?last_seen_at=gte.${encodeURIComponent(since)}&select=*&order=last_seen_at.desc&limit=${MAX_SESSIONS}`,
    });

    // Expired rows are cleared on the way past, after the answer has been secured. Fire and
    // forget: an admin's read must not fail because a housekeeping delete did.
    void supabaseRequest({ method: "DELETE", path: `live_sessions?last_seen_at=lt.${encodeURIComponent(since)}` }).catch(
      () => undefined,
    );

    return rows.map(fromRow);
  }

  return (await readFileSessions())
    .filter((session) => session.lastSeenAt >= since)
    .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))
    .slice(0, MAX_SESSIONS);
}

/** Which store is in use, so the dashboard can say where its figures come from. */
export function presenceBackendName(): "supabase" | "file" {
  return supabaseConfigured() ? "supabase" : "file";
}
