import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CacheControl, formatAge, formatBytes, lifeFraction } from "../../app/components/cache-control";
import type { CacheAdvice } from "../../app/lib/cache-advisor";
import type { CacheFamilyReport, CacheReport } from "../../app/lib/cache-report";
import type { CacheEntryReport, CacheState, CacheTag } from "../../app/lib/cache";

jest.mock("../../app/components/subscription-provider", () => ({
  authHeaders: () => ({ Authorization: "Bearer test-token" }),
}));

type Entry = CacheEntryReport & { label: string };

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    key: "bse:tape",
    label: "BSE Bhavcopy tape",
    tags: ["bse"],
    ttlMs: 10 * 60_000,
    maxStaleMs: 80 * 60_000,
    persist: false,
    state: "fresh",
    fetchedAt: "2026-08-13T09:00:00.000Z",
    ageMs: 60_000,
    refreshing: false,
    bytes: 2048,
    ...overrides,
  };
}

function family(overrides: Partial<CacheFamilyReport> = {}): CacheFamilyReport {
  return {
    tag: "bse",
    label: "BSE data",
    description: "Scrip master, Bhavcopy tape and sector classification.",
    feeds: 2,
    held: 2,
    counts: { fresh: 2, stale: 0, expired: 0, empty: 0 },
    bytes: 4096,
    oldestAgeMs: 60_000,
    worst: "fresh",
    refreshing: false,
    ...overrides,
  };
}

function report(overrides: Partial<CacheReport & { note?: string }> = {}): CacheReport & { note?: string } {
  const entries = overrides.entries ?? [entry()];
  return {
    families: [family()],
    entries,
    totals: {
      feeds: entries.length,
      held: entries.filter((row) => row.state !== "empty").length,
      bytes: 4096,
      counts: { fresh: 1, stale: 0, expired: 0, empty: 0 },
    },
    uptimeMs: 30 * 60_000,
    checkedAt: "2026-08-13T09:01:00.000Z",
    note: "Only this instance.",
    ...overrides,
  };
}

function advice(overrides: Partial<CacheAdvice> = {}): CacheAdvice {
  return {
    headline: "Purge the BSE family.",
    points: ["The tape is past the point of being served."],
    purge: ["bse"],
    spare: [{ tag: "news", reason: "All held values are within their window." }],
    warm: ["bse:tape"],
    source: "ai",
    ...overrides,
  };
}

/** One reply, for whichever request matches. */
type Route = { ok?: boolean; body: unknown; throws?: boolean };

type Routes = { inventory?: Route; advice?: Route; post?: Route | Route[] };

const calls: { url: string; init?: RequestInit }[] = [];

/**
 * Routes by URL and method rather than by call order.
 *
 * The panel polls the inventory and re-reads it after every mutation, so a queue keyed on order
 * would be a different queue for every test and would break whenever the component gained a read.
 */
function mockFetch(routes: Routes) {
  const posts = Array.isArray(routes.post) ? [...routes.post] : routes.post ? [routes.post] : [];

  global.fetch = jest.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });

    const route =
      init?.method === "POST"
        ? (posts.length > 1 ? posts.shift() : posts[0])
        : url.includes("/advice")
          ? routes.advice
          : routes.inventory;

    if (!route || route.throws) return Promise.reject(new Error("network"));

    return Promise.resolve({
      ok: route.ok ?? true,
      status: route.ok === false ? 403 : 200,
      json: () => Promise.resolve(route.body),
    });
  }) as unknown as typeof fetch;
}

/** The body of the nth POST the panel made. */
function postBody(index = 0): Record<string, unknown> {
  const posts = calls.filter((call) => call.init?.method === "POST");
  return JSON.parse(posts[index].init!.body as string);
}

beforeEach(() => {
  calls.length = 0;
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe("formatBytes", () => {
  it("says nothing for a value that would not serialise", () => {
    expect(formatBytes(null)).toBe("—");
  });

  it("steps up a unit only once the smaller one stops reading well", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatAge", () => {
  it("has nothing to say about a feed holding nothing", () => {
    expect(formatAge(null)).toBe("—");
  });

  it("drops to the coarsest unit that still carries the point", () => {
    expect(formatAge(45_000)).toBe("45s");
    expect(formatAge(9 * 60_000)).toBe("9m");
    expect(formatAge(3 * 3_600_000 + 30 * 60_000)).toBe("3h 30m");
    expect(formatAge(50 * 3_600_000)).toBe("2d 2h");
  });
});

describe("lifeFraction", () => {
  it("is nothing for a feed holding nothing", () => {
    expect(lifeFraction({ ageMs: null, ttlMs: 60_000 })).toBe(0);
  });

  /** A zero TTL would divide by zero; a feed configured that way should read as unstarted. */
  it("is nothing for a feed with no window", () => {
    expect(lifeFraction({ ageMs: 1000, ttlMs: 0 })).toBe(0);
  });

  it("caps at a full bar rather than overflowing it", () => {
    expect(lifeFraction({ ageMs: 30_000, ttlMs: 60_000 })).toBe(0.5);
    expect(lifeFraction({ ageMs: 600_000, ttlMs: 60_000 })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Reading the inventory
// ---------------------------------------------------------------------------

describe("CacheControl inventory", () => {
  it("shows what the instance is holding, and says the figures are only its own", async () => {
    mockFetch({ inventory: { body: report() } });
    render(<CacheControl />);

    expect(await screen.findByText("Only this instance.")).toBeInTheDocument();
    expect(screen.getByText("BSE Bhavcopy tape")).toBeInTheDocument();
    expect(screen.getByText("bse:tape")).toBeInTheDocument();
    // 30 minutes of uptime, one feed registered and held.
    expect(screen.getByText("30m")).toBeInTheDocument();
    expect(screen.getByText("1 holding a value")).toBeInTheDocument();
  });

  it("falls back to its own wording when the server sends no note", async () => {
    mockFetch({ inventory: { body: report({ note: undefined }) } });
    render(<CacheControl />);

    expect(
      await screen.findByText(/These figures describe the instance that answered this request/),
    ).toBeInTheDocument();
  });

  it("reports the worst state across the families rather than an average", async () => {
    mockFetch({
      inventory: {
        body: report({
          families: [
            family({ tag: "bse", worst: "expired", counts: { fresh: 0, stale: 0, expired: 2, empty: 0 } }),
            // Second, so the reduce has to hold on to `expired` rather than be talked down to `stale`.
            family({ tag: "nse", label: "NSE boards", worst: "stale", counts: { fresh: 0, stale: 1, expired: 0, empty: 0 } }),
          ],
        }),
      },
    });
    render(<CacheControl />);

    expect(await screen.findByText("Worst: Expired")).toBeInTheDocument();
  });

  it("says so plainly when every family is within its window", async () => {
    mockFetch({ inventory: { body: report() } });
    render(<CacheControl />);

    expect(await screen.findByText("All within window")).toBeInTheDocument();
  });

  it("reports a stale family as the worst when nothing has expired", async () => {
    mockFetch({
      inventory: { body: report({ families: [family({ worst: "stale", counts: { fresh: 1, stale: 1, expired: 0, empty: 0 } })] }) },
    });
    render(<CacheControl />);

    expect(await screen.findByText("Worst: Stale")).toBeInTheDocument();
  });

  it("surfaces the server's refusal rather than a generic failure", async () => {
    mockFetch({ inventory: { ok: false, body: { error: "Admin access required." } } });
    render(<CacheControl />);

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
  });

  it("has its own wording for a refusal that came with none", async () => {
    mockFetch({ inventory: { ok: false, body: {} } });
    render(<CacheControl />);

    expect(await screen.findByText("Couldn't read the cache inventory.")).toBeInTheDocument();
  });

  it("says the endpoint is unreachable when the request never lands", async () => {
    mockFetch({ inventory: { throws: true, body: null } });
    render(<CacheControl />);

    expect(await screen.findByText("Couldn't reach the cache endpoint.")).toBeInTheDocument();
  });

  it("re-reads on demand", async () => {
    mockFetch({ inventory: { body: report() } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(calls.filter((call) => call.url === "/api/admin/cache").length).toBeGreaterThan(1));
  });
});

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

describe("CacheControl feed table", () => {
  const ROWS: Entry[] = [
    entry({ key: "bse:tape", label: "BSE Bhavcopy tape", state: "expired", ageMs: 90 * 60_000, refreshing: false, persist: false }),
    entry({ key: "bse:universe", label: "BSE scrip master", state: "stale", ageMs: 20 * 60_000, refreshing: true, persist: true, tags: ["bse"] }),
    entry({ key: "nse:most-traded", label: "Most traded", state: "fresh", ageMs: 1000, tags: ["nse"] }),
    // No tags and nothing held: the two cells that have to say "—" rather than render an empty chip.
    entry({ key: "orphan:feed", label: "Orphan feed", state: "empty", ageMs: null, bytes: null, tags: [] }),
  ];

  const REPORT = report({
    entries: ROWS,
    families: [family({ tag: "bse" }), family({ tag: "nse", label: "NSE boards" })],
  });

  it("renders every feed with its state, age, size and persistence", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);

    await screen.findByText("BSE Bhavcopy tape");
    const table = screen.getByRole("table");
    // Scoped to the table: the state filter's dropdown carries the same four words.
    expect(within(table).getByText("Expired")).toBeInTheDocument();
    expect(within(table).getByText("Persisted")).toBeInTheDocument();
    expect(within(table).getAllByText("Memory only")).toHaveLength(3);
    // The untagged, unheld row.
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("narrows to one state", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.selectOptions(screen.getByLabelText("State"), "expired");

    expect(screen.getByText("BSE Bhavcopy tape")).toBeInTheDocument();
    expect(screen.queryByText("Most traded")).not.toBeInTheDocument();
  });

  it("narrows to one family", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.selectOptions(screen.getByLabelText("Family"), "nse");

    expect(screen.getByText("Most traded")).toBeInTheDocument();
    expect(screen.queryByText("BSE Bhavcopy tape")).not.toBeInTheDocument();
  });

  it("searches by label, key and family alike", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.type(screen.getByRole("combobox", { name: "Search cached feeds" }), "scrip");

    await waitFor(() => expect(screen.queryByText("Most traded")).not.toBeInTheDocument());
    // Twice over: once in the row that survived the filter, once as the typeahead's suggestion.
    expect(within(screen.getByRole("table")).getByText("BSE scrip master")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox")).getByText("BSE scrip master")).toBeInTheDocument();
  });

  it("sorts by age so the oldest value is reachable in one click", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: /Age \/ TTL/ }));

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("BSE Bhavcopy tape")).toBeInTheDocument();
  });

  /** Every column that claims to sort has to actually sort — an inert arrow is worse than none. */
  it("sorts by each of its columns", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    for (const [header, expected] of [
      ["Feed", "Orphan feed"],
      ["Family", "Most traded"],
      ["State", "BSE scrip master"],
      ["Size", "BSE Bhavcopy tape"],
      ["Data Cache", "BSE scrip master"],
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${header}`) }));
      expect(within(screen.getAllByRole("row")[1]).getByText(expected)).toBeInTheDocument();
    }
  });

  it("will not offer to drop a feed that is already holding nothing", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("Orphan feed");

    const row = screen.getByText("Orphan feed").closest("tr")!;
    expect(within(row).getByRole("button", { name: "Drop" })).toBeDisabled();
    expect(within(row).getByRole("button", { name: "Reload" })).toBeEnabled();
  });

  it("drops one feed without touching its family", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { purgedKeys: ["bse:tape"] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    const row = screen.getByText("BSE Bhavcopy tape").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Drop" }));

    expect(await screen.findByText("Dropped bse:tape.")).toBeInTheDocument();
    expect(postBody()).toEqual({ keys: ["bse:tape"] });
  });

  it("says when the feed it was asked to drop was already empty", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { purgedKeys: [] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    const row = screen.getByText("BSE Bhavcopy tape").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Drop" }));

    expect(await screen.findByText("bse:tape was already empty.")).toBeInTheDocument();
  });

  it("reloads one feed, dropping and refilling it in the same request", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { warmed: [{ key: "bse:tape", ok: true }] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    const row = screen.getByText("BSE Bhavcopy tape").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("Reloaded bse:tape.")).toBeInTheDocument();
    expect(postBody()).toEqual({ keys: ["bse:tape"], warm: ["bse:tape"] });
  });

  it("reports why a reload failed rather than claiming it worked", async () => {
    mockFetch({
      inventory: { body: REPORT },
      post: { body: { warmed: [{ key: "bse:tape", ok: false, error: "BSE refused the request" }] } },
    });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(within(screen.getByText("BSE Bhavcopy tape").closest("tr")!).getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("bse:tape failed to reload: BSE refused the request.")).toBeInTheDocument();
  });

  /** A key with no registration comes back unmentioned, which must not read as success. */
  it("reports a reload the server had no loader for", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { warmed: [] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(within(screen.getByText("BSE Bhavcopy tape").closest("tr")!).getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("bse:tape failed to reload: no loader answered.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Purging
// ---------------------------------------------------------------------------

describe("CacheControl purging", () => {
  const FAMILIES = [family({ tag: "bse" }), family({ tag: "nse", label: "NSE boards" })];
  const ROWS: Entry[] = [
    entry({ key: "bse:tape", label: "BSE Bhavcopy tape", ttlMs: 10 * 60_000, tags: ["bse"] }),
    // Under five minutes, so warming skips it: refilling it costs nothing worth pre-paying.
    entry({ key: "nse:quick", label: "Quick feed", ttlMs: 60_000, tags: ["nse"] }),
  ];
  const REPORT = report({ families: FAMILIES, entries: ROWS });

  it("purges every family when nothing is picked", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { revalidated: ["bse", "nse"] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(await screen.findByText("Cleared bse, nse.")).toBeInTheDocument();
    expect(postBody()).toEqual({ tags: ["bse", "nse"] });
  });

  it("purges only what was picked", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { revalidated: ["bse"] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(postBody()).toEqual({ tags: ["bse"] });
  });

  it("lets a picked family be unpicked again", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { revalidated: ["bse", "nse"] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    const box = screen.getAllByRole("checkbox")[0];
    await userEvent.click(box);
    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(postBody()).toEqual({ tags: ["bse", "nse"] });
  });

  it("clears the selection on request", async () => {
    mockFetch({ inventory: { body: REPORT } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
  });

  /** The point of warming: the operator pays the refill cost, not the next visitor. */
  it("warms the slow feeds of the families it just purged", async () => {
    mockFetch({
      inventory: { body: REPORT },
      post: { body: { revalidated: ["bse", "nse"], warmed: [{ key: "bse:tape", ok: true }] } },
    });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge and warm" }));

    expect(await screen.findByText("Cleared bse, nse. Warmed 1 feed.")).toBeInTheDocument();
    expect(postBody()).toEqual({ tags: ["bse", "nse"], warm: ["bse:tape"] });
  });

  it("names the feeds that would not come back", async () => {
    mockFetch({
      inventory: { body: REPORT },
      post: {
        body: {
          revalidated: ["bse", "nse"],
          warmed: [
            { key: "bse:tape", ok: true },
            { key: "bse:universe", ok: false, error: "timeout" },
          ],
        },
      },
    });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge and warm" }));

    expect(await screen.findByText(/1 failed to reload: bse:universe\./)).toBeInTheDocument();
  });

  it("reports a warm that refilled nothing", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: { revalidated: ["bse", "nse"] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge and warm" }));

    expect(await screen.findByText("Cleared bse, nse. Warmed 0 feeds.")).toBeInTheDocument();
  });

  it("does not claim to have cleared families the server never named", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { body: {} } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(await screen.findByText("Cleared all families.")).toBeInTheDocument();
  });

  it("surfaces a refused purge", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { ok: false, body: { error: "Admin access required." } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
  });

  it("has its own wording for a refusal that came with none", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { ok: false, body: {} } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(await screen.findByText("Cache purge was refused.")).toBeInTheDocument();
  });

  it("says the endpoint is unreachable when the purge never lands", async () => {
    mockFetch({ inventory: { body: REPORT }, post: { throws: true, body: null } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Purge" }));

    expect(await screen.findByText("Couldn't reach the cache endpoint.")).toBeInTheDocument();
  });

  it("shows a family's held count, weight and oldest value on its own card", async () => {
    mockFetch({
      inventory: {
        body: report({
          families: [family({ counts: { fresh: 1, stale: 2, expired: 3, empty: 0 }, worst: "expired", feeds: 6, held: 6 })],
          entries: ROWS,
        }),
      },
    });
    render(<CacheControl />);

    expect(await screen.findByText("6/6 held")).toBeInTheDocument();
    expect(screen.getByText("3 expired")).toBeInTheDocument();
    expect(screen.getByText("2 stale")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The advisor
// ---------------------------------------------------------------------------

describe("CacheControl advisor", () => {
  const REPORT = report({ families: [family({ tag: "bse" }), family({ tag: "nse", label: "NSE boards" })] });

  it("is not consulted until asked", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { body: advice() } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    expect(calls.some((call) => call.url.includes("/advice"))).toBe(false);
    expect(screen.getByText("Should anything be purged right now?")).toBeInTheDocument();
  });

  it("reads the cache and explains what it found", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { body: advice() } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText("Purge the BSE family.")).toBeInTheDocument();
    expect(screen.getByText("The tape is past the point of being served.")).toBeInTheDocument();
    expect(screen.getByText("Written by the model")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask again" })).toBeInTheDocument();
  });

  it("says when the advice was composed rather than written", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { body: advice({ source: "heuristic" }) } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText("Composed from the figures")).toBeInTheDocument();
  });

  /** The recommendation is a selection, not a paragraph — but it still stops short of acting. */
  it("ticks the recommended families without purging anything", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { body: advice() }, post: { body: { revalidated: ["bse"] } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));
    await userEvent.click(await screen.findByRole("button", { name: "Select bse" }));

    expect(calls.filter((call) => call.init?.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Purge" }));
    expect(postBody()).toEqual({ tags: ["bse"] });
  });

  it("explains what it left alone and why", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { body: advice() } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText("Why the rest were left alone")).toBeInTheDocument();
    expect(screen.getByText(/All held values are within their window/)).toBeInTheDocument();
  });

  it("recommends doing nothing when there is nothing to do", async () => {
    mockFetch({
      inventory: { body: REPORT },
      advice: { body: advice({ purge: [], spare: [], headline: "Everything is within its window." }) },
    });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText(/Nothing needs purging/)).toBeInTheDocument();
    expect(screen.queryByText("Why the rest were left alone")).not.toBeInTheDocument();
  });

  it("surfaces a refused advisor", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { ok: false, body: { error: "Admin access required." } } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText("Admin access required.")).toBeInTheDocument();
  });

  it("has its own wording for a refusal that came with none", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { ok: false, body: {} } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText("The advisor couldn't be reached.")).toBeInTheDocument();
  });

  it("says so when the advisor cannot be reached at all", async () => {
    mockFetch({ inventory: { body: REPORT }, advice: { throws: true, body: null } });
    render(<CacheControl />);
    await screen.findByText("BSE Bhavcopy tape");

    await userEvent.click(screen.getByRole("button", { name: "Ask the advisor" }));

    expect(await screen.findByText("The advisor couldn't be reached.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Types the panel is written against
// ---------------------------------------------------------------------------

describe("state and tag coverage", () => {
  it("has a chip for every state the cache can report", async () => {
    const states: CacheState[] = ["fresh", "stale", "expired", "empty"];
    const tags: CacheTag[] = ["bse", "nse", "ai", "news", "quotes"];

    mockFetch({
      inventory: {
        body: report({
          entries: states.map((state, index) =>
            entry({ key: `k${index}`, label: `Feed ${index}`, state, tags: [tags[index]], ageMs: state === "empty" ? null : 1000 }),
          ),
          families: tags.map((tag) => family({ tag, label: tag.toUpperCase() })),
        }),
      },
    });
    render(<CacheControl />);

    await screen.findByText("Feed 0");
    for (const label of ["Fresh", "Stale", "Expired", "Empty"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });
});
