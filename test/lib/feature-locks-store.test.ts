/** @jest-environment node */

// The admin's feature switches, in both stores.
//
// This one is worth its own suite because the JSON half could not work in production at all: a
// serverless host's application directory is read-only, so the toggle failed silently, and
// anywhere else the next deploy wiped it. These tests pin down that the Postgres half writes one
// row per change rather than the whole set, which is what stops two admins undoing each other.

import { promises as fs } from "node:fs";
import { readFeatureLocks, setFeatureLock } from "../../app/lib/subscription";

const locksPath = process.env.STOCKERS_LOCKS_FILE as string;

beforeEach(async () => {
  await fs.rm(locksPath, { force: true });
});

afterAll(async () => {
  await fs.rm(locksPath, { force: true });
});

describe("the JSON store", () => {
  it("reads nothing as nothing locked", async () => {
    expect(await readFeatureLocks()).toEqual({});
  });

  it("locks and unlocks one feature", async () => {
    expect(await setFeatureLock("intel", true)).toMatchObject({ intel: true });
    expect(await readFeatureLocks()).toMatchObject({ intel: true });

    await setFeatureLock("intel", false);
    expect((await readFeatureLocks()).intel).toBe(false);
  });

  it("ignores a key this build does not gate, and an unreadable file", async () => {
    await fs.writeFile(locksPath, JSON.stringify({ intel: true, "retired-feature": true }), "utf8");
    expect(await readFeatureLocks()).toEqual({ intel: true });

    await fs.writeFile(locksPath, "{not json", "utf8");
    expect(await readFeatureLocks()).toEqual({});

    await fs.writeFile(locksPath, JSON.stringify("nope"), "utf8");
    expect(await readFeatureLocks()).toEqual({});
  });
});

describe("the Postgres store", () => {
  const URL_BASE = "https://project-under-test.supabase.co";
  let fetchMock: jest.Mock;

  function reply(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Map(),
    } as unknown as Response;
  }

  /** Every request the store made, in order. */
  const calls = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: (init as RequestInit | undefined)?.method ?? "GET",
      prefer: ((init as RequestInit | undefined)?.headers as Record<string, string> | undefined)?.Prefer,
      body: (init as RequestInit | undefined)?.body ? JSON.parse((init as RequestInit).body as string) : null,
    }));

  beforeEach(() => {
    process.env.SUPABASE_URL = URL_BASE;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-under-test";
    fetchMock = jest.fn(async () => reply([]));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("reads the locked features, ignoring a key this build does not gate", async () => {
    fetchMock.mockResolvedValue(
      reply([
        { feature: "intel", locked: true },
        { feature: "retired-feature", locked: true },
        { feature: "research", locked: false },
      ]),
    );

    // A row explicitly marked unlocked is not a lock, and an unknown key is dropped.
    expect(await readFeatureLocks()).toEqual({ intel: true });
  });

  it("writes one row per change rather than the whole set", async () => {
    await setFeatureLock("intel", true);

    const insert = calls().find((call) => call.method === "POST");
    expect(insert?.url).toContain("feature_locks?on_conflict=feature");
    expect(insert?.prefer).toContain("resolution=merge-duplicates");
    expect(insert?.body).toMatchObject({ feature: "intel", locked: true });
  });

  it("removes the row when a feature is unlocked, rather than storing a false", async () => {
    await setFeatureLock("intel", false);

    const remove = calls().find((call) => call.method === "DELETE");
    expect(remove?.url).toContain("feature_locks?feature=eq.intel");
    expect(calls().some((call) => call.method === "POST")).toBe(false);
  });

  it("reads as 'nothing locked' when the store cannot be reached", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(reply({ message: "boom" }, 503));

    // The alternative — throwing — would take every AI surface off the site over a database blip,
    // which is a far worse outcome than a lock that takes a moment longer to apply.
    expect(await readFeatureLocks()).toEqual({});
    expect(error).toHaveBeenCalled();
  });
});
