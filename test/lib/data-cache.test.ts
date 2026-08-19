import os from "node:os";
import path from "node:path";

/**
 * An in-memory filesystem, with a switch for making one directory refuse writes.
 *
 * The whole point of the module under test is what it does when a write is impossible — which is
 * exactly the condition a serverless host presents and a developer's machine never does.
 */
const files = new Map<string, string>();
let refuseWritesUnder: { prefix: string; code: string } | null = null;

function enoent(filePath: string) {
  const error = new Error(`ENOENT: no such file, open '${filePath}'`) as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
}

function guardWrite(target: string) {
  if (refuseWritesUnder && target.startsWith(refuseWritesUnder.prefix)) {
    const error = new Error(`${refuseWritesUnder.code}: not writable, '${target}'`) as NodeJS.ErrnoException;
    error.code = refuseWritesUnder.code;
    throw error;
  }
}

jest.mock("node:fs", () => ({
  promises: {
    readFile: async (filePath: string) => {
      const stored = files.get(filePath);
      if (stored === undefined) throw enoent(filePath);
      return stored;
    },
    writeFile: async (filePath: string, contents: string) => {
      guardWrite(filePath);
      files.set(filePath, contents);
    },
    mkdir: async (dir: string) => {
      guardWrite(dir);
    },
  },
}));

/**
 * The shared table, as a map.
 *
 * `supabaseConfigured` is what decides whether the shared layer is reached at all, so a test that
 * wants the file-only behaviour simply leaves it false — which is also every deployment that has
 * no Supabase credentials, and the whole existing suite below.
 */
const sharedRows = new Map<string, unknown>();
let supabaseIsConfigured = false;
let supabaseFails = false;
/** Set when the project has not applied the migration: PostgREST answers 404 to every call. */
let tableIsMissing = false;
let sharedCalls = 0;

class FakeMissingTable extends Error {}

jest.mock("../../app/lib/supabase", () => ({
  supabaseConfigured: () => supabaseIsConfigured,
  isMissingTable: (error: unknown) => error instanceof FakeMissingTable,
  supabaseRequest: async ({ method, path, body }: { method: string; path: string; body?: { key: string; value: unknown } }) => {
    sharedCalls += 1;
    if (tableIsMissing) throw new FakeMissingTable("relation does not exist");
    if (supabaseFails) throw new Error("PostgREST said no");
    if (method === "GET") {
      const key = decodeURIComponent(/key=eq\.([^&]+)/.exec(path)?.[1] ?? "");
      return sharedRows.has(key) ? [{ key, value: sharedRows.get(key) }] : [];
    }
    sharedRows.set(body!.key, body!.value);
    return [];
  },
}));

import { bundledCachePath, readJsonCache, resetCacheWritability, writeJsonCache } from "../../app/lib/data-cache";

const BUNDLED_DIR = path.join(process.cwd(), "app", "data");
const RUNTIME_DIR = path.join(os.tmpdir(), "stockers-cache");
const runtimePath = (name: string) => path.join(RUNTIME_DIR, name);

beforeEach(() => {
  files.clear();
  sharedRows.clear();
  supabaseIsConfigured = false;
  supabaseFails = false;
  tableIsMissing = false;
  sharedCalls = 0;
  refuseWritesUnder = null;
  resetCacheWritability();
});

describe("readJsonCache", () => {
  it("reads the committed seed when that is all there is", async () => {
    files.set(bundledCachePath("one-year-returns.json"), JSON.stringify({ date: "2026-08-11" }));
    await expect(readJsonCache("one-year-returns.json")).resolves.toEqual({ date: "2026-08-11" });
  });

  // The runtime copy only exists because this deployment wrote it, so it is never older.
  it("prefers a runtime copy over the seed underneath it", async () => {
    files.set(bundledCachePath("top-picks.json"), JSON.stringify({ date: "2026-08-01" }));
    files.set(runtimePath("top-picks.json"), JSON.stringify({ date: "2026-08-12" }));
    await expect(readJsonCache("top-picks.json")).resolves.toEqual({ date: "2026-08-12" });
  });

  it("reports no cache rather than throwing when there is none", async () => {
    await expect(readJsonCache("missing.json")).resolves.toBeNull();
  });

  it("treats a half-written file as no cache at all", async () => {
    files.set(bundledCachePath("broken.json"), "{ not json");
    await expect(readJsonCache("broken.json")).resolves.toBeNull();
  });
});

describe("writeJsonCache", () => {
  it("writes to the application directory when it is writable", async () => {
    await expect(writeJsonCache("buy-tomorrow.json", { date: "2026-08-12" })).resolves.toBe("bundled");
    expect(files.get(bundledCachePath("buy-tomorrow.json"))).toContain("2026-08-12");
  });

  // The bug this module exists for: EROFS on a serverless host took whole routes down with it.
  it.each(["EROFS", "EACCES", "EPERM"])("falls back to the temporary directory on %s", async (code) => {
    refuseWritesUnder = { prefix: BUNDLED_DIR, code };

    await expect(writeJsonCache("top-picks.json", { date: "2026-08-12" })).resolves.toBe("runtime");
    expect(files.get(runtimePath("top-picks.json"))).toContain("2026-08-12");
    await expect(readJsonCache("top-picks.json")).resolves.toEqual({ date: "2026-08-12" });
  });

  it("stops trying the application directory once it has refused", async () => {
    refuseWritesUnder = { prefix: BUNDLED_DIR, code: "EROFS" };
    await writeJsonCache("a.json", { n: 1 });

    // The filesystem is writable again, and it makes no difference: the answer is latched, so a
    // refresh cannot cost an EROFS on every single save for the life of the process.
    refuseWritesUnder = null;
    await expect(writeJsonCache("b.json", { n: 2 })).resolves.toBe("runtime");
    expect(files.has(bundledCachePath("b.json"))).toBe(false);
  });

  it("gives up quietly when nowhere is writable", async () => {
    refuseWritesUnder = { prefix: "", code: "EROFS" };
    await expect(writeJsonCache("nowhere.json", { n: 1 })).resolves.toBe("none");
  });

  // A disk that is full, or a path that is a directory, is a fault rather than a read-only host —
  // there is nothing to fall back to, and it must still not reach the caller.
  it("gives up quietly on a failure that is not a permission one", async () => {
    refuseWritesUnder = { prefix: BUNDLED_DIR, code: "ENOSPC" };
    await expect(writeJsonCache("full.json", { n: 1 })).resolves.toBe("none");
    expect(files.has(runtimePath("full.json"))).toBe(false);
  });
});

/**
 * One instance's temporary directory is not another's, which is the bug behind the 8:50 AM lock:
 * the scheduled invocation locked the day's picks into a container that was then torn down, and
 * the instance rendering the landing page went on reading the copy committed to the repository.
 */
describe("the shared layer", () => {
  it("lets one instance read what another instance wrote", async () => {
    supabaseIsConfigured = true;
    await writeJsonCache("bse-ai-locked-picks.json", { date: "2026-08-19" });

    // A second instance: nothing of its own on disk, only the committed seed underneath.
    files.clear();
    files.set(bundledCachePath("bse-ai-locked-picks.json"), JSON.stringify({ date: "2026-08-11" }));

    await expect(readJsonCache("bse-ai-locked-picks.json")).resolves.toEqual({ date: "2026-08-19" });
  });

  it("stays out of the way when there is no Supabase to share through", async () => {
    await writeJsonCache("top-picks.json", { date: "2026-08-19" });
    expect(sharedRows.size).toBe(0);
  });

  it("is still durable when nowhere local will take the write", async () => {
    supabaseIsConfigured = true;
    refuseWritesUnder = { prefix: "", code: "EROFS" };
    await expect(writeJsonCache("nowhere.json", { n: 1 })).resolves.toBe("shared");
  });

  /**
   * An unapplied migration must not make the whole site slower.
   *
   * Every cache read would otherwise pay a Supabase round trip to be told the table is not there —
   * measured at ~260ms each, on a dozen caches per page.
   */
  it("stands down for good the first time the table reports it is missing", async () => {
    supabaseIsConfigured = true;
    tableIsMissing = true;

    await readJsonCache("top-picks.json");
    expect(sharedCalls).toBe(1);

    await readJsonCache("top-picks.json");
    await writeJsonCache("top-picks.json", { date: "2026-08-19" });
    await readJsonCache("buy-tomorrow.json");
    expect(sharedCalls).toBe(1);
  });

  it("stands down on a missing table reported by a write, too", async () => {
    supabaseIsConfigured = true;
    tableIsMissing = true;

    await expect(writeJsonCache("top-picks.json", { n: 1 })).resolves.toBe("bundled");
    await readJsonCache("top-picks.json");
    expect(sharedCalls).toBe(1);
  });

  // A blip is not an unapplied migration, so the layer keeps trying.
  it("falls back to the local copies when the shared table cannot be reached", async () => {
    supabaseIsConfigured = true;
    supabaseFails = true;
    files.set(bundledCachePath("top-picks.json"), JSON.stringify({ date: "2026-08-11" }));

    await expect(writeJsonCache("top-picks.json", { date: "2026-08-19" })).resolves.toBe("bundled");
    await expect(readJsonCache("top-picks.json")).resolves.toEqual({ date: "2026-08-19" });
    expect(sharedCalls).toBeGreaterThan(1);
  });
});
