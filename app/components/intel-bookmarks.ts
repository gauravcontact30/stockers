// Saved searches for the intelligence panel.
//
// A reader who follows six companies asks the same six questions every morning. Retyping them is
// the whole friction of the feature, so a search can be starred and comes back as a chip.
//
// Two decisions worth stating. The list lives in the browser, not the account: a bookmark is a
// convenience, and putting it on the server would mean a write on every search for something that
// is worth exactly one localStorage line. And the list is ranked by how often each saved search is
// actually run, not by when it was saved — after a fortnight the three a reader really lives on
// have risen to the front on their own, without anyone having to curate anything.

export type BookmarkFilters = { topic: string; window: string; sort: string };

export type IntelBookmark = BookmarkFilters & {
  /** Identity: the same question under the same filters is one bookmark, not two. */
  id: string;
  query: string;
  savedAt: string;
  /** How many times this exact search has been run since it was saved. */
  uses: number;
};

const STORAGE_KEY = "stockers-intel-bookmarks";

// Enough to hold every company a private investor follows; past that the panel stops being a
// shortcut and becomes a second list to scroll.
const MAX_BOOKMARKS = 24;

/** A saved search's identity — the question and the filters it was asked under. */
export function bookmarkId(query: string, filters: BookmarkFilters): string {
  return `${query.trim().toLowerCase()}|${filters.topic}|${filters.window}|${filters.sort}`;
}

function isBookmark(value: unknown): value is IntelBookmark {
  const row = value as Partial<IntelBookmark> | null;
  return (
    typeof row?.id === "string" &&
    typeof row.query === "string" &&
    typeof row.topic === "string" &&
    typeof row.window === "string" &&
    typeof row.sort === "string"
  );
}

/** Most-asked first, then most recently saved — the order the panel shows them in. */
export function rankBookmarks(list: IntelBookmark[]): IntelBookmark[] {
  return [...list].sort((a, b) => b.uses - a.uses || b.savedAt.localeCompare(a.savedAt));
}

/**
 * Whatever is in storage, cleaned up.
 *
 * Anything unreadable is treated as an empty list rather than thrown: a corrupted line should cost
 * a reader their shortcuts, not the panel they sit in.
 */
export function parseBookmarks(raw: string | null): IntelBookmark[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isBookmark).map((row) => ({
      id: row.id,
      query: row.query,
      topic: row.topic,
      window: row.window,
      sort: row.sort,
      savedAt: typeof row.savedAt === "string" ? row.savedAt : new Date(0).toISOString(),
      uses: typeof row.uses === "number" && Number.isFinite(row.uses) ? row.uses : 0,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------
// Read through useSyncExternalStore rather than during render: the server has no localStorage and
// would disagree with the first client render otherwise. The snapshot is cached so the hook is
// handed the same array until something actually changes.

const listeners = new Set<() => void>();
const EMPTY: IntelBookmark[] = [];
let snapshot: IntelBookmark[] | null = null;

export function subscribeBookmarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function bookmarksSnapshot(): IntelBookmark[] {
  if (snapshot) return snapshot;

  try {
    snapshot = rankBookmarks(parseBookmarks(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    // Private-mode browsers throw on access; no readable list is an empty one.
    snapshot = EMPTY;
  }

  return snapshot;
}

/**
 * What the server renders: nothing.
 *
 * It has no storage to read, and useSyncExternalStore needs the two to agree — so the shelf is
 * empty in the server's HTML and fills in the moment the browser takes over.
 */
export const serverBookmarks = (): IntelBookmark[] => EMPTY;

function commit(list: IntelBookmark[]): IntelBookmark[] {
  const ranked = rankBookmarks(list).slice(0, MAX_BOOKMARKS);
  snapshot = ranked;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ranked));
  } catch {
    // Storage is full or blocked. The list still works for this visit, it just won't survive it.
  }

  listeners.forEach((listener) => listener());
  return ranked;
}

/** Saves a search, or removes it if it was already saved. Returns the new list. */
export function toggleBookmark(query: string, filters: BookmarkFilters): IntelBookmark[] {
  const id = bookmarkId(query, filters);
  const current = bookmarksSnapshot();

  if (current.some((entry) => entry.id === id)) {
    return commit(current.filter((entry) => entry.id !== id));
  }

  return commit([
    ...current,
    { id, query: query.trim(), ...filters, savedAt: new Date().toISOString(), uses: 1 },
  ]);
}

export function removeBookmark(id: string): IntelBookmark[] {
  return commit(bookmarksSnapshot().filter((entry) => entry.id !== id));
}

export function clearBookmarks(): IntelBookmark[] {
  return commit([]);
}

/**
 * Counts one run of a search against its bookmark, when it has one.
 *
 * An unsaved search is not recorded at all: the panel is a list of things the reader chose to
 * keep, so silently filling it with everything they ever typed would make it useless.
 */
export function recordAsk(query: string, filters: BookmarkFilters): IntelBookmark[] {
  const id = bookmarkId(query, filters);
  const current = bookmarksSnapshot();
  if (!current.some((entry) => entry.id === id)) return current;

  return commit(current.map((entry) => (entry.id === id ? { ...entry, uses: entry.uses + 1 } : entry)));
}

/** Test seam: drops the cached snapshot so the next read goes back to storage. */
export function resetBookmarkCache(): void {
  snapshot = null;
}
