/** @jest-environment node */

import {
  buildPresenceReport,
  subjectOf,
  ONLINE_WINDOW_MS,
  type PresenceSession,
} from "../../app/lib/presence-report";
import type { AdminUserView } from "../../app/lib/store";

const NOW = new Date("2026-08-14T10:00:00.000Z");

/** An instant `seconds` before the report is taken. */
function secondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1_000).toISOString();
}

let sequence = 0;

function session(overrides: Partial<PresenceSession> = {}): PresenceSession {
  sequence++;
  return {
    key: `s:tab${sequence}`,
    userId: null,
    visitorId: `visitor${sequence}`,
    sessionId: `tab${sequence}`,
    path: "/",
    device: "desktop",
    startedAt: secondsAgo(600),
    lastSeenAt: secondsAgo(10),
    ...overrides,
  };
}

function account(overrides: Partial<AdminUserView> = {}): AdminUserView {
  return {
    id: "user_1",
    name: "Asha Rao",
    email: "asha@example.com",
    mobile: "9876543210",
    plan: "Pro",
    role: "user",
    createdAt: "2026-07-01T00:00:00.000Z",
    subscribedUntil: "2026-09-01",
    emailVerifiedAt: "2026-07-01T00:00:00.000Z",
    emailVerified: true,
    ...overrides,
  };
}

function report(sessions: PresenceSession[], users: AdminUserView[] = []) {
  return buildPresenceReport({ sessions, users, now: NOW });
}

beforeEach(() => {
  sequence = 0;
});

describe("subjectOf", () => {
  it("folds a person's sittings together by account before anything else", () => {
    expect(subjectOf(session({ userId: "user_1", visitorId: "visitor_9" }))).toBe("user:user_1");
  });

  it("falls back to the browser for somebody who has not signed in", () => {
    expect(subjectOf(session({ userId: null, visitorId: "visitor_9" }))).toBe("visitor:visitor_9");
  });

  it("counts a sitting with no id at all as its own person, rather than folding them into one", () => {
    const first = subjectOf(session({ key: "s:a", userId: null, visitorId: null }));
    const second = subjectOf(session({ key: "s:b", userId: null, visitorId: null }));

    expect(first).not.toBe(second);
  });
});

describe("buildPresenceReport", () => {
  it("counts nobody, and says so without falling over, when the store is empty", () => {
    const empty = report([]);

    expect(empty.summary).toMatchObject({ online: 0, signedIn: 0, guests: 0, tabs: 0, recent: 0 });
    expect(empty.rows).toEqual([]);
    expect(empty.pages).toEqual([]);
    expect(empty.devices).toEqual([]);
  });

  it("counts a person once however many tabs they have open", () => {
    const live = report([
      session({ key: "s:one", userId: "user_1", visitorId: "browser_1" }),
      session({ key: "s:two", userId: "user_1", visitorId: "browser_1" }),
      session({ key: "s:three", userId: "user_1", visitorId: "browser_1" }),
    ], [account()]);

    expect(live.summary.online).toBe(1);
    expect(live.summary.tabs).toBe(3);
    expect(live.rows).toHaveLength(1);
    expect(live.rows[0].tabs).toBe(3);
  });

  it("separates the people who are signed in from the ones who are not", () => {
    const live = report(
      [
        session({ userId: "user_1" }),
        session({ userId: null, visitorId: "guest_a" }),
        session({ userId: null, visitorId: "guest_b" }),
      ],
      [account()],
    );

    expect(live.summary).toMatchObject({ online: 3, signedIn: 1, guests: 2 });
  });

  it("joins the account details on, and never invents them for a visitor", () => {
    const live = report([session({ userId: "user_1" }), session({ userId: null, visitorId: "guest" })], [account()]);

    expect(live.rows.find((row) => row.signedIn)).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.com",
      mobile: "9876543210",
      plan: "Pro",
    });
    expect(live.rows.find((row) => !row.signedIn)).toMatchObject({
      name: "Visitor (not signed in)",
      email: null,
      plan: null,
    });
  });

  it("reads a sitting whose account has since been deleted as a visitor, not a dangling id", () => {
    const live = report([session({ userId: "user_gone" })], [account()]);

    expect(live.rows[0]).toMatchObject({ name: "Visitor (not signed in)", signedIn: false });
  });

  it("marks a sitting that has stopped beating as gone, and keeps it on the list", () => {
    const live = report([
      session({ key: "s:here", visitorId: "here", lastSeenAt: secondsAgo(20) }),
      session({ key: "s:left", visitorId: "left", lastSeenAt: secondsAgo(900) }),
    ]);

    expect(live.summary).toMatchObject({ online: 1, recent: 2 });
    expect(live.rows.map((row) => row.online)).toEqual([true, false]);
  });

  it("counts a sitting on the edge of the window as still here", () => {
    const edge = ONLINE_WINDOW_MS / 1_000;
    const live = report([
      session({ key: "s:edge", lastSeenAt: secondsAgo(edge) }),
      session({ key: "s:past", lastSeenAt: secondsAgo(edge + 1) }),
    ]);

    expect(live.summary.online).toBe(1);
  });

  it("treats a timestamp it cannot read as stale rather than as somebody on the site", () => {
    const live = report([session({ startedAt: "not a date", lastSeenAt: "not a date" })]);

    expect(live.summary.online).toBe(0);
    expect(live.rows[0]).toMatchObject({ online: false, minutes: 0, idleSeconds: 0 });
  });

  it("reports where a person is from their most recent heartbeat, not their first", () => {
    const live = report([
      session({ key: "s:old", userId: "user_1", path: "/news", device: "desktop", lastSeenAt: secondsAgo(60) }),
      session({ key: "s:new", userId: "user_1", path: "/overview", device: "mobile", lastSeenAt: secondsAgo(5) }),
    ], [account()]);

    expect(live.rows[0]).toMatchObject({ path: "/overview", device: "mobile" });
  });

  it("measures the stay from the earliest of a person's sittings", () => {
    const live = report([
      session({ key: "s:late", userId: "user_1", startedAt: secondsAgo(120) }),
      session({ key: "s:early", userId: "user_1", startedAt: secondsAgo(3_600) }),
    ], [account()]);

    expect(live.rows[0].minutes).toBe(60);
  });

  it("reports how stale each row is, in seconds", () => {
    const live = report([session({ lastSeenAt: secondsAgo(45) })]);

    expect(live.rows[0].idleSeconds).toBe(45);
  });

  it("never reports a negative age for a clock that ran ahead", () => {
    const live = report([session({ startedAt: secondsAgo(-30), lastSeenAt: secondsAgo(-30) })]);

    expect(live.rows[0]).toMatchObject({ idleSeconds: 0, minutes: 0 });
  });

  it("puts the people who are here above the ones who have left, newest first", () => {
    const live = report([
      session({ key: "s:gone", visitorId: "gone", lastSeenAt: secondsAgo(900) }),
      session({ key: "s:older", visitorId: "older", lastSeenAt: secondsAgo(100) }),
      session({ key: "s:newer", visitorId: "newer", lastSeenAt: secondsAgo(5) }),
    ]);

    expect(live.rows.map((row) => row.key)).toEqual(["visitor:newer", "visitor:older", "visitor:gone"]);
  });

  it("breaks a tie on the same heartbeat by name, so the table holds still between refreshes", () => {
    const at = secondsAgo(10);
    const live = report(
      [
        session({ key: "s:b", userId: "user_2", lastSeenAt: at }),
        session({ key: "s:a", userId: "user_1", lastSeenAt: at }),
      ],
      [account(), account({ id: "user_2", name: "Bharat Shah", email: "bharat@example.com" })],
    );

    expect(live.rows.map((row) => row.name)).toEqual(["Asha Rao", "Bharat Shah"]);
  });

  it("ranks the pages people are on, counting each person once", () => {
    const live = report([
      session({ visitorId: "a", path: "/news" }),
      session({ visitorId: "b", path: "/news" }),
      session({ visitorId: "c", path: "/overview" }),
    ]);

    expect(live.pages).toEqual([
      { key: "/news", label: "/news", people: 2 },
      { key: "/overview", label: "/overview", people: 1 },
    ]);
  });

  it("orders two equally busy pages by name rather than by whichever beat arrived first", () => {
    const live = report([
      session({ visitorId: "a", path: "/zebra" }),
      session({ visitorId: "b", path: "/apple" }),
    ]);

    expect(live.pages.map((page) => page.key)).toEqual(["/apple", "/zebra"]);
  });

  it("leaves a heartbeat with no path out of the page list rather than inventing one", () => {
    const live = report([session({ path: null }), session({ path: "/news" })]);

    expect(live.pages).toEqual([{ key: "/news", label: "/news", people: 1 }]);
  });

  it("names the devices people are reading on, and skips the ones that reported none", () => {
    const live = report([
      session({ visitorId: "a", device: "mobile" }),
      session({ visitorId: "b", device: "mobile" }),
      session({ visitorId: "c", device: "tablet" }),
      session({ visitorId: "d", device: null }),
    ]);

    expect(live.devices).toEqual([
      { key: "mobile", label: "Phone", people: 2 },
      { key: "tablet", label: "Tablet", people: 1 },
    ]);
  });

  it("counts only the people who are actually here in the page and device lists", () => {
    const live = report([
      session({ visitorId: "here", path: "/news", lastSeenAt: secondsAgo(10) }),
      session({ visitorId: "left", path: "/news", lastSeenAt: secondsAgo(900) }),
    ]);

    expect(live.pages).toEqual([{ key: "/news", label: "/news", people: 1 }]);
    expect(live.devices[0].people).toBe(1);
  });

  it("carries the windows it was built with, so the panel can label its own figures", () => {
    const live = report([]);

    expect(live).toMatchObject({ available: true, windowSeconds: 150, retentionMinutes: 60 });
    expect(live.at).toBe(NOW.toISOString());
  });

  it("takes its own clock when none is passed, rather than refusing to build", () => {
    const live = buildPresenceReport({ sessions: [], users: [] });

    expect(Date.parse(live.at)).not.toBeNaN();
  });
});
