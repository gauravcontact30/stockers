import {
  bookmarkId,
  bookmarksSnapshot,
  clearBookmarks,
  parseBookmarks,
  rankBookmarks,
  recordAsk,
  removeBookmark,
  resetBookmarkCache,
  serverBookmarks,
  subscribeBookmarks,
  toggleBookmark,
  type IntelBookmark,
} from "../../app/components/intel-bookmarks";

const FILTERS = { topic: "all", window: "1w", sort: "relevance" };

function saved(overrides: Partial<IntelBookmark> = {}): IntelBookmark {
  return {
    id: "tatamotors|all|1w|relevance",
    query: "TATAMOTORS",
    ...FILTERS,
    savedAt: "2026-08-01T00:00:00.000Z",
    uses: 1,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetBookmarkCache();
});

describe("bookmarkId", () => {
  it("is the question and the filters it was asked under, case-folded", () => {
    expect(bookmarkId("  TataMotors  ", FILTERS)).toBe("tatamotors|all|1w|relevance");
    // The same words under a different filter are a different saved search.
    expect(bookmarkId("TATAMOTORS", { ...FILTERS, topic: "brokerage" })).not.toBe(bookmarkId("TATAMOTORS", FILTERS));
  });
});

describe("parseBookmarks", () => {
  it("reads back what was written", () => {
    expect(parseBookmarks(JSON.stringify([saved()]))).toEqual([saved()]);
  });

  it("treats anything unreadable as an empty list", () => {
    expect(parseBookmarks(null)).toEqual([]);
    expect(parseBookmarks("not json")).toEqual([]);
    expect(parseBookmarks('{"not":"an array"}')).toEqual([]);
  });

  // A row half-written by an older version of the panel must not take the whole shelf down with it.
  it("drops rows that are not bookmarks and fills in the fields that can be defaulted", () => {
    const rows = parseBookmarks(
      JSON.stringify([{ nope: true }, { ...saved(), savedAt: 5, uses: "many" }, saved({ id: "second" })]),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ uses: 0, savedAt: new Date(0).toISOString() });
  });
});

describe("rankBookmarks", () => {
  it("puts the most-asked search first, and the most recently saved ahead of an older tie", () => {
    const ranked = rankBookmarks([
      saved({ id: "a", uses: 1, savedAt: "2026-08-01T00:00:00.000Z" }),
      saved({ id: "b", uses: 9 }),
      saved({ id: "c", uses: 1, savedAt: "2026-08-05T00:00:00.000Z" }),
    ]);

    expect(ranked.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });
});

describe("the bookmark store", () => {
  it("saves a search, notifies its listeners and persists it", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeBookmarks(listener);

    const list = toggleBookmark("TATAMOTORS", FILTERS);

    expect(list).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(parseBookmarks(window.localStorage.getItem("stockers-intel-bookmarks"))).toHaveLength(1);

    // A second toggle of the same search removes it again.
    expect(toggleBookmark("TATAMOTORS", FILTERS)).toHaveLength(0);

    // Unsubscribed, the store stops talking to it.
    unsubscribe();
    toggleBookmark("TATAMOTORS", FILTERS);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("renders nothing on the server, which has no storage to read", () => {
    expect(serverBookmarks()).toEqual([]);
  });

  it("reads what a previous visit left behind", () => {
    window.localStorage.setItem("stockers-intel-bookmarks", JSON.stringify([saved()]));

    expect(bookmarksSnapshot()).toHaveLength(1);
    // The snapshot is cached, so the hook is handed the same array until something changes.
    expect(bookmarksSnapshot()).toBe(bookmarksSnapshot());
  });

  it("keeps only the most recent two dozen saved searches", () => {
    for (let index = 0; index < 30; index++) toggleBookmark(`STOCK${index}`, FILTERS);

    expect(bookmarksSnapshot()).toHaveLength(24);
  });

  it("removes one search, and then all of them", () => {
    toggleBookmark("TATAMOTORS", FILTERS);
    toggleBookmark("TCS", FILTERS);

    expect(removeBookmark(bookmarkId("TCS", FILTERS))).toHaveLength(1);
    expect(clearBookmarks()).toHaveLength(0);
  });

  it("counts a run against a saved search, and leaves every other one alone", () => {
    toggleBookmark("TATAMOTORS", FILTERS);
    toggleBookmark("TCS", FILTERS);

    const list = recordAsk("TATAMOTORS", FILTERS);
    expect(list.find((entry) => entry.query === "TATAMOTORS")?.uses).toBe(2);
    expect(list.find((entry) => entry.query === "TCS")?.uses).toBe(1);

    // A search that was never saved is not recorded at all.
    expect(recordAsk("INFY", FILTERS)).toHaveLength(2);
  });

  // Private-mode browsers throw on localStorage; the shelf still works for the visit.
  it("survives a browser that refuses storage", () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(bookmarksSnapshot()).toEqual([]);
    expect(toggleBookmark("TATAMOTORS", FILTERS)).toHaveLength(1);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
