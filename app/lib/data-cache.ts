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

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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

/** The errors a read-only or permission-denied filesystem raises, as opposed to a real fault. */
function isNotWritable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

export function bundledCachePath(fileName: string): string {
  return path.join(BUNDLED_DIR, fileName);
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
 * The runtime copy is read first: it only exists because this deployment wrote it, so it is at
 * least as new as the committed seed underneath it.
 */
export async function readJsonCache<T>(fileName: string): Promise<T | null> {
  return (await readJsonAt<T>(path.join(RUNTIME_DIR, fileName))) ?? (await readJsonAt<T>(bundledCachePath(fileName)));
}

/**
 * Saves one cache file, reporting where it landed. Never throws.
 *
 * The application directory is tried first so that local development keeps updating the committed
 * seeds exactly as it did before; only once it has refused does this fall back to the temporary
 * directory, for good.
 */
export async function writeJsonCache(fileName: string, value: unknown): Promise<"bundled" | "runtime" | "none"> {
  const contents = JSON.stringify(value, null, 2);

  if (!appDirIsReadOnly) {
    try {
      await fs.mkdir(BUNDLED_DIR, { recursive: true });
      await fs.writeFile(bundledCachePath(fileName), contents, "utf8");
      return "bundled";
    } catch (error) {
      if (!isNotWritable(error)) return "none";
      appDirIsReadOnly = true;
    }
  }

  try {
    await fs.mkdir(RUNTIME_DIR, { recursive: true });
    await fs.writeFile(path.join(RUNTIME_DIR, fileName), contents, "utf8");
    return "runtime";
  } catch {
    // Nowhere to keep it. The answer is still an answer â€” the caller returns it and the next
    // reader recomputes.
    return "none";
  }
}

/** Test seam: forget that the application directory refused a write. */
export function resetCacheWritability(): void {
  appDirIsReadOnly = false;
}
