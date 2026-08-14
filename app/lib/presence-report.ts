// Who is on the site right now.
//
// Pure: sittings in, accounts in, a report out. No filesystem, no network and no clock of its own —
// `now` is passed in. The same rule as `./analytics-report`, for the same reason: the arithmetic
// behind a number an admin acts on should be checkable without a browser.
//
// This is also the half of the presence feature a client component may import. `./presence` reads
// the store and pulls `node:fs` and Supabase in behind it; nothing here does.
//
// ---------------------------------------------------------------------------
// Why this is not derived from the analytics events
// ---------------------------------------------------------------------------
//
// Every figure on the Traffic & Usage page comes from `analytics_events`, and the obvious way to
// answer "who is here now" is to look for events in the last few minutes. It does not work. Page
// views are folded together for half an hour by design (see VISIT_THROTTLE_MS), so somebody
// reading one page for twenty minutes emits nothing at all after their arrival — and would be
// reported as gone while they are still reading. Presence needs a signal that repeats while
// nothing happens, which is exactly what an event log must not have.
//
// So this half is fed by a heartbeat and kept in its own store: one row per open tab, overwritten
// in place. It never grows with traffic, and it is not history — nothing here can answer a
// question about yesterday, which is what the analytics tables are for.

import type { DeviceKind } from "./analytics";
import type { AdminUserView } from "./store";

/** How often an open tab reports that it is still there. */
export const HEARTBEAT_MS = 60_000;

/**
 * How long after its last heartbeat a sitting still counts as "on the site".
 *
 * Two and a half beats. One beat would report everybody as gone the moment a single ping was
 * delayed by a slow network; much more and a closed tab lingers on the list long after the person
 * has left. Nothing tells the server that a tab was closed — `beforeunload` does not fire reliably
 * on a phone and a killed app fires nothing at all — so a recent heartbeat is the only honest
 * evidence of presence there is.
 */
export const ONLINE_WINDOW_MS = 150_000;

/**
 * How long a sitting stays on the list after it goes quiet.
 *
 * "Who is here now" is the question, but "who was here ten minutes ago" is the one an admin asks
 * next, and it cannot be answered by a table that forgets a person the moment they close the tab.
 * Rows older than this are dropped by the store as it writes.
 */
export const PRESENCE_RETENTION_MS = 60 * 60_000;

/**
 * One open tab, as the store holds it.
 *
 * A tab rather than a person: two tabs are two rows, and the report folds them back together. That
 * way "12 people, 19 tabs" is answerable, and a person who leaves one tab open on their phone and
 * another on their laptop is one person on the list rather than two.
 */
export type PresenceSession = {
  /** The upsert key of the store — stable for the life of the tab. */
  key: string;
  /** The account, when the sitting is signed in. */
  userId: string | null;
  /** The browser, from the same random id the visit tracker mints. Identifies nobody. */
  visitorId: string | null;
  /** The tab. */
  sessionId: string | null;
  /** The page the last heartbeat came from. Path only — the query string is stripped on the way in. */
  path: string | null;
  device: DeviceKind | null;
  /** When this sitting was first seen. */
  startedAt: string;
  /** The last heartbeat. What "online" is decided on. */
  lastSeenAt: string;
};

/** One row of the live table: a person, and what they are doing right now. */
export type LiveUserRow = {
  /** Stable across refreshes, so a re-render does not reshuffle the table under the reader. */
  key: string;
  /** The account name, or "Visitor (not signed in)" for somebody who has not signed in. */
  name: string;
  email: string | null;
  mobile: string | null;
  /** The plan they have bought, or null. */
  plan: string | null;
  signedIn: boolean;
  /** Where they are, from their most recent heartbeat. */
  path: string | null;
  device: DeviceKind | null;
  /** How many of their tabs are open. */
  tabs: number;
  startedAt: string;
  lastSeenAt: string;
  /** Whole minutes since the earliest of their sittings began. */
  minutes: number;
  /** Seconds since their last heartbeat — how stale this row is. */
  idleSeconds: number;
  /** Within the online window: on the site as opposed to recently seen. */
  online: boolean;
};

export type LivePresenceSummary = {
  /** Distinct people on the site right now. The headline figure. */
  online: number;
  /** Of those, the ones signed in to an account. */
  signedIn: number;
  /** Of those, the ones who have not. */
  guests: number;
  /** Open tabs behind those people — always at least `online`, and usually more. */
  tabs: number;
  /** Distinct people seen at all within the retention window, including those who have left. */
  recent: number;
};

/** One line of "where they are" or "what they are on", most-occupied first. */
export type PresenceGroup = {
  key: string;
  label: string;
  people: number;
};

export type LivePresenceReport = {
  /** True when the store could be read. False carries a `message` and nothing else. */
  available: true;
  /** The instant the report was taken, so the page can say how fresh it is. */
  at: string;
  /** How long a sitting counts as online after its last heartbeat. */
  windowSeconds: number;
  /** How far back the "seen recently" half of the table reaches. */
  retentionMinutes: number;
  summary: LivePresenceSummary;
  /** The pages people are on right now. */
  pages: PresenceGroup[];
  /** What they are on them with. */
  devices: PresenceGroup[];
  rows: LiveUserRow[];
};

/** What the admin route answers with when the presence store cannot be read. */
export type LivePresenceUnavailable = {
  available: false;
  /** What is wrong and what fixes it, in one line the panel can print as-is. */
  message: string;
};

export type LivePresenceState = LivePresenceReport | LivePresenceUnavailable;

const DEVICE_LABEL: Record<DeviceKind, string> = {
  mobile: "Phone",
  tablet: "Tablet",
  desktop: "Desktop",
};

/**
 * Whom a sitting belongs to.
 *
 * The account when there is one, so the same person on a phone and a laptop is one row; the
 * browser when there is not; and the tab itself when there is neither, because two storage-less
 * browsers are two people and folding them together would report a crowd as one visitor.
 */
export function subjectOf(session: PresenceSession): string {
  if (session.userId) return `user:${session.userId}`;
  if (session.visitorId) return `visitor:${session.visitorId}`;
  return `session:${session.key}`;
}

/** Milliseconds between two ISO instants, or null when either cannot be read as a date. */
function millisBetween(from: string, to: string): number | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isNaN(start) || Number.isNaN(end) ? null : end - start;
}

function groupsFrom(rows: LiveUserRow[], pick: (row: LiveUserRow) => { key: string; label: string } | null): PresenceGroup[] {
  const tallies = new Map<string, { label: string; people: number }>();

  for (const row of rows) {
    const picked = pick(row);
    if (!picked) continue;

    const tally = tallies.get(picked.key) ?? { label: picked.label, people: 0 };
    tally.people++;
    tallies.set(picked.key, tally);
  }

  return [...tallies.entries()]
    .map(([key, tally]) => ({ key, label: tally.label, people: tally.people }))
    // Count, then name — so two equal rows come out in a stable order rather than in whichever
    // order the heartbeats happened to arrive.
    .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label));
}

/**
 * The live report.
 *
 * `sessions` is every sitting the store still holds, which is wider than "online": rows inside the
 * retention window but past the online one are kept and marked, because the table's second job is
 * showing who has just left.
 */
export function buildPresenceReport({
  sessions,
  users,
  now = new Date(),
}: {
  sessions: PresenceSession[];
  users: AdminUserView[];
  now?: Date;
}): LivePresenceReport {
  const at = now.toISOString();
  const byId = new Map(users.map((user) => [user.id, user]));

  type Group = { sessions: PresenceSession[]; startedAt: string; lastSeenAt: string; latest: PresenceSession };
  const groups = new Map<string, Group>();

  for (const session of sessions) {
    const subject = subjectOf(session);
    const group = groups.get(subject);

    if (!group) {
      groups.set(subject, {
        sessions: [session],
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        latest: session,
      });
      continue;
    }

    group.sessions.push(session);
    if (session.startedAt < group.startedAt) group.startedAt = session.startedAt;
    if (session.lastSeenAt > group.lastSeenAt) {
      group.lastSeenAt = session.lastSeenAt;
      // The page and the device of the most recent heartbeat — where they are, not where they were.
      group.latest = session;
    }
  }

  const rows: LiveUserRow[] = [];

  for (const [subject, group] of groups) {
    const user = group.latest.userId ? byId.get(group.latest.userId) : undefined;
    const idleMs = millisBetween(group.lastSeenAt, at);
    const sittingMs = millisBetween(group.startedAt, at);

    rows.push({
      key: subject,
      // An account that has since been deleted reads as a visitor rather than as a dangling id,
      // the same way the activity feed handles it.
      name: user?.name ?? "Visitor (not signed in)",
      email: user?.email ?? null,
      mobile: user?.mobile ?? null,
      plan: user?.plan ?? null,
      signedIn: Boolean(user),
      path: group.latest.path,
      device: group.latest.device,
      tabs: group.sessions.length,
      startedAt: group.startedAt,
      lastSeenAt: group.lastSeenAt,
      minutes: sittingMs === null ? 0 : Math.max(0, Math.floor(sittingMs / 60_000)),
      idleSeconds: idleMs === null ? 0 : Math.max(0, Math.round(idleMs / 1_000)),
      // An unreadable timestamp counts as stale rather than as present: a row that cannot prove it
      // is live should not be counted as a person on the site.
      online: idleMs !== null && idleMs <= ONLINE_WINDOW_MS,
    });
  }

  // Online first, then whoever was seen most recently, then by name so equal rows hold still.
  rows.sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      b.lastSeenAt.localeCompare(a.lastSeenAt) ||
      a.name.localeCompare(b.name),
  );

  const here = rows.filter((row) => row.online);
  const signedIn = here.filter((row) => row.signedIn).length;

  return {
    available: true,
    at,
    windowSeconds: Math.round(ONLINE_WINDOW_MS / 1_000),
    retentionMinutes: Math.round(PRESENCE_RETENTION_MS / 60_000),
    summary: {
      online: here.length,
      signedIn,
      guests: here.length - signedIn,
      tabs: here.reduce((total, row) => total + row.tabs, 0),
      recent: rows.length,
    },
    pages: groupsFrom(here, (row) => (row.path ? { key: row.path, label: row.path } : null)),
    devices: groupsFrom(here, (row) => (row.device ? { key: row.device, label: DEVICE_LABEL[row.device] } : null)),
    rows,
  };
}
