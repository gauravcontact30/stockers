import { getQuotesFor } from "./market-data";

export type BenchmarkIndex = {
  /** Display key, unique within this list — the Yahoo ticker is kept separate so the UI never shows "^NSEI". */
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  description: string;
};

/**
 * The three benchmarks Indian investors actually quote at each other. NIFTY 50 and SENSEX are
 * the headline large-cap gauges for the two exchanges; Bank NIFTY is tracked separately because
 * banking drives a disproportionate share of index moves and often diverges from the headline.
 */
export const benchmarkIndices: BenchmarkIndex[] = [
  {
    symbol: "NIFTY50",
    yahooSymbol: "^NSEI",
    name: "NIFTY 50",
    exchange: "NSE",
    description: "50 large caps across sectors",
  },
  {
    symbol: "SENSEX",
    yahooSymbol: "^BSESN",
    name: "SENSEX",
    exchange: "BSE",
    description: "30 blue chips on the BSE",
  },
  {
    symbol: "BANKNIFTY",
    yahooSymbol: "^NSEBANK",
    name: "Bank NIFTY",
    exchange: "NSE",
    description: "12 most liquid banking stocks",
  },
];

export type IndexQuote = BenchmarkIndex & {
  /** Index level — a point value, not a rupee price, so it is never rendered with a ₹ sign. */
  price: number | null;
  previousClose: number | null;
  /** Move in index points since the previous close. */
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  live: boolean;
  asOf: string | null;
};

/**
 * Live levels for the three benchmarks, from the same Yahoo chart feed and 60s quote cache the
 * rest of the app uses — so an index and its constituents can never be quoted as of different
 * moments on the same screen.
 */
export async function getBenchmarkIndices(): Promise<IndexQuote[]> {
  const quotes = await getQuotesFor(benchmarkIndices);

  return benchmarkIndices.map((index, position) => {
    const quote = quotes[position];
    return {
      ...index,
      price: quote.price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      live: quote.live,
      asOf: quote.asOf,
    };
  });
}
