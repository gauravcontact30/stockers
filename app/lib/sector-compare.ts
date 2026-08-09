// Curated same-sector match-ups, plus the ad-hoc comparison behind the three-stock picker.
//
// Comparing TCS with a bank tells you little; comparing it with Infosys, Wipro and HCL Tech tells
// you who is actually winning the same race. Each showdown therefore holds peers from one sector
// only, and every stock keeps its cap tier alongside its call so a small cap is never read as if
// it were a large cap.

import { CACHE_TAGS } from "./cache";
import { cached } from "./nse-client";
import { verdictsFor, type StockVerdict } from "./stock-verdicts";

export type Showdown = {
  id: string;
  sector: string;
  title: string;
  premise: string;
  symbols: string[];
};

/** The five match-ups on the compare board, data centers among them. */
export const SHOWDOWNS: Showdown[] = [
  {
    id: "it-majors",
    sector: "Information Technology",
    title: "The IT majors",
    premise: "India's four largest IT services exporters, all facing the same client-spending cycle.",
    symbols: ["TCS", "INFY", "HCLTECH", "WIPRO"],
  },
  {
    id: "private-banks",
    sector: "Banking",
    title: "Banking heavyweights",
    premise: "The lenders that set the tone for the whole financial index, private and public side by side.",
    symbols: ["HDFCBANK", "ICICIBANK", "KOTAKBANK", "SBIN"],
  },
  {
    id: "data-centers",
    sector: "Data Centers",
    title: "Data centre build-out",
    premise: "The listed ways to own India's digital-infrastructure boom — connectivity, hardware and land.",
    symbols: ["TATACOMM", "ANANTRAJ", "RAILTEL", "NETWEB"],
  },
  {
    id: "auto",
    sector: "Automobile",
    title: "Auto majors",
    premise: "Passenger vehicles against commercial and farm equipment, through one demand cycle.",
    symbols: ["MARUTI", "M&M", "TATAMOTORS"],
  },
  {
    id: "pharma",
    sector: "Pharmaceuticals",
    title: "Pharma leaders",
    premise: "The generic exporters, judged on how each has weathered US pricing pressure.",
    symbols: ["SUNPHARMA", "CIPLA", "DRREDDY"],
  },
];

export type ShowdownResult = Showdown & {
  stocks: StockVerdict[];
  /** The strongest and weakest of the peers, when the group has a clear order. */
  leader: string | null;
  laggard: string | null;
  takeaway: string;
};

function rank(stocks: StockVerdict[]): { leader: string | null; laggard: string | null } {
  if (stocks.length < 2) return { leader: null, laggard: null };
  const ordered = [...stocks].sort((a, b) => b.score - a.score);
  const [best] = ordered;
  const worst = ordered[ordered.length - 1];
  // An identical score across the group means there is no order to report.
  if (best.score === worst.score) return { leader: null, laggard: null };
  return { leader: best.symbol, laggard: worst.symbol };
}

function takeawayFor(sector: string, stocks: StockVerdict[], leader: string | null, laggard: string | null): string {
  if (!leader || !laggard) return `${sector} peers are moving together — nothing separates them on the numbers right now.`;

  const buys = stocks.filter((stock) => stock.stance === "Buy").length;
  const sells = stocks.filter((stock) => stock.stance === "Sell").length;
  const shape =
    buys && !sells
      ? "the whole group is trending up"
      : sells && !buys
        ? "the whole group is under pressure"
        : "the group is splitting";

  return `In ${sector} ${shape}: ${leader} leads the peer set and ${laggard} trails it.`;
}

// The board is the same for every reader and its inputs move at the pace of the market, so it is
// built once and shared. Without this each visit would re-run the whole scoring pass.
const SHOWDOWN_TTL_MS = 10 * 60 * 1000;

/**
 * All five boards.
 *
 * Every symbol across the five is scored in a single pass rather than one pass per board: the
 * scoring batches its quote and history fetches, and narrates the whole set in one model call, so
 * doing it five times over turned a two-second job into a twenty-second one.
 */
export const getShowdowns = cached<{ showdowns: ShowdownResult[] }>(SHOWDOWN_TTL_MS, async () => {
  const everySymbol = [...new Set(SHOWDOWNS.flatMap((showdown) => showdown.symbols))];
  const scored = await verdictsFor(everySymbol);
  const bySymbol = new Map(scored.map((verdict) => [verdict.symbol, verdict]));

  const showdowns = SHOWDOWNS.map((showdown) => {
    const stocks = showdown.symbols.flatMap((symbol) => {
      const verdict = bySymbol.get(symbol);
      return verdict ? [verdict] : [];
    });
    const { leader, laggard } = rank(stocks);

    return { ...showdown, stocks, leader, laggard, takeaway: takeawayFor(showdown.sector, stocks, leader, laggard) };
  });

  return { showdowns };
  // Tagged `ai` as well as `nse`: the takeaways under each board are model-written, so purging the
  // AI layer has to drop these too or the old prose survives the purge.
}, { key: "compare:showdowns", tags: [CACHE_TAGS.nse, CACHE_TAGS.ai], persist: true });

export type CustomComparison = {
  stocks: StockVerdict[];
  sameSector: boolean;
  leader: string | null;
  laggard: string | null;
  takeaway: string;
};

export const MAX_CUSTOM_STOCKS = 3;

/** The comparison behind the picker: any two or three stocks, related or not. */
export async function compareCustom(symbols: string[]): Promise<CustomComparison> {
  const stocks = await verdictsFor(symbols.slice(0, MAX_CUSTOM_STOCKS));
  const { leader, laggard } = rank(stocks);

  const sectorsInPlay = new Set(stocks.map((stock) => stock.sector ?? "unclassified"));
  const sameSector = stocks.length > 1 && sectorsInPlay.size === 1;

  const takeaway = !leader
    ? "These stocks are scoring the same on momentum — there is no separation between them today."
    : sameSector
      ? takeawayFor([...sectorsInPlay][0], stocks, leader, laggard)
      : `Across ${sectorsInPlay.size} sectors, ${leader} has the strongest momentum and ${laggard} the weakest. Different sectors move to different cycles, so treat this as relative strength rather than a like-for-like contest.`;

  return { stocks, sameSector, leader, laggard, takeaway };
}
