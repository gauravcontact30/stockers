// Turning a pile of events into the figures the super admin dashboard reads.
//
// Deliberately pure: events in, users in, a report out. No filesystem, no network, no clock of its
// own — `today` is passed in. That is what lets the whole of this file be exercised directly, and
// it is also what stops the dashboard's arithmetic from being spread across a React component
// where nobody can check it.
//
// The personal columns the dashboard shows — name, address, mobile — are joined on here, at read
// time, from the account store. They are not copied onto the events themselves; see the header of
// `./analytics` for why.

import type { AnalyticsEvent, DeviceKind } from "./analytics";
import { ACTIONS, dayBefore, daysBetween, isActionKey } from "./analytics";
import { MONITORED_EMAILS } from "./monitored-users";
import { FEATURE_BY_KEY, isFeatureKey, type FeatureKey, type PlanTier } from "./plan-tiers";
import { buildPresenceReport, type PresenceSession } from "./presence-report";
import type { AdminUserView } from "./store";

export type DailyPoint = {
  day: string;
  /** Distinct people, signed in or not. */
  visitors: number;
  /** Page views — every arrival, including the same person's second page. */
  views: number;
  signins: number;
  signups: number;
  featureOpens: number;
  /** Interactions — everything that was not simply arriving somewhere. */
  actions: number;
};

export type FeatureUsage = {
  key: FeatureKey;
  label: string;
  tier: PlanTier;
  /** Times the feature was actually delivered. */
  opens: number;
  /** Distinct people who opened it — the honest measure of reach. */
  users: number;
  /** Times someone reached for it and was refused: the demand a paywall is holding back. */
  blocked: number;
  /** Share of all opens in the window, 0-1. What "most trending" is ranked on. */
  share: number;
  lastAt: string | null;
};

/** One row of the engagement table: an account, and what it has been doing. */
export type AnalyticsUserRow = {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  /** The plan they have bought, or null when they are on the trial or lapsed without buying. */
  plan: string | null;
  role: string;
  emailVerified: boolean;
  subscribedUntil: string | null;
  createdAt: string;
  visits: number;
  featureOpens: number;
  signins: number;
  /** Everything they did that was not simply arriving somewhere. */
  actions: number;
  lastSeen: string | null;
  /** The feature this account opens most, by label. Null when it has opened none. */
  topFeature: string | null;
  /** What they do most often, in the words the admin reads. Null when they have only browsed. */
  topAction: string | null;
  device: DeviceKind | null;
};

/** One line of the live activity feed. */
export type ActivityRow = {
  id: string;
  at: string;
  type: AnalyticsEvent["type"];
  feature: string | null;
  /** What they did, in the words the admin reads — not the slug. */
  action: string | null;
  /** What they did it to: a ticker, a section, a plan. */
  label: string | null;
  path: string | null;
  referrer: string | null;
  device: DeviceKind | null;
  blocked: boolean;
  name: string;
  email: string | null;
  mobile: string | null;
  plan: string | null;
};

export type MonitoredFeatureUse = {
  key: FeatureKey;
  label: string;
  tier: PlanTier;
  opens: number;
  blocked: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Best-effort observed time after feature opens, capped at thirty minutes per step. */
  estimatedSeconds: number;
};

export type MonitoredSessionRow = {
  key: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  estimatedSeconds: number;
  events: number;
  pages: string[];
  device: DeviceKind | null;
};

export type MonitoredUserRow = {
  email: string;
  found: boolean;
  userId: string | null;
  name: string;
  mobile: string | null;
  plan: string | null;
  role: string | null;
  emailVerified: boolean;
  subscribedUntil: string | null;
  createdAt: string | null;
  visits: number;
  actions: number;
  featureOpens: number;
  blockedAttempts: number;
  signins: number;
  signups: number;
  sessions: number;
  estimatedSeconds: number;
  firstSeen: string | null;
  lastSeen: string | null;
  device: DeviceKind | null;
  topPage: string | null;
  topFeature: string | null;
  live: {
    online: boolean;
    path: string | null;
    minutes: number;
    idleSeconds: number;
    tabs: number;
    startedAt: string;
    lastSeenAt: string;
  } | null;
  features: MonitoredFeatureUse[];
  sessionRows: MonitoredSessionRow[];
  recent: ActivityRow[];
};

export type AnalyticsTotals = {
  visitors: number;
  views: number;
  signins: number;
  signups: number;
  featureOpens: number;
  blockedAttempts: number;
  /** Distinct accounts seen at all in the window. */
  activeUsers: number;
  /** Distinct browsers seen that were not signed in — the top of the funnel. */
  guests: number;
  /** Interactions: everything the reader did that was not simply arriving somewhere. */
  actions: number;
  /** Distinct sittings, from the per-tab session id. */
  sessions: number;
};

/** One row of any "what was most X" table: a thing, how often, and by how many people. */
export type RankedRow = {
  key: string;
  label: string;
  count: number;
  users: number;
  /** Share of the column's total, 0-1. */
  share: number;
};

/**
 * The path from arriving to paying, as counts and the rate between each step.
 *
 * Measured over the window rather than per person — nobody signs up and subscribes inside one
 * visit — so these are stage sizes, not a cohort walked through time. That is the honest reading
 * of the data this table holds, and it is the one the labels say.
 */
export type Funnel = {
  visitors: number;
  signups: number;
  activeUsers: number;
  aiUsers: number;
  payers: number;
  /** Sign-ups as a share of visitors, 0-1. */
  signupRate: number;
  /** Payers as a share of sign-ups, 0-1. */
  payRate: number;
};

export type AnalyticsReport = {
  backend: "supabase" | "file";
  range: { from: string; to: string; days: number };
  totals: AnalyticsTotals;
  today: AnalyticsTotals;
  /** Yesterday, so today's tiles can carry a direction rather than a bare number. */
  yesterday: AnalyticsTotals;
  daily: DailyPoint[];
  features: FeatureUsage[];
  /** The single most-opened feature in the window, or null when nothing has been opened. */
  trending: FeatureUsage | null;
  funnel: Funnel;
  /** What people did, most-done first. */
  actions: RankedRow[];
  /** Which pages they opened. */
  pages: RankedRow[];
  /** Which stocks they looked into — the thing a stock app most wants to know. */
  stocks: RankedRow[];
  /** Where they came from. "Direct" covers everything with no referring host. */
  sources: RankedRow[];
  devices: RankedRow[];
  /** Interactions by hour of the IST day, 0-23, always all 24 so the shape is readable. */
  hours: { hour: number; count: number }[];
  users: AnalyticsUserRow[];
  /** The fixed accounts the admin asked to watch closely, present even with no activity. */
  monitoredUsers: MonitoredUserRow[];
  recent: ActivityRow[];
};

/** How many lines of raw activity the dashboard shows. */
export const RECENT_LIMIT = 60;

/**
 * Whom an event is about.
 *
 * The account when there is one, the browser when there is not, and the event itself when there is
 * neither — a request with no session and no stored visitor id is still one person arriving, and
 * folding all of those together would report a hundred of them as one.
 */
function subjectOf(event: AnalyticsEvent): string {
  if (event.userId) return `user:${event.userId}`;
  if (event.visitorId) return `visitor:${event.visitorId}`;
  return `event:${event.id}`;
}

function emptyTotals(): AnalyticsTotals {
  return {
    visitors: 0,
    views: 0,
    signins: 0,
    signups: 0,
    featureOpens: 0,
    blockedAttempts: 0,
    activeUsers: 0,
    guests: 0,
    actions: 0,
    sessions: 0,
  };
}

/** Counts one slice of events. Distinct counts are done over sets the caller does not see. */
function totalsFor(events: AnalyticsEvent[]): AnalyticsTotals {
  const totals = emptyTotals();
  const visitors = new Set<string>();
  const accounts = new Set<string>();
  const guests = new Set<string>();
  const sessions = new Set<string>();

  for (const event of events) {
    const subject = subjectOf(event);
    visitors.add(subject);
    if (event.sessionId) sessions.add(event.sessionId);

    if (event.userId) accounts.add(event.userId);
    else guests.add(subject);

    switch (event.type) {
      case "visit":
        totals.views++;
        break;
      case "signin":
        totals.signins++;
        break;
      case "signup":
        totals.signups++;
        break;
      case "action":
        totals.actions++;
        break;
      default:
        if (event.blocked) totals.blockedAttempts++;
        else totals.featureOpens++;
        break;
    }
  }

  totals.visitors = visitors.size;
  totals.activeUsers = accounts.size;
  totals.guests = guests.size;
  totals.sessions = sessions.size;
  return totals;
}

/**
 * A "most X" table: count the events a picker names, by the key it returns.
 *
 * One function for pages, actions, stocks, sources and devices, because all five ask the same
 * question of different columns — and five near-identical loops is where the fifth one quietly
 * stops matching the other four.
 */
function rank(
  events: AnalyticsEvent[],
  pick: (event: AnalyticsEvent) => { key: string; label: string } | null,
  limit = 12,
): RankedRow[] {
  const tallies = new Map<string, { label: string; count: number; users: Set<string> }>();
  let total = 0;

  for (const event of events) {
    const picked = pick(event);
    if (!picked) continue;

    total++;
    const tally = tallies.get(picked.key) ?? { label: picked.label, count: 0, users: new Set<string>() };
    tally.count++;
    tally.users.add(subjectOf(event));
    tallies.set(picked.key, tally);
  }

  return [...tallies.entries()]
    .map(([key, tally]) => ({
      key,
      label: tally.label,
      count: tally.count,
      users: tally.users.size,
      share: total > 0 ? tally.count / total : 0,
    }))
    // Count, then reach, then name — so equal rows come out in a stable order rather than in
    // whichever order the events happened to arrive.
    .sort((a, b) => b.count - a.count || b.users - a.users || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** The hour of the IST day an event happened on. */
function istHour(at: string): number | null {
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return null;
  return Number(parsed.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
}

function hoursFrom(events: AnalyticsEvent[]): { hour: number; count: number }[] {
  const counts = new Array<number>(24).fill(0);

  for (const event of events) {
    const hour = istHour(event.at);
    if (hour !== null && hour >= 0 && hour < 24) counts[hour]++;
  }

  // All 24 always, so the shape of a day reads even when half of it is empty.
  return counts.map((count, hour) => ({ hour, count }));
}

function funnelFrom(events: AnalyticsEvent[], totals: AnalyticsTotals): Funnel {
  const aiUsers = new Set<string>();
  const payers = new Set<string>();

  for (const event of events) {
    if (event.type === "feature" && !event.blocked) aiUsers.add(subjectOf(event));
    if (event.type === "action" && event.action === "checkout.paid") payers.add(subjectOf(event));
  }

  return {
    visitors: totals.visitors,
    signups: totals.signups,
    activeUsers: totals.activeUsers,
    aiUsers: aiUsers.size,
    payers: payers.size,
    signupRate: totals.visitors > 0 ? totals.signups / totals.visitors : 0,
    payRate: totals.signups > 0 ? payers.size / totals.signups : 0,
  };
}

function dailyFrom(events: AnalyticsEvent[], days: string[]): DailyPoint[] {
  const byDay = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    const bucket = byDay.get(event.day);
    if (bucket) bucket.push(event);
    else byDay.set(event.day, [event]);
  }

  // Walked over the calendar rather than over the events, so a day with no traffic is a zero on
  // the chart instead of a missing bar that silently shortens the week.
  return days.map((day) => {
    const totals = totalsFor(byDay.get(day) ?? []);
    return {
      day,
      visitors: totals.visitors,
      views: totals.views,
      signins: totals.signins,
      signups: totals.signups,
      featureOpens: totals.featureOpens,
      actions: totals.actions,
    };
  });
}

function featuresFrom(events: AnalyticsEvent[]): FeatureUsage[] {
  type Tally = { opens: number; blocked: number; users: Set<string>; lastAt: string | null };
  const tallies = new Map<FeatureKey, Tally>();

  for (const event of events) {
    if (event.type !== "feature" || !isFeatureKey(event.feature)) continue;

    const key = event.feature;
    let tally = tallies.get(key);
    if (!tally) {
      tally = { opens: 0, blocked: 0, users: new Set(), lastAt: null };
      tallies.set(key, tally);
    }

    if (event.blocked) tally.blocked++;
    else {
      tally.opens++;
      tally.users.add(subjectOf(event));
    }

    if (!tally.lastAt || event.at > tally.lastAt) tally.lastAt = event.at;
  }

  let totalOpens = 0;
  for (const tally of tallies.values()) totalOpens += tally.opens;

  return [...tallies.entries()]
    .map(([key, tally]) => ({
      key,
      label: FEATURE_BY_KEY[key].label,
      tier: FEATURE_BY_KEY[key].tier,
      opens: tally.opens,
      users: tally.users.size,
      blocked: tally.blocked,
      share: totalOpens > 0 ? tally.opens / totalOpens : 0,
      lastAt: tally.lastAt,
    }))
    // Opens first, then reach, then name — so two features with the same count come out in a
    // stable order rather than in whichever order the events happened to arrive.
    .sort((a, b) => b.opens - a.opens || b.users - a.users || a.label.localeCompare(b.label));
}

function usersFrom(events: AnalyticsEvent[], users: AdminUserView[]): AnalyticsUserRow[] {
  type Tally = {
    visits: number;
    featureOpens: number;
    signins: number;
    actions: number;
    lastSeen: string | null;
    device: DeviceKind | null;
    features: Map<FeatureKey, number>;
    doings: Map<string, number>;
  };

  const tallies = new Map<string, Tally>();

  for (const event of events) {
    if (!event.userId) continue;

    let tally = tallies.get(event.userId);
    if (!tally) {
      tally = {
        visits: 0,
        featureOpens: 0,
        signins: 0,
        actions: 0,
        lastSeen: null,
        device: null,
        features: new Map(),
        doings: new Map(),
      };
      tallies.set(event.userId, tally);
    }

    if (event.type === "visit") tally.visits++;
    if (event.type === "signin") tally.signins++;
    if (event.type === "action" && isActionKey(event.action)) {
      tally.actions++;
      tally.doings.set(event.action, (tally.doings.get(event.action) ?? 0) + 1);
    }
    if (event.type === "feature" && !event.blocked && isFeatureKey(event.feature)) {
      tally.featureOpens++;
      tally.features.set(event.feature, (tally.features.get(event.feature) ?? 0) + 1);
    }

    if (!tally.lastSeen || event.at > tally.lastSeen) {
      tally.lastSeen = event.at;
      // The device of the most recent event, not the first — what they are using now.
      if (event.device) tally.device = event.device;
    }
  }

  const rows: AnalyticsUserRow[] = [];

  for (const user of users) {
    const tally = tallies.get(user.id);
    // Accounts with no activity in the window are left out. Every account is listed on the
    // Application Users page already; this table answers "who is using it", which is a different
    // question and one an empty row cannot help with.
    if (!tally) continue;

    // The same "commonest, ties to the first seen" rule for both columns, rather than two loops
    // that could drift apart.
    const commonest = <T extends string>(counts: Map<T, number>): T | null => {
      let winner: T | null = null;
      let best = 0;
      for (const [key, count] of counts) {
        if (count > best) {
          winner = key;
          best = count;
        }
      }
      return winner;
    };

    const topFeature = commonest(tally.features);
    const topAction = commonest(tally.doings);

    rows.push({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile ?? null,
      plan: user.plan,
      role: user.role ?? "user",
      emailVerified: user.emailVerified,
      subscribedUntil: user.subscribedUntil ?? null,
      createdAt: user.createdAt,
      visits: tally.visits,
      featureOpens: tally.featureOpens,
      signins: tally.signins,
      actions: tally.actions,
      lastSeen: tally.lastSeen,
      topFeature: topFeature ? FEATURE_BY_KEY[topFeature].label : null,
      topAction: isActionKey(topAction) ? ACTIONS[topAction] : null,
      device: tally.device,
    });
  }

  return rows.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || a.name.localeCompare(b.name));
}

function recentFrom(events: AnalyticsEvent[], byId: Map<string, AdminUserView>, limit: number): ActivityRow[] {
  return events.slice(0, limit).map((event) => {
    const user = event.userId ? byId.get(event.userId) : undefined;

    return {
      id: event.id,
      at: event.at,
      type: event.type,
      feature: isFeatureKey(event.feature) ? FEATURE_BY_KEY[event.feature].label : null,
      action: isActionKey(event.action) ? ACTIONS[event.action] : null,
      label: event.label,
      path: event.path,
      referrer: event.referrer,
      device: event.device,
      blocked: event.blocked,
      // A signed-out arrival is a visitor, and an event whose account has since been deleted is
      // reported as one too rather than as a dangling id.
      name: user?.name ?? "Visitor (not signed in)",
      email: user?.email ?? null,
      mobile: user?.mobile ?? null,
      plan: user?.plan ?? null,
    };
  });
}

function secondsBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 0;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / 1_000);
}

function mostCommon(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let winner: string | null = null;
  let best = 0;
  for (const [value, count] of counts) {
    if (count > best) {
      winner = value;
      best = count;
    }
  }
  return winner;
}

const FEATURE_STEP_CAP_SECONDS = 30 * 60;

function monitoredUsersFrom({
  events,
  users,
  byId,
  presence = [],
  now,
  recentLimit,
}: {
  events: AnalyticsEvent[];
  users: AdminUserView[];
  byId: Map<string, AdminUserView>;
  presence?: PresenceSession[];
  now: Date;
  recentLimit: number;
}): MonitoredUserRow[] {
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const liveRows = buildPresenceReport({ sessions: presence, users, now }).rows;

  return MONITORED_EMAILS.map((email) => {
    const user = usersByEmail.get(email);
    const userEvents = user ? events.filter((event) => event.userId === user.id) : [];
    const ascending = [...userEvents].sort((a, b) => a.at.localeCompare(b.at));
    const recent = recentFrom(userEvents, byId, recentLimit);
    const live = user ? (liveRows.find((row) => row.email?.toLowerCase() === email) ?? null) : null;

    const groupedSessions = new Map<string, AnalyticsEvent[]>();
    for (const event of ascending) {
      const key = event.sessionId ?? `event:${event.id}`;
      const group = groupedSessions.get(key);
      if (group) group.push(event);
      else groupedSessions.set(key, [event]);
    }

    const sessionRows: MonitoredSessionRow[] = [...groupedSessions.entries()].map(([key, group]) => {
      const first = group[0] ?? null;
      const last = group[group.length - 1] ?? null;
      return {
        key,
        startedAt: first?.at ?? null,
        lastSeenAt: last?.at ?? null,
        estimatedSeconds: secondsBetween(first?.at ?? null, last?.at ?? null),
        events: group.length,
        pages: [...new Set(group.map((event) => event.path).filter((path): path is string => Boolean(path)))],
        device: last?.device ?? null,
      };
    });

    const featureTallies = new Map<FeatureKey, MonitoredFeatureUse>();
    for (let index = 0; index < ascending.length; index++) {
      const event = ascending[index];
      if (event.type !== "feature" || !isFeatureKey(event.feature)) continue;

      const key = event.feature;
      const feature = FEATURE_BY_KEY[key];
      const existing =
        featureTallies.get(key) ?? {
          key,
          label: feature.label,
          tier: feature.tier,
          opens: 0,
          blocked: 0,
          firstAt: null,
          lastAt: null,
          estimatedSeconds: 0,
        };

      if (event.blocked) existing.blocked++;
      else existing.opens++;
      existing.firstAt = existing.firstAt && existing.firstAt < event.at ? existing.firstAt : event.at;
      existing.lastAt = existing.lastAt && existing.lastAt > event.at ? existing.lastAt : event.at;

      const next = ascending[index + 1];
      if (!event.blocked && event.sessionId && next?.sessionId === event.sessionId) {
        existing.estimatedSeconds += Math.min(secondsBetween(event.at, next.at), FEATURE_STEP_CAP_SECONDS);
      }

      featureTallies.set(key, existing);
    }

    const features = [...featureTallies.values()].sort(
      (a, b) =>
        b.opens - a.opens ||
        b.blocked - a.blocked ||
        b.estimatedSeconds - a.estimatedSeconds ||
        a.label.localeCompare(b.label),
    );
    const sessionSeconds = sessionRows.reduce((total, row) => total + row.estimatedSeconds, 0);
    const liveSeconds = live?.online ? live.minutes * 60 : 0;
    const liveOverlapSeconds =
      live?.online
        ? sessionRows
            .filter((row) => row.lastSeenAt !== null && row.lastSeenAt >= live.startedAt)
            .reduce((total, row) => total + row.estimatedSeconds, 0)
        : 0;

    return {
      email,
      found: Boolean(user),
      userId: user?.id ?? null,
      name: user?.name ?? "Account not found",
      mobile: user?.mobile ?? null,
      plan: user?.plan ?? null,
      role: user?.role ?? null,
      emailVerified: user?.emailVerified ?? false,
      subscribedUntil: user?.subscribedUntil ?? null,
      createdAt: user?.createdAt ?? null,
      visits: userEvents.filter((event) => event.type === "visit").length,
      actions: userEvents.filter((event) => event.type === "action").length,
      featureOpens: userEvents.filter((event) => event.type === "feature" && !event.blocked).length,
      blockedAttempts: userEvents.filter((event) => event.type === "feature" && event.blocked).length,
      signins: userEvents.filter((event) => event.type === "signin").length,
      signups: userEvents.filter((event) => event.type === "signup").length,
      sessions: groupedSessions.size,
      estimatedSeconds: sessionSeconds + Math.max(0, liveSeconds - liveOverlapSeconds),
      firstSeen: ascending[0]?.at ?? null,
      lastSeen: ascending[ascending.length - 1]?.at ?? null,
      device: ascending[ascending.length - 1]?.device ?? null,
      topPage: mostCommon(userEvents.map((event) => event.path)),
      topFeature: features.find((feature) => feature.opens > 0)?.label ?? null,
      live: live
        ? {
            online: live.online,
            path: live.path,
            minutes: live.minutes,
            idleSeconds: live.idleSeconds,
            tabs: live.tabs,
            startedAt: live.startedAt,
            lastSeenAt: live.lastSeenAt,
          }
        : null,
      features,
      sessionRows: sessionRows.sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "")),
      recent,
    };
  });
}

/**
 * The whole report.
 *
 * `events` is expected newest-first, which is how `listEvents` returns them — the activity feed is
 * the head of that list and nothing here re-sorts it.
 */
export function buildReport({
  events,
  users,
  today,
  days,
  backend,
  recentLimit = RECENT_LIMIT,
  presence = [],
  now = new Date(),
}: {
  events: AnalyticsEvent[];
  users: AdminUserView[];
  today: string;
  days: number;
  backend: "supabase" | "file";
  recentLimit?: number;
  presence?: PresenceSession[];
  now?: Date;
}): AnalyticsReport {
  const from = dayBefore(today, Math.max(0, days - 1));
  const calendar = daysBetween(from, today);
  const inRange = events.filter((event) => event.day >= from && event.day <= today);
  const byId = new Map(users.map((user) => [user.id, user]));
  const features = featuresFrom(inRange);
  const totals = totalsFor(inRange);
  const previousDay = dayBefore(today, 1);

  return {
    backend,
    range: { from, to: today, days: calendar.length },
    totals,
    today: totalsFor(inRange.filter((event) => event.day === today)),
    yesterday: totalsFor(events.filter((event) => event.day === previousDay)),
    daily: dailyFrom(inRange, calendar),
    features,
    funnel: funnelFrom(inRange, totals),
    actions: rank(inRange, (event) =>
      event.type === "action" && isActionKey(event.action) ? { key: event.action, label: ACTIONS[event.action] } : null,
    ),
    pages: rank(inRange, (event) => (event.type === "visit" && event.path ? { key: event.path, label: event.path } : null)),
    // Both doors onto a company: the detail sheet and the picker. Counted together, because "which
    // companies is the audience interested in" is one question however they got there.
    stocks: rank(inRange, (event) =>
      event.type === "action" && (event.action === "stock.open" || event.action === "stock.search") && event.label
        ? { key: event.label, label: event.label }
        : null,
    ),
    sources: rank(inRange, (event) =>
      event.type === "visit" ? { key: event.referrer ?? "direct", label: event.referrer ?? "Direct / bookmarked" } : null,
    ),
    devices: rank(inRange, (event) => (event.device ? { key: event.device, label: event.device } : null), 4),
    hours: hoursFrom(inRange),
    // Already sorted by opens, so the first with any is the most opened. Ranked on opens rather
    // than on unique users because "trending" is about volume of use, not breadth of it.
    trending: features.find((feature) => feature.opens > 0) ?? null,
    users: usersFrom(inRange, users),
    monitoredUsers: monitoredUsersFrom({ events: inRange, users, byId, presence, now, recentLimit }),
    recent: recentFrom(inRange, byId, recentLimit),
  };
}
