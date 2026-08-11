import {
  REST_TABS,
  briefFor,
  categoriesBoard,
  etfsBoard,
  formatCrore,
  formatNumber,
  formatPercentSigned,
  metalsBoard,
  moversBoard,
  sectorsBoard,
  type CategoriesPayload,
  type EtfPayload,
  type MoversPayload,
  type SectorsPayload,
} from "../../app/lib/rest-of-bse";

const movers: MoversPayload = {
  rows: [
    {
      code: "513097",
      ticker: "SBCL",
      name: "Shivalik Bimetal Controls Ltd",
      capTier: "Small",
      sector: "Capital Goods",
      price: 1104.3,
      changePercent: 20,
    },
    { code: "500325", ticker: null, name: "Reliance Industries", capTier: "Large", sector: null, price: 1420.5, changePercent: 3.2 },
  ],
  total: 2069,
  page: 2,
  pages: 259,
  sessionDate: "2026-08-11",
};

const sectors: SectorsPayload = {
  sectors: [
    { sector: "Metals & Mining", stocks: 120, gainers: 80, losers: 20, star: 5, red: 1 },
    { sector: "Realty", stocks: 60, gainers: 10, losers: 40, star: 0, red: 6 },
    { sector: "Data Centers", stocks: 3, gainers: 0, losers: 0, star: 0, red: 0 },
  ],
};

const categories: CategoriesPayload = {
  summary: {
    listed: 4974,
    priced: 4494,
    totalMarketCapCr: 48964232.35,
    breadth: { advancing: 2069, declining: 2249, unchanged: 176, traded: 4494 },
    byTier: {
      Large: { count: 100, breadth: { advancing: 54, declining: 43, unchanged: 3, traded: 100 }, averageChangePercent: 0.2288 },
      Mid: { count: 150, breadth: { advancing: 70, declining: 78, unchanged: 2, traded: 150 }, averageChangePercent: -0.016 },
      Small: { count: 4244, breadth: { advancing: 1945, declining: 2128, unchanged: 171, traded: 4244 }, averageChangePercent: null },
    },
    sessionDate: "2026-08-11",
  },
};

const etfs: EtfPayload = {
  groups: [
    {
      key: "gold",
      name: "Gold",
      description: "Funds holding physical gold.",
      etfs: [
        { symbol: "GOLDBEES", tracks: "Gold", lastPrice: 126.59, changePercent: 1.61, nav: 123.63, premiumPercent: 2.39, changePercent365d: 47.68 },
      ],
    },
    {
      key: "silver",
      name: "Silver",
      description: "Funds holding physical silver.",
      etfs: [{ symbol: "SILVERBEES", tracks: "Silver", lastPrice: 98.2, changePercent: -0.8, nav: 97.9, premiumPercent: 0.31, changePercent365d: 30.1 }],
    },
    {
      key: "nifty50",
      name: "Nifty 50",
      description: "Funds tracking the Nifty 50.",
      etfs: Array.from({ length: 9 }, (_, index) => ({
        symbol: `N50-${index}`,
        tracks: "Nifty 50",
        lastPrice: 100 + index,
        changePercent: 0.5,
        nav: null,
        premiumPercent: null,
        changePercent365d: null,
      })),
    },
    { key: "debt", name: "Debt & Liquid", description: "Cash parking.", etfs: [] },
  ],
  fetchedAt: "2026-08-11T04:00:00.000Z",
};

describe("formatters", () => {
  it("signs a percentage in both directions and handles a missing one", () => {
    expect(formatPercentSigned(1.5)).toBe("+1.50%");
    expect(formatPercentSigned(-1.5)).toBe("-1.50%");
    expect(formatPercentSigned(0)).toBe("+0.00%");
    expect(formatPercentSigned(null)).toBe("—");
    expect(formatPercentSigned(Number.NaN)).toBe("—");
  });

  it("groups numbers the Indian way, without a currency symbol", () => {
    expect(formatNumber(1104.3)).toBe("1,104.30");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("reads market capitalisation in crores and lakh crores", () => {
    expect(formatCrore(6361)).toBe("₹6,361 cr");
    expect(formatCrore(4896423)).toBe("₹48.96 lakh cr");
    expect(formatCrore(null)).toBe("—");
    expect(formatCrore(Number.NaN)).toBe("—");
  });
});

describe("moversBoard", () => {
  it("turns a page of movers into rows carrying ticker, sector and cap tier", () => {
    const board = moversBoard(movers, "gainers");
    const [first, second] = board.groups[0].rows;

    expect(first.title).toBe("SBCL");
    expect(first.subtitle).toBe("Shivalik Bimetal Controls Ltd");
    expect(first.value).toBe("1,104.30");
    expect(first.changePercent).toBe(20);
    expect(first.pills).toEqual(["Small cap", "Capital Goods"]);

    // No ticker and no sector: the name stands in and the empty pill is dropped, not rendered blank.
    expect(second.title).toBe("Reliance Industries");
    expect(second.symbol).toBeUndefined();
    expect(second.pills).toEqual(["Large cap"]);
  });

  it("reports the whole exchange behind the page, not just the rows shown", () => {
    const board = moversBoard(movers, "gainers");
    expect(board.stats).toContainEqual({ label: "Stocks up today", value: "2,069" });
    expect(board.paging).toEqual({ page: 2, pages: 259, total: 2069 });
    expect(board.asOf).toBe("2026-08-11");
  });

  it("labels the count for the losing side", () => {
    expect(moversBoard(movers, "losers").stats[0].label).toBe("Stocks down today");
  });
});

describe("sectorsBoard", () => {
  it("ranks sectors by the share of their members that advanced", () => {
    const board = sectorsBoard(sectors);
    expect(board.groups[0].rows.map((row) => row.title)).toEqual(["Metals & Mining", "Realty", "Data Centers"]);
  });

  it("centres the tone on an even split so a majority advance reads positive", () => {
    const [metals, realty] = sectorsBoard(sectors).groups[0].rows;
    expect(metals.value).toBe("80%");
    expect(metals.changePercent).toBeCloseTo(30);
    expect(realty.changePercent).toBeCloseTo(-30);
  });

  it("says nothing rather than zero for a sector where nothing traded", () => {
    const untraded = sectorsBoard(sectors).groups[0].rows[2];
    expect(untraded.value).toBe("—");
    expect(untraded.changePercent).toBeNull();
  });

  it("names the broadest advance and decline", () => {
    const board = sectorsBoard(sectors);
    expect(board.stats).toContainEqual({ label: "Broadest advance", value: "Metals & Mining" });
    expect(board.stats).toContainEqual({ label: "Broadest decline", value: "Data Centers" });
  });

  it("survives an empty sector list", () => {
    const board = sectorsBoard({ sectors: [] });
    expect(board.groups[0].rows).toHaveLength(0);
    expect(board.stats).toContainEqual({ label: "Broadest advance", value: "—" });
    expect(board.stats).toContainEqual({ label: "Broadest decline", value: "—" });
  });

  it("carries a session date when the feed supplies one", () => {
    expect(sectorsBoard({ sectors: [], sessionDate: "2026-08-11" }).asOf).toBe("2026-08-11");
  });

  it("shows how many moved more than five percent, and omits the pill when none did", () => {
    const [metals, , quiet] = sectorsBoard(sectors).groups[0].rows;
    expect(metals.pills).toEqual(["5 up 5%+", "1 down 5%+"]);
    expect(quiet.pills).toEqual([]);
  });

  it("lets a sector open into the stocks behind it", () => {
    const [metals] = sectorsBoard(sectors).groups[0].rows;
    expect(metals.drill).toEqual({ kind: "category", value: "Metals & Mining", label: "Metals & Mining" });
  });
});

describe("categoriesBoard", () => {
  it("gives one row per SEBI cap tier with its breadth and average move", () => {
    const rows = categoriesBoard(categories).groups[0].rows;

    expect(rows.map((row) => row.title)).toEqual(["Large cap", "Mid cap", "Small cap"]);
    expect(rows[0].value).toBe("+0.23%");
    expect(rows[0].subtitle).toBe("54 up · 43 down of 100");
    expect(rows[0].pills).toEqual(["Top 100 by market capitalisation"]);
    expect(rows[1].value).toBe("-0.02%");
  });

  it("shows a dash where the exchange published no average", () => {
    expect(categoriesBoard(categories).groups[0].rows[2].value).toBe("—");
  });

  it("summarises the whole exchange above the tiers", () => {
    const board = categoriesBoard(categories);
    expect(board.stats).toContainEqual({ label: "Listed", value: "4,974" });
    expect(board.stats).toContainEqual({ label: "Priced today", value: "4,494" });
    expect(board.stats).toContainEqual({ label: "Total market cap", value: "₹489.64 lakh cr" });
    expect(board.asOf).toBe("2026-08-11");
  });

  it("lets a cap tier open into its performers and non performers", () => {
    const [large] = categoriesBoard(categories).groups[0].rows;
    expect(large.drill).toEqual({ kind: "tier", value: "large", label: "Large cap" });
  });
});

describe("etfsBoard", () => {
  it("leaves bullion out — that board is read on its own", () => {
    const names = etfsBoard(etfs).groups.map((group) => group.name);
    expect(names).not.toContain("Gold");
    expect(names).not.toContain("Silver");
    expect(names).toContain("Nifty 50");
  });

  it("drops a group the feed returned empty", () => {
    expect(etfsBoard(etfs).groups.map((group) => group.name)).not.toContain("Debt & Liquid");
  });

  it("keeps every fund in a group so the UI can paginate it", () => {
    expect(etfsBoard(etfs).groups[0].rows).toHaveLength(9);
  });

  it("counts every non-bullion fund", () => {
    expect(etfsBoard(etfs).stats).toContainEqual({ label: "Funds listed", value: "9" });
  });

  it("omits NAV and premium pills when the feed did not publish them", () => {
    expect(etfsBoard(etfs).groups[0].rows[0].pills).toEqual([]);
  });

  it("is as of the fetch, since an ETF board has no session date", () => {
    expect(etfsBoard(etfs).asOf).toBe("2026-08-11T04:00:00.000Z");
  });
});

describe("metalsBoard", () => {
  it("puts gold and silver funds and the metals industry group on one board", () => {
    const board = metalsBoard(etfs, sectors);
    expect(board.groups.map((group) => group.name)).toEqual(["Gold ETFs", "Silver ETFs", "Metals & Mining"]);
  });

  it("carries NAV, premium and the one-year move on a bullion fund", () => {
    const gold = metalsBoard(etfs, sectors).groups[0].rows[0];
    expect(gold.title).toBe("GOLDBEES");
    expect(gold.value).toBe("126.59");
    expect(gold.pills).toEqual(["NAV 123.63", "+2.39% to NAV", "1Y +47.68%"]);
  });

  it("counts the listed metal stocks alongside the bullion groups", () => {
    const board = metalsBoard(etfs, sectors);
    expect(board.stats).toContainEqual({ label: "Bullion groups", value: "2" });
    expect(board.stats).toContainEqual({ label: "Metal stocks", value: "120" });
  });

  it("drops a bullion group the feed returned empty", () => {
    const empty: EtfPayload = { ...etfs, groups: [{ key: "gold", name: "Gold", description: "", etfs: [] }] };
    expect(metalsBoard(empty, sectors).groups.map((group) => group.name)).toEqual(["Metals & Mining"]);
  });

  it("omits the industry group when the exchange lists no metals sector", () => {
    const board = metalsBoard(etfs, { sectors: [{ sector: "Realty", stocks: 1, gainers: 1, losers: 0, star: 0, red: 0 }] });
    expect(board.groups.map((group) => group.name)).toEqual(["Gold ETFs", "Silver ETFs"]);
    expect(board.stats).toContainEqual({ label: "Metal stocks", value: "—" });
  });

  it("shows a dash for a metals sector where nothing traded", () => {
    const board = metalsBoard(etfs, { sectors: [{ sector: "Metals & Mining", stocks: 5, gainers: 0, losers: 0, star: 0, red: 0 }] });
    const row = board.groups[board.groups.length - 1].rows[0];
    expect(row.value).toBe("—");
    expect(row.changePercent).toBeNull();
  });

  it("lets the metals industry row open into all its stocks", () => {
    const row = metalsBoard(etfs, sectors).groups[2].rows[0];
    expect(row.drill).toEqual({ kind: "category", value: "Metals & Mining", label: "Metals & Mining" });
  });
});

describe("briefFor", () => {
  it("describes the board from the very figures it rendered", () => {
    const board = moversBoard(movers, "gainers");
    const brief = briefFor("gainers", board);

    expect(brief.subject).toContain("Top performers");
    expect(brief.question).toBe("What does this board say about the market right now?");
    expect(brief.facts).toContainEqual({ label: "Stocks up today", value: "2,069" });
    expect(brief.highlights[0]).toBe("SBCL (Shivalik Bimetal Controls Ltd): 1,104.30, +20.00%");
  });

  it("leaves the move off a row that has none", () => {
    const brief = briefFor("sectors", sectorsBoard(sectors));
    expect(brief.highlights[2]).toBe("Data Centers (0 up · 0 down of 3): —");
  });

  it("covers every tab", () => {
    expect(REST_TABS.map((tab) => tab.key)).toEqual(["gainers", "losers", "sectors", "categories", "etfs", "metals"]);
  });
});
