// What is moving, in the two lists a reader keeps.
//
// Pure: rows in, filtered and ranked rows out. No fetching, no clock. The route above assembles the
// rows from the performance feed, the dividend calendar and the sector catalogue; everything about
// which of them to show, in what order, and how each stands against its peers is decided here where
// it can be reasoned about.
//
// The split that shapes the whole module is holdings against watchlist. They are different
// questions wearing the same clothes: a gainer in the book is money already made, and a gainer on
// the watchlist is an entry getting more expensive. Ranking them in one list would flatten that
// distinction, so they are never mixed — a stock that is in both appears under both, tagged as
// such, because it genuinely is both.

import type { BoardBrief } from "./board-read";
import { formatMoney, formatPercent } from "./portfolio-metrics";

/** Which list a row came from. `both` is a held stock that is also on the watchlist. */
export type MoverSource = "holding" | "watchlist" | "both";

export type MoverCategory = "holdings" | "watchlist";

export type PeriodKey = "oneDay" | "oneWeek" | "oneMonth" | "sixMonth" | "oneYear";

export const PERIODS: { key: PeriodKey; label: string; long: string }[] = [
  { key: "oneDay", label: "1D", long: "Today" },
  { key: "oneWeek", label: "1W", long: "One week" },
  { key: "oneMonth", label: "1M", long: "One month" },
  { key: "sixMonth", label: "6M", long: "Six months" },
  { key: "oneYear", label: "1Y", long: "One year" },
];

export type CompetitorRow = {
  symbol: string;
  name: string;
  price: number | null;
  /** The peer's return over the same period the table is showing. */
  changePercent: number | null;
  isSelf: boolean;
};

export type MoverDividend = {
  /** Rupees per share, as declared. Null when the exchange worded it unusually. */
  amount: number | null;
  exDate: string | null;
  kind: string;
  /** True while the ex-date is still ahead. */
  upcoming: boolean;
};

export type MoverRow = {
  symbol: string;
  name: string | null;
  source: MoverSource;
  capTier: "Large" | "Mid" | "Small" | null;
  sector: string | null;
  price: number | null;
  returns: Record<PeriodKey, number | null>;
  dividend: MoverDividend | null;
  /** Units held. Zero for a watchlist-only row. */
  quantity: number;
  /** Position value, or null when the row is not owned or could not be priced. */
  value: number | null;
  /** Same-sector peers, with their return over the same period. Empty for an unclassified scrip. */
  competitors: CompetitorRow[];
  /** The mean peer return over the period, excluding this stock. Null without peers. */
  peerAverage: number | null;
  /** 1 = the best performer in its sector group over the period. Null when it has no group. */
  rank: number | null;
  /** How many stocks the rank is out of, including this one. */
  peerCount: number;
  sector_group: string | null;
};

export type MoverFilters = {
  category: "all" | MoverCategory;
  /** Only gainers, only losers, or everything — measured over `period`. */
  direction: "all" | "gainers" | "losers";
  tier: "all" | "Large" | "Mid" | "Small";
  /** Free text over symbol, company name and sector. */
  q: string;
  /** Only rows with a dividend declared in the calendar window. */
  dividendOnly: boolean;
  period: PeriodKey;
  sort: "return" | "symbol" | "price" | "value" | "rank";
  direction_sort: "asc" | "desc";
};

export const DEFAULT_FILTERS: MoverFilters = {
  category: "all",
  direction: "all",
  tier: "all",
  q: "",
  dividendOnly: false,
  period: "oneDay",
  sort: "return",
  direction_sort: "desc",
};

export const PAGE_SIZE = 10;

/** True when nothing has been narrowed — the "Clear filters" button keys off this. */
export function filtersAreDefault(filters: MoverFilters): boolean {
  return (
    filters.category === DEFAULT_FILTERS.category &&
    filters.direction === DEFAULT_FILTERS.direction &&
    filters.tier === DEFAULT_FILTERS.tier &&
    filters.q.trim() === "" &&
    filters.dividendOnly === DEFAULT_FILTERS.dividendOnly
  );
}

/** Whether a row belongs to a category. A `both` row belongs to each of them. */
export function inCategory(row: MoverRow, category: MoverCategory): boolean {
  return row.source === "both" || row.source === (category === "holdings" ? "holding" : "watchlist");
}

export function returnOf(row: MoverRow, period: PeriodKey): number | null {
  const value = row.returns[period];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The rows that survive the filters.
 *
 * A row the feed had no return for is dropped by a direction filter but kept by everything else:
 * "gainers" is a claim about a number, and a stock with no number is neither a gainer nor a loser.
 * Filtering it out of an unfiltered list, though, would hide a holding the reader owns.
 */
export function filterMovers(rows: MoverRow[], filters: MoverFilters): MoverRow[] {
  const term = filters.q.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.category !== "all" && !inCategory(row, filters.category)) return false;
    if (filters.tier !== "all" && row.capTier !== filters.tier) return false;
    if (filters.dividendOnly && row.dividend === null) return false;

    if (filters.direction !== "all") {
      const value = returnOf(row, filters.period);
      if (value === null) return false;
      if (filters.direction === "gainers" && value <= 0) return false;
      if (filters.direction === "losers" && value >= 0) return false;
    }

    if (term) {
      const haystack = `${row.symbol} ${row.name ?? ""} ${row.sector ?? ""}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    return true;
  });
}

/**
 * The filtered rows, ordered.
 *
 * A null always sorts to the bottom whichever direction is asked for: a stock the feed could not
 * price has no standing among stocks it could, and letting a null lead an ascending sort would
 * bury the answer under rows that carry no information.
 */
export function sortMovers(rows: MoverRow[], filters: MoverFilters): MoverRow[] {
  const factor = filters.direction_sort === "asc" ? 1 : -1;

  const valueOf = (row: MoverRow): number | null => {
    switch (filters.sort) {
      case "price":
        return row.price;
      case "value":
        return row.value;
      case "rank":
        // A better rank is a smaller number, so it is negated to keep "descending = better"
        // meaning the same thing on every column.
        return row.rank === null ? null : -row.rank;
      case "return":
      default:
        return returnOf(row, filters.period);
    }
  };

  return [...rows].sort((a, b) => {
    if (filters.sort === "symbol") return factor * -a.symbol.localeCompare(b.symbol);

    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return factor * (right - left);
  });
}

export type Paged<T> = { rows: T[]; page: number; pages: number; total: number; pageSize: number };

export function paginate<T>(rows: T[], page: number, pageSize = PAGE_SIZE): Paged<T> {
  const pages = Math.max(Math.ceil(rows.length / pageSize), 1);
  // Clamped rather than trusted: a filter that shrinks the result set while the reader is on page
  // four must land them on the last page that exists, not on an empty one.
  const current = Math.min(Math.max(page, 1), pages);

  return {
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pages,
    total: rows.length,
    pageSize,
  };
}

export type MoverSplit = { gainers: MoverRow[]; losers: MoverRow[]; flat: number; unpriced: number };

/**
 * One category, split into what is up and what is down over the period.
 *
 * Exactly flat is neither. It is rare over a month and common over a day for a scrip that did not
 * trade, and filing it under gainers would put a stock that did nothing at the top of a card
 * about movement.
 */
export function splitMovers(rows: MoverRow[], category: MoverCategory, period: PeriodKey, limit = 5): MoverSplit {
  const inList = rows.filter((row) => inCategory(row, category));
  const priced = inList.filter((row) => returnOf(row, period) !== null);

  const ranked = [...priced].sort((a, b) => (returnOf(b, period) as number) - (returnOf(a, period) as number));

  return {
    gainers: ranked.filter((row) => (returnOf(row, period) as number) > 0).slice(0, limit),
    losers: ranked
      .filter((row) => (returnOf(row, period) as number) < 0)
      .reverse()
      .slice(0, limit),
    flat: priced.filter((row) => returnOf(row, period) === 0).length,
    unpriced: inList.length - priced.length,
  };
}

/**
 * Where a stock stands among its sector peers over the period, and what they did.
 *
 * Rank is computed over the peers that could actually be measured, so it is honest about its own
 * denominator — "2 of 4" when two of a six-name sector had no return is a true statement, and
 * "2 of 6" would not be. A stock with no return of its own has no rank at all rather than last
 * place: not measured is not the same as worst.
 */
export function rankAmongPeers(
  self: number | null,
  peers: CompetitorRow[],
): { rank: number | null; peerCount: number; peerAverage: number | null } {
  const measured = peers.filter((peer) => !peer.isSelf && peer.changePercent !== null);

  const peerAverage =
    measured.length > 0
      ? measured.reduce((sum, peer) => sum + (peer.changePercent as number), 0) / measured.length
      : null;

  if (self === null || measured.length === 0) {
    return { rank: null, peerCount: measured.length + (self === null ? 0 : 1), peerAverage };
  }

  const better = measured.filter((peer) => (peer.changePercent as number) > self).length;
  return { rank: better + 1, peerCount: measured.length + 1, peerAverage };
}

/** Emerald when the stock beat its sector, rose when it lagged it. Null when there is no group. */
export function versusPeers(row: MoverRow, period: PeriodKey): number | null {
  const self = returnOf(row, period);
  if (self === null || row.peerAverage === null) return null;
  return self - row.peerAverage;
}

/**
 * The movers board's own figures, for the AI read above it.
 *
 * Both categories go in, kept apart, because the single most useful thing a model can say here is
 * the thing the split exists to make visible: whether the book and the list the reader is
 * considering are moving the same way.
 */
export function moversBrief(rows: MoverRow[], period: PeriodKey): BoardBrief | null {
  if (rows.length === 0) return null;

  const label = PERIODS.find((entry) => entry.key === period)?.long ?? "the period";
  const holdings = splitMovers(rows, "holdings", period, 3);
  const watchlist = splitMovers(rows, "watchlist", period, 3);

  if (holdings.gainers.length + holdings.losers.length + watchlist.gainers.length + watchlist.losers.length === 0) {
    return null;
  }

  const facts = [
    { label: "Window", value: label },
    { label: "Holdings", value: `${holdings.gainers.length} up, ${holdings.losers.length} down` },
    { label: "Watchlist", value: `${watchlist.gainers.length} up, ${watchlist.losers.length} down` },
    {
      label: "Beating their sector",
      value: `${rows.filter((row) => (versusPeers(row, period) ?? 0) > 0).length} of ${rows.length}`,
    },
  ];

  const highlights: string[] = [];

  if (holdings.gainers[0]) {
    highlights.push(
      `${holdings.gainers[0].symbol} leads the holdings at ${formatPercent(returnOf(holdings.gainers[0], period))}${holdings.gainers[0].value !== null ? `, worth ${formatMoney(holdings.gainers[0].value)}` : ""}.`,
    );
  }
  if (holdings.losers[0]) {
    highlights.push(`${holdings.losers[0].symbol} is the weakest holding at ${formatPercent(returnOf(holdings.losers[0], period))}.`);
  }
  if (watchlist.gainers[0]) {
    highlights.push(
      `On the watchlist, ${watchlist.gainers[0].symbol} is up ${formatPercent(returnOf(watchlist.gainers[0], period))} — an entry getting more expensive, not a gain made.`,
    );
  }
  if (watchlist.losers[0]) {
    highlights.push(`${watchlist.losers[0].symbol} is the watchlist's weakest at ${formatPercent(returnOf(watchlist.losers[0], period))}.`);
  }

  for (const row of rows.filter((entry) => entry.rank === 1).slice(0, 2)) {
    highlights.push(`${row.symbol} is the best performer of the ${row.peerCount} ${row.sector ?? "sector"} names measured.`);
  }

  const withDividends = rows.filter((row) => row.dividend?.upcoming);
  if (withDividends.length > 0) {
    highlights.push(`${withDividends.length} of these have a dividend ex-date still ahead.`);
  }

  return {
    subject: `one investor's own holdings and watchlist, ranked by their ${label.toLowerCase()} move against their sector peers`,
    question: "What is actually moving in these two lists, and is any of it a sector story rather than a stock one?",
    facts,
    highlights: highlights.slice(0, 8),
  };
}
