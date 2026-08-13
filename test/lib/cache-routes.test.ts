/** @jest-environment node */

import { promises as fs } from "node:fs";
import path from "node:path";
import { GET, POST, keysFrom, tagsFrom } from "../../app/api/admin/cache/route";
import { GET as ADVICE } from "../../app/api/admin/cache/advice/route";
import { cacheInventory, clearMemoryCache, revalidating } from "../../app/lib/cache";
import { createToken, type AppUser } from "../../app/lib/store";

const revalidateTag = jest.fn();

// The Data Cache is Next's, not this application's, and it needs a request store no route test has
// one of. Standing in for it here keeps the assertions on *which* tags were dropped, which is the
// part this route is responsible for.
jest.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  unstable_cache: (callback: () => unknown) => callback,
}));

// The catalogue imports every module that declares a feed, which for a route test is a dozen
// network-shaped modules loaded for the sake of their registrations. The feeds under test are
// registered by hand instead, so the cases stay about the route rather than about whichever real
// feed happened to import cleanly.
jest.mock("../../app/lib/cache-report", () => {
  const actual = jest.requireActual("../../app/lib/cache-report");
  return {
    ...actual,
    loadCacheCatalogue: jest.fn().mockResolvedValue(undefined),
    buildCacheReport: async () => actual.summarise(jest.requireActual("../../app/lib/cache").cacheInventory()),
  };
});

const usersPath = process.env.STOCKERS_USERS_FILE as string;

function account(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "user_regular",
    name: "Regular User",
    email: "regular@example.com",
    passwordHash: "salt:hash",
    plan: "Starter",
    createdAt: "2026-08-01T00:00:00.000Z",
    mobile: "9876543210",
    role: "user",
    trialStartedAt: "2026-08-01T00:00:00.000Z",
    subscribedUntil: null,
    emailVerifiedAt: null,
    verificationToken: null,
    ...overrides,
  };
}

const admin = account({ id: "user_admin", name: "Admin", email: "admin@example.com", role: "admin" });
const regular = account();

let originalRoster: string | null = null;

beforeAll(async () => {
  originalRoster = await fs.readFile(usersPath, "utf8").catch(() => null);
  await fs.mkdir(path.dirname(usersPath), { recursive: true });
});

beforeEach(async () => {
  await fs.writeFile(usersPath, JSON.stringify([admin, regular], null, 2), "utf8");
  clearMemoryCache();
  revalidateTag.mockClear();
});

afterAll(async () => {
  if (originalRoster === null) await fs.rm(usersPath, { force: true });
  else await fs.writeFile(usersPath, originalRoster, "utf8");
});

function request(body?: unknown, as: AppUser | null = admin) {
  return new Request("http://localhost/api/admin/cache", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(as ? { Authorization: `Bearer ${createToken(as)}` } : {}),
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

// ---------------------------------------------------------------------------
// Reading the body
// ---------------------------------------------------------------------------

describe("tagsFrom", () => {
  it("takes every family when none are named", () => {
    expect(tagsFrom(null)).toEqual(["bse", "nse", "ai", "news", "quotes"]);
    expect(tagsFrom({})).toEqual(["bse", "nse", "ai", "news", "quotes"]);
  });

  it("takes only the families it recognises", () => {
    expect(tagsFrom({ tags: ["bse", "not-a-family"] })).toEqual(["bse"]);
  });

  /** A list of nothing but nonsense is a caller error, and clearing everything is the safe read. */
  it("falls back to everything when nothing in the list is a family", () => {
    expect(tagsFrom({ tags: ["nonsense"] })).toEqual(["bse", "nse", "ai", "news", "quotes"]);
  });
});

describe("keysFrom", () => {
  it("has nothing to say when the field is absent or not a list", () => {
    expect(keysFrom(null, "keys")).toEqual([]);
    expect(keysFrom({ keys: "bse:tape" }, "keys")).toEqual([]);
  });

  it("keeps each named key once, and drops the empty ones", () => {
    expect(keysFrom({ warm: ["a", "a", "", "  ", "b", 7] }, "warm")).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

describe("cache route access", () => {
  it.each([
    ["reading the inventory", () => GET(request())],
    ["purging", () => POST(request({ tags: ["bse"] }))],
    ["asking the advisor", () => ADVICE(request())],
  ])("refuses %s without an admin session", async (_label, call) => {
    await fs.writeFile(usersPath, JSON.stringify([regular], null, 2), "utf8");

    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Admin access required." });
  });

  it("refuses a caller with no session at all", async () => {
    expect((await GET(request(undefined, null))).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/cache", () => {
  it("reports every registered feed, held or not", async () => {
    const read = revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], load: async () => ({ rows: 3 }) });
    await read();
    revalidating({ key: "nse:most-traded", ttlMs: 60_000, tags: ["nse"], load: async () => 1 });

    const payload = await (await GET(request())).json();

    expect(payload.entries.map((row: { key: string }) => row.key)).toEqual(["bse:tape", "nse:most-traded"]);
    expect(payload.totals).toMatchObject({ feeds: 2, held: 1 });
    expect(payload.families.find((family: { tag: string }) => family.tag === "bse").held).toBe(1);
  });

  /** The figures describe one process. Implying otherwise would be the more dangerous half-truth. */
  it("says the figures are only this instance's", async () => {
    const payload = await (await GET(request())).json();
    expect(payload.note).toMatch(/the instance that answered this request/);
  });

  it("is never cached itself", async () => {
    expect((await GET(request())).headers.get("Cache-Control")).toBe("no-store");
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/admin/cache", () => {
  it("drops both layers for every family when none are named", async () => {
    const read = revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], load: async () => 1 });
    await read();

    const payload = await (await POST(request({}))).json();

    expect(payload.revalidated).toEqual(["bse", "nse", "ai", "news", "quotes"]);
    expect(revalidateTag).toHaveBeenCalledWith("bse", { expire: 0 });
    expect(cacheInventory()[0].state).toBe("empty");
  });

  it("drops only the family it was asked for", async () => {
    const bse = revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], load: async () => 1 });
    const nse = revalidating({ key: "nse:most-traded", ttlMs: 60_000, tags: ["nse"], load: async () => 1 });
    await bse();
    await nse();

    await POST(request({ tags: ["bse"] }));

    const byKey = Object.fromEntries(cacheInventory().map((row) => [row.key, row.state]));
    expect(byKey).toEqual({ "bse:tape": "empty", "nse:most-traded": "fresh" });
  });

  /**
   * The mistake this guards against is expensive: a request to drop one feed falling through to the
   * tag default would empty all five families, which is the opposite of what was asked.
   */
  it("drops the named feed and nothing else", async () => {
    const bse = revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], load: async () => 1 });
    const universe = revalidating({ key: "bse:universe", ttlMs: 60_000, tags: ["bse"], load: async () => 1 });
    await bse();
    await universe();

    const payload = await (await POST(request({ keys: ["bse:tape"] }))).json();

    expect(payload).toMatchObject({ revalidated: [], purgedKeys: ["bse:tape"], alsoRevalidated: [] });
    expect(revalidateTag).not.toHaveBeenCalled();

    const byKey = Object.fromEntries(cacheInventory().map((row) => [row.key, row.state]));
    expect(byKey).toEqual({ "bse:tape": "empty", "bse:universe": "fresh" });
  });

  /**
   * A persisted feed has a second copy in the Data Cache, and there is no key-level handle on it.
   * Leaving it would let the very next read answer from the layer the operator believes they
   * cleared, so the family goes too — and the response names it rather than doing that quietly.
   */
  it("revalidates a persisted feed's families and reports having had to", async () => {
    const read = revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], persist: true, load: async () => 1 });
    await read();

    const payload = await (await POST(request({ keys: ["bse:tape"] }))).json();

    expect(payload.alsoRevalidated).toEqual(["bse"]);
    expect(revalidateTag).toHaveBeenCalledWith("bse", { expire: 0 });
  });

  it("reports a named key that was already holding nothing", async () => {
    revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], load: async () => 1 });

    expect((await (await POST(request({ keys: ["bse:tape"] }))).json()).purgedKeys).toEqual([]);
  });

  /** Warming is what keeps the refill cost on the operator rather than the next visitor. */
  it("refills the feeds it was asked to warm, after the drop", async () => {
    const load = jest.fn().mockResolvedValue({ rows: 1 });
    const read = revalidating({ key: "bse:tape", ttlMs: 60_000, tags: ["bse"], load });
    await read();

    const payload = await (await POST(request({ tags: ["bse"], warm: ["bse:tape"] }))).json();

    expect(payload.warmed).toEqual([{ key: "bse:tape", ok: true }]);
    expect(cacheInventory()[0].state).toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("answers with the failure rather than a 500 when a feed will not reload", async () => {
    revalidating({
      key: "bse:tape",
      ttlMs: 60_000,
      tags: ["bse"],
      load: async () => {
        throw new Error("upstream refused");
      },
    });

    const payload = await (await POST(request({ tags: ["bse"], warm: ["bse:tape"] }))).json();
    expect(payload.warmed).toEqual([{ key: "bse:tape", ok: false, error: "upstream refused" }]);
  });

  it("treats a body it cannot read as a request to clear everything", async () => {
    const payload = await (await POST(request("{not json"))).json();
    expect(payload.revalidated).toEqual(["bse", "nse", "ai", "news", "quotes"]);
  });
});

// ---------------------------------------------------------------------------
// The advisor
// ---------------------------------------------------------------------------

describe("GET /api/admin/cache/advice", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("composes the advice from the figures when there is no model", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const read = revalidating({ key: "bse:tape", ttlMs: 1, maxStaleMs: 2, tags: ["bse"], load: async () => 1 });
    await read();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const payload = await (await ADVICE(request())).json();

    expect(payload.source).toBe("heuristic");
    expect(payload.purge).toEqual(["bse"]);
    expect(payload.headline).toMatch(/purge BSE data/);
  });

  /** The model phrases the decision. It never gets to change which families are in it. */
  it("lets the model phrase a decision it cannot alter", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const read = revalidating({ key: "bse:tape", ttlMs: 1, maxStaleMs: 2, tags: ["bse"], load: async () => 1 });
    await read();
    await new Promise((resolve) => setTimeout(resolve, 10));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "HEADLINE: The tape has gone cold.\n- Drop it and warm it back." } }],
      }),
    }) as unknown as typeof fetch;

    const payload = await (await ADVICE(request())).json();

    expect(payload).toMatchObject({
      source: "ai",
      headline: "The tape has gone cold.",
      points: ["Drop it and warm it back."],
      purge: ["bse"],
    });
  });

  it("falls back to the composed wording when the model refuses", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }) as unknown as typeof fetch;

    const payload = await (await ADVICE(request())).json();
    expect(payload.source).toBe("heuristic");
  });

  it("falls back when the model cannot be reached at all", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    expect((await (await ADVICE(request())).json()).source).toBe("heuristic");
  });

  it("falls back when the model answers with something unusable", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 42 } }] }),
    }) as unknown as typeof fetch;

    expect((await (await ADVICE(request())).json()).source).toBe("heuristic");
  });

  /** A reply with points but no headline keeps the composed one rather than showing a blank. */
  it("keeps the composed headline when the model drops its prefix", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "- Just a point." } }] }),
    }) as unknown as typeof fetch;

    const payload = await (await ADVICE(request())).json();
    expect(payload.headline).toMatch(/Nothing cached in this instance yet/);
    expect(payload.points).toEqual(["Just a point."]);
  });

  it("is never cached itself", async () => {
    delete process.env.OPENROUTER_API_KEY;
    expect((await ADVICE(request())).headers.get("Cache-Control")).toBe("no-store");
  });
});
