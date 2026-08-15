/** @jest-environment node */

import type { AnalyticsEvent } from "../../app/lib/analytics";
import { buildReport } from "../../app/lib/analytics-report";
import type { AdminUserView } from "../../app/lib/store";

const TODAY = "2026-08-12";
const YESTERDAY = "2026-08-11";

let sequence = 0;

function event(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  sequence++;
  const day = overrides.day ?? TODAY;
  return {
    id: `evt_${sequence}`,
    type: "visit",
    at: `${day}T10:${String(sequence).padStart(2, "0")}:00.000Z`,
    day,
    userId: null,
    visitorId: null,
    sessionId: null,
    feature: null,
    action: null,
    label: null,
    path: "/",
    referrer: null,
    device: null,
    blocked: false,
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

/** Newest first, which is the order `listEvents` hands them over in. */
function report(events: AnalyticsEvent[], users: AdminUserView[] = [account()], days = 7) {
  return buildReport({
    events: [...events].sort((a, b) => (a.at < b.at ? 1 : -1)),
    users,
    today: TODAY,
    days,
    backend: "file",
  });
}

beforeEach(() => {
  sequence = 0;
});

describe("the window", () => {
  it("spans the requested number of days, ending today", () => {
    const built = report([], [], 7);

    expect(built.range).toEqual({ from: "2026-08-06", to: TODAY, days: 7 });
    expect(built.daily).toHaveLength(7);
    expect(built.daily[6]).toMatchObject({ day: TODAY, visitors: 0, views: 0 });
  });

  it("keeps a day nobody visited as a zero rather than a missing bar", () => {
    const built = report([event({ day: TODAY, visitorId: "vaaaaaaaaaaa" })], [], 3);

    expect(built.daily.map((point) => point.visitors)).toEqual([0, 0, 1]);
  });

  it("drops events from outside the window", () => {
    const built = report([event({ day: "2026-07-01", visitorId: "vaaaaaaaaaaa" }), event({ day: TODAY, visitorId: "vbbbbbbbbbbb" })], [], 7);

    expect(built.totals.views).toBe(1);
  });

  it("counts a single day when asked for one", () => {
    const built = report([event({ day: YESTERDAY }), event({ day: TODAY })], [], 1);

    expect(built.range.from).toBe(TODAY);
    expect(built.totals.views).toBe(1);
  });
});

describe("totals", () => {
  it("separates people from page views", () => {
    const built = report(
      [
        event({ visitorId: "vaaaaaaaaaaa", path: "/" }),
        event({ visitorId: "vaaaaaaaaaaa", path: "/news" }),
        event({ visitorId: "vbbbbbbbbbbb", path: "/" }),
      ],
      [],
    );

    expect(built.totals.views).toBe(3);
    expect(built.totals.visitors).toBe(2);
  });

  it("counts an arrival with no id at all as one person, not as everybody", () => {
    const built = report([event({}), event({}), event({})], []);

    expect(built.totals.visitors).toBe(3);
    expect(built.totals.guests).toBe(3);
  });

  it("splits signed-in accounts from guests", () => {
    const built = report([event({ userId: "user_1" }), event({ userId: "user_1" }), event({ visitorId: "vbbbbbbbbbbb" })]);

    expect(built.totals.activeUsers).toBe(1);
    expect(built.totals.guests).toBe(1);
    expect(built.totals.visitors).toBe(2);
  });

  it("counts sign-ins, sign-ups, opens and refusals apart from one another", () => {
    const built = report([
      event({ type: "signin", userId: "user_1" }),
      event({ type: "signup", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_1", blocked: true }),
    ]);

    expect(built.totals).toMatchObject({ signins: 1, signups: 1, featureOpens: 1, blockedAttempts: 1 });
  });

  it("reports today separately from the whole window", () => {
    const built = report([event({ day: YESTERDAY, type: "signup", userId: "user_1" }), event({ day: TODAY, type: "signup", userId: "user_1" })]);

    expect(built.totals.signups).toBe(2);
    expect(built.today.signups).toBe(1);
  });

  it("splits the daily row into its four measures", () => {
    const built = report(
      [
        event({ day: TODAY, visitorId: "vaaaaaaaaaaa" }),
        event({ day: TODAY, type: "signin", userId: "user_1" }),
        event({ day: TODAY, type: "signup", userId: "user_1" }),
        event({ day: TODAY, type: "feature", feature: "intel", userId: "user_1" }),
      ],
      [],
      1,
    );

    expect(built.daily[0]).toMatchObject({ day: TODAY, views: 1, signins: 1, signups: 1, featureOpens: 1 });
  });
});

describe("which AI feature is trending", () => {
  it("ranks by opens and reports reach and share alongside", () => {
    const built = report([
      event({ type: "feature", feature: "intel", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_2" }),
      event({ type: "feature", feature: "intel", userId: "user_2" }),
      event({ type: "feature", feature: "research", userId: "user_1" }),
    ]);

    expect(built.features.map((feature) => feature.key)).toEqual(["intel", "research"]);
    expect(built.features[0]).toMatchObject({ label: "AI intelligence search", tier: "elite", opens: 3, users: 2, share: 0.75 });
    expect(built.trending?.key).toBe("intel");
  });

  it("counts refusals against the feature without counting them as use", () => {
    const built = report([
      event({ type: "feature", feature: "intel", userId: "user_1", blocked: true }),
      event({ type: "feature", feature: "intel", userId: "user_2", blocked: true }),
      event({ type: "feature", feature: "research", userId: "user_1" }),
    ]);

    const intel = built.features.find((feature) => feature.key === "intel");
    expect(intel).toMatchObject({ opens: 0, users: 0, blocked: 2, share: 0 });
    // Nothing was opened, so the trending slot goes to the feature that actually was.
    expect(built.trending?.key).toBe("research");
  });

  it("has no trending feature when nothing has been opened", () => {
    expect(report([event({ type: "visit" })]).trending).toBeNull();
    expect(report([event({ type: "feature", feature: "intel", blocked: true })]).trending).toBeNull();
  });

  it("ignores a feature key this build does not gate", () => {
    const built = report([event({ type: "feature", feature: "retired-feature", userId: "user_1" })]);

    expect(built.features).toEqual([]);
  });

  it("breaks a tie on reach, then on name, so the order is stable", () => {
    const built = report([
      event({ type: "feature", feature: "research", userId: "user_1" }),
      event({ type: "feature", feature: "compare", userId: "user_1" }),
      event({ type: "feature", feature: "compare", userId: "user_2" }),
      event({ type: "feature", feature: "research", userId: "user_1" }),
      event({ type: "feature", feature: "news", userId: "user_3" }),
      event({ type: "feature", feature: "news", userId: "user_3" }),
    ]);

    // All three have two opens; compare and news reach two and one person respectively, and
    // research (also one) sorts after news by label.
    expect(built.features.map((feature) => feature.key)).toEqual(["compare", "news", "research"]);
  });

  it("records when a feature was last touched", () => {
    const built = report([
      event({ type: "feature", feature: "intel", userId: "user_1", at: `${TODAY}T09:00:00.000Z` }),
      event({ type: "feature", feature: "intel", userId: "user_1", at: `${TODAY}T11:00:00.000Z` }),
    ]);

    expect(built.features[0].lastAt).toBe(`${TODAY}T11:00:00.000Z`);
  });
});

describe("who is using it", () => {
  it("joins the account's name, address and mobile onto its activity", () => {
    const built = report([
      event({ type: "visit", userId: "user_1", device: "mobile" }),
      event({ type: "signin", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_1" }),
    ]);

    expect(built.users).toHaveLength(1);
    expect(built.users[0]).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.com",
      mobile: "9876543210",
      plan: "Pro",
      visits: 1,
      signins: 1,
      featureOpens: 1,
      topFeature: "AI intelligence search",
    });
  });

  it("leaves out accounts with no activity in the window", () => {
    const built = report([event({ userId: "user_1" })], [account(), account({ id: "user_2", name: "Dormant", email: "d@example.com" })]);

    expect(built.users.map((user) => user.id)).toEqual(["user_1"]);
  });

  it("ignores activity from an account that no longer exists", () => {
    const built = report([event({ userId: "user_deleted" })], [account()]);

    expect(built.users).toEqual([]);
  });

  it("names the feature the account reaches for most, and none when it has opened none", () => {
    const built = report([
      event({ type: "feature", feature: "research", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_1" }),
      // A refusal is not an open and must not win the slot.
      event({ type: "feature", feature: "compare", userId: "user_1", blocked: true }),
      event({ type: "feature", feature: "compare", userId: "user_1", blocked: true }),
      event({ type: "feature", feature: "compare", userId: "user_1", blocked: true }),
    ]);

    expect(built.users[0].topFeature).toBe("AI intelligence search");
    expect(built.users[0].featureOpens).toBe(3);

    expect(report([event({ type: "visit", userId: "user_1" })]).users[0].topFeature).toBeNull();
  });

  it("reports the device of the most recent event, not the first", () => {
    const built = report([
      event({ userId: "user_1", at: `${TODAY}T09:00:00.000Z`, device: "desktop" }),
      event({ userId: "user_1", at: `${TODAY}T11:00:00.000Z`, device: "mobile" }),
    ]);

    expect(built.users[0]).toMatchObject({ device: "mobile", lastSeen: `${TODAY}T11:00:00.000Z` });
  });

  it("leaves the device null when nothing carried one", () => {
    expect(report([event({ userId: "user_1" })]).users[0].device).toBeNull();
  });

  it("sorts by last seen, falling back to name", () => {
    const users = [
      account({ id: "user_1", name: "Asha Rao" }),
      account({ id: "user_2", name: "Bala Iyer", email: "bala@example.com" }),
      account({ id: "user_3", name: "Chitra Nair", email: "chitra@example.com" }),
    ];
    const built = report(
      [
        event({ userId: "user_1", at: `${TODAY}T09:00:00.000Z` }),
        event({ userId: "user_2", at: `${TODAY}T12:00:00.000Z` }),
        event({ userId: "user_3", at: `${TODAY}T09:00:00.000Z` }),
      ],
      users,
    );

    expect(built.users.map((user) => user.id)).toEqual(["user_2", "user_1", "user_3"]);
  });
});

describe("interactions", () => {
  const action = (overrides: Partial<AnalyticsEvent> = {}) => event({ type: "action", path: null, ...overrides });

  it("counts them apart from arrivals", () => {
    const built = report([event({ type: "visit" }), action({ action: "stock.open", label: "RELIANCE" })]);

    expect(built.totals).toMatchObject({ views: 1, actions: 1 });
    expect(built.daily[built.daily.length - 1].actions).toBe(1);
  });

  it("ranks what people do, in the words the admin reads", () => {
    const built = report([
      action({ action: "stock.open", label: "RELIANCE", userId: "user_1" }),
      action({ action: "stock.open", label: "TCS", userId: "user_2" }),
      action({ action: "nav.section", label: "intel", userId: "user_1" }),
    ]);

    expect(built.actions[0]).toMatchObject({
      key: "stock.open",
      label: "Opened a stock's detail sheet",
      count: 2,
      users: 2,
    });
    expect(built.actions[1]).toMatchObject({ key: "nav.section", count: 1 });
  });

  it("ignores an action this build does not know the name of", () => {
    expect(report([action({ action: "retired.action", label: "x" })]).actions).toEqual([]);
  });

  it("counts the two doors onto a company together", () => {
    const built = report([
      action({ action: "stock.open", label: "RELIANCE", userId: "user_1" }),
      action({ action: "stock.search", label: "RELIANCE", userId: "user_2" }),
      action({ action: "stock.open", label: "TCS", userId: "user_1" }),
    ]);

    expect(built.stocks[0]).toMatchObject({ key: "RELIANCE", count: 2, users: 2 });
    expect(built.stocks[1]).toMatchObject({ key: "TCS", count: 1 });
  });

  it("names the account's commonest interaction alongside its commonest feature", () => {
    const built = report([
      action({ action: "stock.open", label: "RELIANCE", userId: "user_1" }),
      action({ action: "stock.open", label: "TCS", userId: "user_1" }),
      action({ action: "nav.section", label: "intel", userId: "user_1" }),
    ]);

    expect(built.users[0]).toMatchObject({ actions: 3, topAction: "Opened a stock's detail sheet" });
  });

  it("leaves the commonest interaction unnamed for someone who has only browsed", () => {
    expect(report([event({ type: "visit", userId: "user_1" })]).users[0].topAction).toBeNull();
  });
});

describe("pages, sources and devices", () => {
  it("ranks the pages people land on", () => {
    const built = report([
      event({ path: "/overview", visitorId: "vaaaaaaaaaaa" }),
      event({ path: "/overview", visitorId: "vbbbbbbbbbbb" }),
      event({ path: "/news", visitorId: "vaaaaaaaaaaa" }),
    ]);

    expect(built.pages[0]).toMatchObject({ key: "/overview", count: 2, users: 2, share: 2 / 3 });
  });

  it("files an arrival with no referrer under direct", () => {
    const built = report([event({ referrer: null }), event({ referrer: "news.example.com" })]);

    expect(built.sources.map((row) => row.key)).toEqual(["direct", "news.example.com"]);
    expect(built.sources[0].label).toBe("Direct / bookmarked");
  });

  it("splits by device, ignoring events that carried none", () => {
    const built = report([event({ device: "mobile" }), event({ device: "mobile" }), event({ device: null })]);

    expect(built.devices).toEqual([{ key: "mobile", label: "mobile", count: 2, users: 2, share: 1 }]);
  });
});

describe("sessions and the shape of a day", () => {
  it("counts sittings from the per-tab id", () => {
    const built = report([
      event({ sessionId: "saaaaaaaaaaa" }),
      event({ sessionId: "saaaaaaaaaaa" }),
      event({ sessionId: "sbbbbbbbbbbb" }),
      event({ sessionId: null }),
    ]);

    expect(built.totals.sessions).toBe(2);
  });

  it("always reports all twenty-four hours, in IST", () => {
    // 04:30 UTC is 10:00 in IST — the hour a UTC-based chart would put five and a half hours out.
    const built = report([event({ at: `${TODAY}T04:30:00.000Z` })]);

    expect(built.hours).toHaveLength(24);
    expect(built.hours[10].count).toBe(1);
    expect(built.hours.reduce((sum, slot) => sum + slot.count, 0)).toBe(1);
  });

  it("ignores an event whose instant cannot be read", () => {
    expect(report([event({ at: "not a time" })]).hours.every((slot) => slot.count === 0)).toBe(true);
  });
});

describe("the funnel", () => {
  it("sizes each stage and the rate between them", () => {
    const built = report([
      event({ visitorId: "vaaaaaaaaaaa" }),
      event({ visitorId: "vbbbbbbbbbbb" }),
      event({ type: "signup", userId: "user_1" }),
      event({ type: "feature", feature: "intel", userId: "user_1" }),
      event({ type: "action", action: "checkout.paid", label: "Pro", userId: "user_1" }),
    ]);

    expect(built.funnel).toMatchObject({ signups: 1, activeUsers: 1, aiUsers: 1, payers: 1 });
    // Three distinct people: two browsers and one account.
    expect(built.funnel.visitors).toBe(3);
    expect(built.funnel.signupRate).toBeCloseTo(1 / 3, 5);
    expect(built.funnel.payRate).toBe(1);
  });

  it("reports zero rates rather than dividing by nothing", () => {
    expect(report([]).funnel).toMatchObject({ visitors: 0, signupRate: 0, payRate: 0 });
  });

  it("does not count a refused AI attempt as someone who used it", () => {
    const built = report([event({ type: "feature", feature: "intel", userId: "user_1", blocked: true })]);

    expect(built.funnel.aiUsers).toBe(0);
  });
});

describe("yesterday", () => {
  it("is reported alongside today, so a tile can carry a direction", () => {
    const built = report([
      event({ day: YESTERDAY, type: "signup", userId: "user_1" }),
      event({ day: YESTERDAY, type: "signup", userId: "user_1" }),
      event({ day: TODAY, type: "signup", userId: "user_1" }),
    ]);

    expect(built.today.signups).toBe(1);
    expect(built.yesterday.signups).toBe(2);
  });
});

describe("the activity feed", () => {
  it("names a signed-out arrival rather than showing a blank row", () => {
    const built = report([event({ visitorId: "vaaaaaaaaaaa", path: "/news" })], []);

    expect(built.recent[0]).toMatchObject({
      name: "Visitor (not signed in)",
      email: null,
      mobile: null,
      plan: null,
      path: "/news",
      feature: null,
    });
  });

  it("labels a feature row with the feature's own name", () => {
    const built = report([event({ type: "feature", feature: "intel", userId: "user_1" })]);

    expect(built.recent[0]).toMatchObject({ feature: "AI intelligence search", name: "Asha Rao", mobile: "9876543210" });
  });

  it("keeps the newest first and stops at the limit", () => {
    const events = Array.from({ length: 5 }, (_, index) => event({ at: `${TODAY}T1${index}:00:00.000Z` }));
    const built = buildReport({
      events: [...events].sort((a, b) => (a.at < b.at ? 1 : -1)),
      users: [],
      today: TODAY,
      days: 7,
      backend: "file",
      recentLimit: 2,
    });

    expect(built.recent).toHaveLength(2);
    expect(built.recent[0].at).toBe(`${TODAY}T14:00:00.000Z`);
  });

  it("carries the backend through, so the dashboard can say where the figures came from", () => {
    expect(report([]).backend).toBe("file");
  });
});
