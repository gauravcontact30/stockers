// Shaping the "rest of the BSE" boards into one presentable form.
//
// The Market Pulse page already answers "what are the three sharpest moves today". This answers
// everything after that: the rest of the exchange in both directions, its sectors, its cap tiers,
// its ETFs, and the bullion and metals complex — each as its own board rather than one merged list.
//
// Every figure here is measured. The BSE bhavcopy gives the prices and the breadth, the exchange's
// own industry list gives the sectors, SEBI's rank cut-offs give the cap tiers, and the NSE ETF
// feed gives the funds with their NAV. Nothing on these boards is modelled, estimated or inferred
// from anything other than a published number — which is what lets the AI read on top of them
// describe the market a reader is actually looking at.

/**
 * How a row's constituents are looked up, when it stands for a group of stocks rather than one.
 *
 * A sector row is a count — "80 up, 20 down of 120" — and the obvious next question is *which*
 * ones. Both forms map onto a filter the movers endpoint already takes, so opening a row costs one
 * more query rather than a new feed.
 */
export type Drill = { kind: "category" | "tier"; value: string; label: string };

/** One line on any of the boards, whatever it happens to be a line about. */
export type BoardRow = {
  id: string;
  /** Present when the row is a company and can carry its logo. */
  symbol?: string;
  title: string;
  subtitle: string;
  /** The headline figure, already formatted — a price, a level, or a count. */
  value: string;
  changePercent: number | null;
  pills: string[];
  /** Set when the row opens into the stocks behind it. */
  drill?: Drill;
};

/** A titled block of rows. A board with one unnamed group renders as a plain list. */
export type BoardGroup = {
  name: string;
  description?: string;
  rows: BoardRow[];
};

export type BoardStat = { label: string; value: string };

export type RestBoard = {
  groups: BoardGroup[];
  stats: BoardStat[];
  /** The session or fetch these figures are as of, shown so nothing is read as more current than it is. */
  asOf: string | null;
  /** Set when the board pages — gainers and losers run to thousands of rows. */
  paging?: { page: number; pages: number; total: number };
};

export type TabKey = "gainers" | "losers" | "sectors" | "categories" | "etfs" | "metals";

export const REST_TABS: { key: TabKey; label: string; blurb: string }[] = [
  { key: "gainers", label: "Top performers", blurb: "Every BSE stock that rose today, ranked by the size of the move." },
  { key: "losers", label: "Non performers", blurb: "Every BSE stock that fell today, ranked by the size of the fall." },
  { key: "sectors", label: "Sectors", blurb: "The exchange's own industry groups, with how many rose and fell in each." },
  { key: "categories", label: "Categories", blurb: "Large, mid and small cap, split by SEBI's rank cut-offs." },
  { key: "etfs", label: "ETFs", blurb: "Listed funds by what they track, with today's move against NAV." },
  { key: "metals", label: "Gold, Silver & Metals", blurb: "Bullion funds and the listed metals complex, side by side." },
];

export function formatPercentSigned(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(2)}%`;
}

/** Index levels and fund prices alike — two decimals, Indian digit grouping, no currency symbol. */
export function formatNumber(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rupee crores, as the exchange reports market capitalisation. */
export function formatCrore(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} lakh cr`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })} cr`;
}

// ---------------------------------------------------------------------------
// The payloads these boards are built from, narrowed to the fields actually used.
// ---------------------------------------------------------------------------

type MoverRow = {
  code: string;
  ticker: string | null;
  name: string;
  capTier: string;
  sector: string | null;
  price: number | null;
  changePercent: number | null;
};

export type MoversPayload = {
  rows: MoverRow[];
  total: number;
  page: number;
  pages: number;
  sessionDate: string | null;
};

type SectorSummary = { sector: string; stocks: number; gainers: number; losers: number; star: number; red: number };
export type SectorsPayload = { sectors: SectorSummary[]; sessionDate?: string | null };

type Breadth = { advancing: number; declining: number; unchanged: number; traded: number };
export type CategoriesPayload = {
  summary: {
    listed: number;
    priced: number;
    totalMarketCapCr: number;
    breadth: Breadth;
    byTier: Record<string, { count: number; breadth: Breadth; averageChangePercent: number | null }>;
    sessionDate: string | null;
  };
};

type EtfRow = {
  symbol: string;
  tracks: string;
  lastPrice: number | null;
  changePercent: number | null;
  nav: number | null;
  premiumPercent: number | null;
  changePercent365d: number | null;
};
export type EtfPayload = {
  groups: { key: string; name: string; description: string; etfs: EtfRow[] }[];
  fetchedAt: string;
};

// ---------------------------------------------------------------------------
// Payload → board
// ---------------------------------------------------------------------------

export function moversBoard(payload: MoversPayload, direction: "gainers" | "losers"): RestBoard {
  const rows: BoardRow[] = payload.rows.map((row) => ({
    id: row.code,
    symbol: row.ticker ?? undefined,
    title: row.ticker || row.name,
    subtitle: row.name,
    value: formatNumber(row.price),
    changePercent: row.changePercent,
    pills: [row.capTier ? `${row.capTier} cap` : "", row.sector ?? ""].filter(Boolean),
  }));

  return {
    groups: [{ name: "", rows }],
    stats: [
      { label: direction === "gainers" ? "Stocks up today" : "Stocks down today", value: payload.total.toLocaleString("en-IN") },
      { label: "Pages", value: payload.pages.toLocaleString("en-IN") },
    ],
    asOf: payload.sessionDate,
    paging: { page: payload.page, pages: payload.pages, total: payload.total },
  };
}

export function sectorsBoard(payload: SectorsPayload): RestBoard {
  // Ranked by the share of the sector that advanced, so a sector is judged on its own breadth
  // rather than on how many companies happen to be listed under it.
  const scored = payload.sectors.map((sector) => {
    const traded = sector.gainers + sector.losers;
    return { sector, share: traded > 0 ? (sector.gainers / traded) * 100 : null };
  });
  const ranked = [...scored].sort((a, b) => (b.share ?? -1) - (a.share ?? -1));

  const rows: BoardRow[] = ranked.map(({ sector, share }) => ({
    id: sector.sector,
    title: sector.sector,
    subtitle: `${sector.gainers.toLocaleString("en-IN")} up · ${sector.losers.toLocaleString("en-IN")} down of ${sector.stocks.toLocaleString("en-IN")}`,
    value: share === null ? "—" : `${share.toFixed(0)}%`,
    // Centred on 50: a sector with more risers than fallers reads green, the reverse reads red.
    changePercent: share === null ? null : share - 50,
    pills: [sector.star > 0 ? `${sector.star} up 5%+` : "", sector.red > 0 ? `${sector.red} down 5%+` : ""].filter(Boolean),
    drill: { kind: "category", value: sector.sector, label: sector.sector },
  }));

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  return {
    groups: [{ name: "", rows }],
    stats: [
      { label: "Sectors", value: String(payload.sectors.length) },
      { label: "Broadest advance", value: best ? best.sector.sector : "—" },
      { label: "Broadest decline", value: worst ? worst.sector.sector : "—" },
    ],
    asOf: payload.sessionDate ?? null,
  };
}

const TIER_BLURB: Record<string, string> = {
  Large: "Top 100 by market capitalisation",
  Mid: "Ranks 101–250",
  Small: "Everything below rank 250",
};

export function categoriesBoard(payload: CategoriesPayload): RestBoard {
  const { summary } = payload;

  const rows: BoardRow[] = Object.entries(summary.byTier).map(([tier, data]) => ({
    id: tier,
    title: `${tier} cap`,
    subtitle: `${data.breadth.advancing.toLocaleString("en-IN")} up · ${data.breadth.declining.toLocaleString("en-IN")} down of ${data.count.toLocaleString("en-IN")}`,
    value: formatPercentSigned(data.averageChangePercent),
    changePercent: data.averageChangePercent,
    pills: [TIER_BLURB[tier] ?? ""].filter(Boolean),
    drill: { kind: "tier", value: tier.toLowerCase(), label: `${tier} cap` },
  }));

  return {
    groups: [{ name: "", rows }],
    stats: [
      { label: "Listed", value: summary.listed.toLocaleString("en-IN") },
      { label: "Priced today", value: summary.priced.toLocaleString("en-IN") },
      { label: "Advancing", value: summary.breadth.advancing.toLocaleString("en-IN") },
      { label: "Declining", value: summary.breadth.declining.toLocaleString("en-IN") },
      { label: "Total market cap", value: formatCrore(summary.totalMarketCapCr) },
    ],
    asOf: summary.sessionDate,
  };
}

function etfRow(fund: EtfRow): BoardRow {
  return {
    id: fund.symbol,
    symbol: fund.symbol,
    title: fund.symbol,
    subtitle: fund.tracks || fund.symbol,
    value: formatNumber(fund.lastPrice),
    changePercent: fund.changePercent,
    pills: [
      typeof fund.nav === "number" ? `NAV ${formatNumber(fund.nav)}` : "",
      typeof fund.premiumPercent === "number" ? `${fund.premiumPercent >= 0 ? "+" : ""}${fund.premiumPercent.toFixed(2)}% to NAV` : "",
      typeof fund.changePercent365d === "number" ? `1Y ${formatPercentSigned(fund.changePercent365d)}` : "",
    ].filter(Boolean),
  };
}

/** The bullion groups, kept out of the general ETF board so metals can be read on their own. */
const METAL_KEYS = ["gold", "silver"];

export function etfsBoard(payload: EtfPayload): RestBoard {
  const groups = payload.groups
    .filter((group) => !METAL_KEYS.includes(group.key) && group.etfs.length > 0)
    .map((group) => ({
      name: group.name,
      description: group.description,
      rows: group.etfs.map(etfRow),
    }));

  const counted = payload.groups.filter((group) => !METAL_KEYS.includes(group.key));

  return {
    groups,
    stats: [
      { label: "Fund groups", value: String(groups.length) },
      { label: "Funds listed", value: counted.reduce((sum, group) => sum + group.etfs.length, 0).toLocaleString("en-IN") },
    ],
    asOf: payload.fetchedAt,
  };
}

/**
 * Bullion and the metals complex on one board.
 *
 * Gold and silver are shown through their listed ETFs rather than as a spot price: no exchange
 * feed this app reads publishes a bullion fix, and a fund's traded price and NAV are both real,
 * published numbers. The mining and smelting side is the exchange's own "Metals & Mining" group,
 * so the board covers the metal and the companies that dig it up without conflating the two.
 */
export function metalsBoard(etfs: EtfPayload, sectors: SectorsPayload): RestBoard {
  const groups: BoardGroup[] = [];

  for (const key of METAL_KEYS) {
    const group = etfs.groups.find((candidate) => candidate.key === key);
    if (!group || group.etfs.length === 0) continue;
    groups.push({
      name: `${group.name} ETFs`,
      description: group.description,
      rows: group.etfs.map(etfRow),
    });
  }

  const metals = sectors.sectors.find((sector) => /metal/i.test(sector.sector));
  if (metals) {
    const traded = metals.gainers + metals.losers;
    groups.push({
      name: metals.sector,
      description: "The exchange's own industry group for mining, smelting and metal products.",
      rows: [
        {
          id: metals.sector,
          title: metals.sector,
          subtitle: `${metals.gainers.toLocaleString("en-IN")} up · ${metals.losers.toLocaleString("en-IN")} down of ${metals.stocks.toLocaleString("en-IN")} listed`,
          value: traded > 0 ? `${((metals.gainers / traded) * 100).toFixed(0)}%` : "—",
          changePercent: traded > 0 ? (metals.gainers / traded) * 100 - 50 : null,
          pills: [metals.star > 0 ? `${metals.star} up 5%+` : "", metals.red > 0 ? `${metals.red} down 5%+` : ""].filter(Boolean),
          drill: { kind: "category", value: metals.sector, label: metals.sector },
        },
      ],
    });
  }

  const bullion = groups.filter((group) => group.name.endsWith("ETFs"));

  return {
    groups,
    stats: [
      { label: "Bullion groups", value: String(bullion.length) },
      { label: "Metal stocks", value: metals ? metals.stocks.toLocaleString("en-IN") : "—" },
    ],
    asOf: etfs.fetchedAt,
  };
}

/**
 * The brief handed to the AI read for whichever board is open.
 *
 * Built from the rows the section has already rendered, so the read can only ever describe figures
 * the reader can see for themselves — the same contract every other board on the dashboard uses.
 */
export function briefFor(tab: TabKey, board: RestBoard) {
  const meta = REST_TABS.find((entry) => entry.key === tab)!;
  const rows = board.groups.flatMap((group) => group.rows).slice(0, 8);

  return {
    subject: `${meta.label} on the BSE — ${meta.blurb}`,
    question: "What does this board say about the market right now?",
    facts: board.stats.slice(0, 12).map((stat) => ({ label: stat.label, value: stat.value })),
    highlights: rows.map(
      (row) => `${row.title} (${row.subtitle}): ${row.value}${row.changePercent === null ? "" : `, ${formatPercentSigned(row.changePercent)}`}`,
    ),
  };
}
