/** @jest-environment node */

import { promises as fs } from "node:fs";
import {
  ACTIONS,
  ANALYTICS_RETENTION_DAYS,
  analyticsBackendName,
  buildEvent,
  cleanLabel,
  cleanPath,
  cleanReferrer,
  cleanVisitorId,
  isActionKey,
  dayBefore,
  daysBetween,
  deviceFrom,
  istDay,
  listEvents,
  recordEvent,
  resetAnalyticsThrottle,
  visitorIdFromRequest,
  VISITOR_COOKIE,
} from "../../app/lib/analytics";

// The per-worker event log jest.setup.ts points `app/lib/analytics` at, so this suite writes the
// same file the code under test reads — and never the real `app/data/analytics-events.json`.
const eventsPath = process.env.STOCKERS_ANALYTICS_FILE as string;

beforeEach(async () => {
  await fs.rm(eventsPath, { force: true });
  resetAnalyticsThrottle();
});

afterAll(async () => {
  await fs.rm(eventsPath, { force: true });
});

describe("dates", () => {
  it("reports the IST calendar day, not the UTC one", () => {
    // 19:00 UTC is 00:30 the next morning in IST — the case a UTC-based counter gets wrong every
    // evening, which is when this app's audience is actually reading it.
    expect(istDay("2026-08-11T19:00:00Z")).toBe("2026-08-12");
    expect(istDay("2026-08-11T05:00:00Z")).toBe("2026-08-11");
  });

  it("falls back to now for an unparseable instant", () => {
    expect(istDay("not a date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("walks back by whole days", () => {
    expect(dayBefore("2026-08-12", 3)).toBe("2026-08-09");
    expect(dayBefore("2026-08-01", 1)).toBe("2026-07-31");
    expect(dayBefore("nonsense", 3)).toBe("nonsense");
  });

  it("fills every day in a range so an empty day is still a bar", () => {
    expect(daysBetween("2026-08-10", "2026-08-12")).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
    expect(daysBetween("2026-08-12", "2026-08-10")).toEqual([]);
    expect(daysBetween("2026-01-01", "2026-12-31", 5)).toHaveLength(5);
  });
});

describe("what arrives from outside", () => {
  it("buckets a user agent", () => {
    expect(deviceFrom(null)).toBeNull();
    expect(deviceFrom("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148")).toBe("mobile");
    expect(deviceFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });

  it("strips the query string from a path, and refuses one that is not ours", () => {
    expect(cleanPath("/overview?token=secret#top")).toBe("/overview");
    expect(cleanPath("//evil.example.com")).toBeNull();
    expect(cleanPath("https://evil.example.com/x")).toBeNull();
    expect(cleanPath(42)).toBeNull();
    expect(cleanPath(`/${"a".repeat(400)}`)).toHaveLength(120);
  });

  it("keeps only the referring host", () => {
    expect(cleanReferrer("https://news.example.com/story/12?utm=x")).toBe("news.example.com");
    expect(cleanReferrer("")).toBeNull();
    expect(cleanReferrer("not a url")).toBeNull();
    expect(cleanReferrer(null)).toBeNull();
  });

  it("accepts a visitor id only in the shape the app issues", () => {
    expect(cleanVisitorId("vabc12345678")).toBe("vabc12345678");
    expect(cleanVisitorId("  vabc12345678  ")).toBe("vabc12345678");
    expect(cleanVisitorId("short")).toBeNull();
    expect(cleanVisitorId("has spaces in it")).toBeNull();
    expect(cleanVisitorId(null)).toBeNull();
  });

  it("reads the visitor id out of the cookie the tracker sets", () => {
    const withCookie = (cookie: string) => new Request("http://localhost/x", { headers: { cookie } });

    expect(visitorIdFromRequest(withCookie(`${VISITOR_COOKIE}=vabc12345678`))).toBe("vabc12345678");
    expect(visitorIdFromRequest(withCookie(`other=1; ${VISITOR_COOKIE}=vabc12345678; more=2`))).toBe("vabc12345678");
    expect(visitorIdFromRequest(withCookie("other=1"))).toBeNull();
    expect(visitorIdFromRequest(withCookie(`${VISITOR_COOKIE}=%E0%A4%A`))).toBeNull();
    expect(visitorIdFromRequest(new Request("http://localhost/x"))).toBeNull();
  });
});

describe("buildEvent", () => {
  it("keeps a known feature key and drops one it does not gate", () => {
    expect(buildEvent({ type: "feature", feature: "intel" }).feature).toBe("intel");
    expect(buildEvent({ type: "feature", feature: "made-up" }).feature).toBeNull();
    expect(buildEvent({ type: "feature", feature: 7 }).feature).toBeNull();
  });

  it("defaults every optional field rather than leaving it undefined", () => {
    const event = buildEvent({ type: "visit" }, new Date("2026-08-11T19:00:00Z"));

    expect(event).toMatchObject({
      type: "visit",
      at: "2026-08-11T19:00:00.000Z",
      day: "2026-08-12",
      userId: null,
      visitorId: null,
      sessionId: null,
      feature: null,
      action: null,
      label: null,
      path: null,
      referrer: null,
      device: null,
      blocked: false,
    });
    expect(event.id).toMatch(/^evt_/);
  });

  it("keeps an action this build knows and drops one it does not", () => {
    expect(buildEvent({ type: "action", action: "stock.open", label: "RELIANCE" })).toMatchObject({
      action: "stock.open",
      label: "RELIANCE",
    });
    expect(buildEvent({ type: "action", action: "made.up" }).action).toBeNull();
    expect(buildEvent({ type: "action", action: 7 }).action).toBeNull();
  });
});

describe("interactions", () => {
  it("names every action it is willing to record", () => {
    expect(isActionKey("stock.open")).toBe(true);
    expect(isActionKey("made.up")).toBe(false);
    expect(isActionKey(7)).toBe(false);
    // Every key carries a sentence the admin dashboard can print as-is.
    for (const [key, label] of Object.entries(ACTIONS)) {
      expect(label.length).toBeGreaterThan(3);
      expect(key).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it("accepts a label from a fixed alphabet, and nothing a form could produce", () => {
    expect(cleanLabel(" RELIANCE ")).toBe("RELIANCE");
    expect(cleanLabel("market-pulse")).toBe("market-pulse");
    expect(cleanLabel("ARE&M")).toBe("ARE&M");
    // Anything that looks like prose, an address or a URL is refused outright.
    expect(cleanLabel("what do you think about my portfolio?")).toBeNull();
    expect(cleanLabel("someone@example.com")).toBeNull();
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel(7)).toBeNull();
  });

  it("does not store an action it cannot name", async () => {
    await recordEvent({ type: "action", action: "made.up", userId: "user_1" });

    expect(await listEvents("1970-01-01")).toEqual([]);
  });

  it("keeps two different actions apart under the throttle", async () => {
    await recordEvent({ type: "action", action: "stock.open", label: "RELIANCE", userId: "user_1", throttleMs: 60_000 });
    await recordEvent({ type: "action", action: "stock.open", label: "RELIANCE", userId: "user_1", throttleMs: 60_000 });
    // A different stock, and a different action on the same stock, are both their own event.
    await recordEvent({ type: "action", action: "stock.open", label: "TCS", userId: "user_1", throttleMs: 60_000 });
    await recordEvent({ type: "action", action: "watchlist.add", label: "RELIANCE", userId: "user_1", throttleMs: 60_000 });

    expect(await listEvents("1970-01-01")).toHaveLength(3);
  });
});

describe("recording and reading back", () => {
  it("stores an event and reads it back", async () => {
    await recordEvent({ type: "signup", userId: "user_1" });

    const events = await listEvents("1970-01-01");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "signup", userId: "user_1" });
  });

  it("reports which backend is in use", () => {
    expect(analyticsBackendName()).toBe("file");
  });

  it("folds a repeat from the same subject inside the throttle window", async () => {
    const ping = () => recordEvent({ type: "feature", feature: "intel", userId: "user_1", throttleMs: 60_000 });

    await ping();
    await ping();
    await ping();

    expect(await listEvents("1970-01-01")).toHaveLength(1);
  });

  it("does not fold a different feature, a different person, or an unthrottled event", async () => {
    await recordEvent({ type: "feature", feature: "intel", userId: "user_1", throttleMs: 60_000 });
    await recordEvent({ type: "feature", feature: "research", userId: "user_1", throttleMs: 60_000 });
    await recordEvent({ type: "feature", feature: "intel", userId: "user_2", throttleMs: 60_000 });
    // Nothing to throttle by: no account and no visitor id.
    await recordEvent({ type: "visit", path: "/", throttleMs: 60_000 });
    await recordEvent({ type: "visit", path: "/", throttleMs: 60_000 });

    expect(await listEvents("1970-01-01")).toHaveLength(5);
  });

  it("throttles a signed-out visitor by their browser id", async () => {
    await recordEvent({ type: "visit", visitorId: "vabc12345678", path: "/news", throttleMs: 60_000 });
    await recordEvent({ type: "visit", visitorId: "vabc12345678", path: "/news", throttleMs: 60_000 });
    await recordEvent({ type: "visit", visitorId: "vabc12345678", path: "/about", throttleMs: 60_000 });

    expect(await listEvents("1970-01-01")).toHaveLength(2);
  });

  it("returns the window newest first, and refuses to page in more than asked for", async () => {
    const day = istDay();
    await fs.writeFile(
      eventsPath,
      JSON.stringify([
        { id: "a", type: "visit", at: "2020-01-01T00:00:00.000Z", day: "2020-01-01", blocked: false },
        { id: "b", type: "visit", at: `${day}T01:00:00.000Z`, day, blocked: false },
        { id: "c", type: "visit", at: `${day}T02:00:00.000Z`, day, blocked: false },
      ]),
      "utf8",
    );

    expect((await listEvents(day)).map((event) => event.id)).toEqual(["c", "b"]);
    expect((await listEvents(day, 1)).map((event) => event.id)).toEqual(["c"]);
    // Out-of-range limits are clamped rather than honoured.
    expect(await listEvents(day, 0)).toHaveLength(1);
  });

  it("treats an unreadable log as no history rather than an error", async () => {
    await fs.writeFile(eventsPath, "{not json", "utf8");
    expect(await listEvents("1970-01-01")).toEqual([]);

    await fs.writeFile(eventsPath, JSON.stringify({ notAnArray: true }), "utf8");
    expect(await listEvents("1970-01-01")).toEqual([]);
  });

  it("swallows a failed write, because analytics must never fail the thing it observes", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("disk full"));

    await expect(recordEvent({ type: "signin", userId: "user_1" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it("keeps a retention window worth looking back over", () => {
    expect(ANALYTICS_RETENTION_DAYS).toBeGreaterThanOrEqual(90);
  });
});
