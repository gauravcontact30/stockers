import "server-only";

// The daily JSON caches under app/data, read and rewritten at request time.
//
// Each of them is the same shape of thing: an expensive answer â€” a hundred and fifty price
// histories, a batch of model calls â€” computed once per IST day and kept so the next reader does
// not pay for it again. The committed copy in the repository is the seed, which is what makes a
// fresh clone useful before anything has been fetched.
//
// ---------------------------------------------------------------------------
// Why this module exists
// ---------------------------------------------------------------------------
//
// Writing the refreshed cache back over the committed file works locally and cannot work on a
// serverless host: everything outside the temporary directory is read-only there, so `writeFile`
// raises EROFS. Each cache module used to let that reject travel, which meant a route that had
// already done all of its work â€” the returns were fetched, the answer was in hand â€” threw on the
// last line and answered 500. Saving the answer had become a precondition for giving it out.
//
// So: a failed save is not a failed request, and the writable temporary directory is used as the
// runtime home for these files. A warm instance still reads its own refreshed copy, a cold one
// falls back to the committed seed, and a host that permits neither write still serves every
// request â€” it just recomputes more often.
//
// ---------------------------------------------------------------------------
// Why the temporary directory alone was not enough
// ---------------------------------------------------------------------------
//
// The temporary directory belongs to one instance. Two serverless instances of the same
// deployment do not share it, so a cache written by one is invisible to every other one, and an
// answer computed once per day was in practice computed once per day *per container*.
//
// For most of these files that is only wasted work. For the 8:50 AM AI lock it was the bug: the
// scheduled invocation locked the day's picks into a container that was then torn down, and the
// instance rendering the landing page went on reading the copy committed to the repository. The
// list "generated at 8:50" existed and nobody could see it, so the page generated its own later
// in the morning instead - after the 9:15 open, from a different code path, with different stocks.
//
// So when Supabase is configured there is a row per cache file in `data_cache`, which every
// instance of the deployment can see, and that is consulted before either local copy. It is a
// cache and not the record: a Supabase that is down or has no such table costs a slower request,
// never a failed one, and a deployment without credentials behaves exactly as it did before. A
// project that has not applied `supabase/migrations/0007-data-cache.sql` says so once, in a 404,
// and this layer then stands down for the life of the process rather than asking again per read.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isMissingTable, supabaseConfigured, supabaseRequest } from "./supabase";

/** The committed copy: the seed a checkout ships with, and where a writable host keeps them. */
const BUNDLED_DIR = path.join(process.cwd(), "app", "data");

/**
 * Where refreshed copies go when the application directory refuses them.
 *
 * Namespaced, because the temporary directory is shared with everything else on the machine.
 * Overridable for a deployment that mounts real storage somewhere.
 */
const RUNTIME_DIR = process.env.STOCKERS_CACHE_DIR?.trim() || path.join(os.tmpdir(), "stockers-cache");

/**
 * Whether the application directory has already refused a write.
 *
 * Latched per process rather than probed per call: the answer is a property of the filesystem and
 * does not change while the process lives, and re-learning it on every save would mean an EROFS
 * on every single cache refresh.
 */
let appDirIsReadOnly = false;

function canWriteBundledCache(): boolean {
  return process.env.STOCKERS_ALLOW_BUNDLED_CACHE_WRITES === "true";
}

/** The errors a read-only or permission-denied filesystem raises, as opposed to a real fault. */
function isNotWritable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

export function bundledCachePath(fileName: string): string {
  return path.join(BUNDLED_DIR, fileName);
}

/** The shared table, or null when this deployment has no Supabase to share through. */
const SHARED_TABLE = "data_cache";

type SharedRow = { key: string; value: unknown };

/**
 * Whether the shared table has already reported that it does not exist.
 *
 * Latched for the same reason `appDirIsReadOnly` is: an unapplied migration is a property of the
 * project, not of one request, and re-learning it costs a Supabase round trip on *every single*
 * cache read. Measured against a project without the table, that was ~260ms added to each of the
 * dozen or so caches a page reads — an unapplied migration made the whole site slower, which is
 * the opposite of what a shared cache is for. One 404 and this layer stands down for the life of
 * the process; applying the migration and redeploying is what brings it back.
 */
let sharedTableIsMissing = false;

function sharedUnavailable(): boolean {
  return sharedTableIsMissing || !supabaseConfigured();
}

/**
 * The shared copy of one cache file, or null when there is no Supabase, no row, or no reaching it.
 *
 * Every failure is the same answer — null — because this is a cache in front of a cache. A project
 * that has not applied `supabase/migrations/0007-data-cache.sql` gets a 404 from PostgREST on
 * every call and still serves every page, from the local copies, exactly as before.
 */
async function readShared<T>(fileName: string): Promise<T | null> {
  if (sharedUnavailable()) return null;

  try {
    const rows = await supabaseRequest<SharedRow>({
      method: "GET",
      path: `${SHARED_TABLE}?key=eq.${encodeURIComponent(fileName)}&select=value&limit=1`,
    });
    return (rows[0]?.value as T) ?? null;
  } catch (error) {
    if (isMissingTable(error)) sharedTableIsMissing = true;
    return null;
  }
}

/** Saves one cache file to the shared table. Reports whether it landed; never throws. */
async function writeShared(fileName: string, value: unknown): Promise<boolean> {
  if (sharedUnavailable()) return false;

  try {
    // An upsert rather than read-then-write: two instances refreshing the same cache in the same
    // second is ordinary here, and Postgres deciding the winner is the only version of that with
    // no gap between the two statements.
    await supabaseRequest({
      method: "POST",
      path: `${SHARED_TABLE}?on_conflict=key`,
      body: { key: fileName, value, updated_at: new Date().toISOString() },
      merge: true,
    });
    return true;
  } catch (error) {
    if (isMissingTable(error)) sharedTableIsMissing = true;
    return false;
  }
}

async function readJsonAt<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    // Absent, or half-written by a process that died mid-save. Either way there is no cache here,
    // which is a state every caller already handles by recomputing.
    return null;
  }
}

/**
 * The freshest copy of one cache file, or null when there is none to be had.
 *
 * Shared, then runtime, then committed seed: each layer is at least as new as the one below it.
 * The runtime copy only exists because this instance wrote it, so it beats the seed; the shared
 * row could have been written by any instance, so it beats both.
 */
export async function readJsonCache<T>(fileName: string): Promise<T | null> {
  // Shared first: it is the only copy that a *different* instance of this deployment could have
  // written, which is what makes a scheduled job's work visible to the pages.
  return (
    (await readShared<T>(fileName)) ??
    (await readJsonAt<T>(path.join(RUNTIME_DIR, fileName))) ??
    (await readJsonAt<T>(bundledCachePath(fileName)))
  );
}

/**
 * Saves one cache file, reporting where it landed. Never throws.
 *
 * The shared row is written whenever there is a Supabase to write it to, because that is the copy
 * other instances can read; the local write happens either way, so a warm instance still answers
 * from disk without a round trip and a deployment with no credentials is unaffected.
 *
 * The application directory is only written when explicitly opted in. Generated market snapshots
 * are runtime data, not source files, so ordinary development and test runs keep them out of the
 * repository and write the local copy to the runtime cache instead.
 */
export async function writeJsonCache(
  fileName: string,
  value: unknown,
): Promise<"shared" | "bundled" | "runtime" | "none"> {
  const contents = JSON.stringify(value, null, 2);
  const shared = await writeShared(fileName, value);

  if (!appDirIsReadOnly && canWriteBundledCache()) {
    try {
      await fs.mkdir(BUNDLED_DIR, { recursive: true });
      await fs.writeFile(bundledCachePath(fileName), contents, "utf8");
      return "bundled";
    } catch (error) {
      if (!isNotWritable(error)) return shared ? "shared" : "none";
      appDirIsReadOnly = true;
    }
  }

  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(path.join(RUNTIME_DIR, fileName), contents, "utf8");
    return "runtime";
  } catch {
    // Nowhere local to keep it. Still durable if the shared row took it; otherwise the answer is
    // still an answer â€” the caller returns it and the next reader recomputes.
    return shared ? "shared" : "none";
  }
}

/** Test seam: forget that the application directory refused a write, and that the table was absent. */
export function resetCacheWritability(): void {
  appDirIsReadOnly = false;
  sharedTableIsMissing = false;
}
