import { getBseDirectory, type BseRow } from "./bse-market";
import { getBaseline, HISTORY_PERIODS, overallReturn, periodReturn, type Baseline } from "./bse-history";

export type BseMarketReturnPoint = {
  key: "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "Overall";
  value: number | null;
  measuredFrom: string | null;
};

export type BseMarketSnapshot = {
  symbol: string;
  name: string;
  scripCode: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  sessionDate: string | null;
  source: "BSE Bhavcopy";
  returns: BseMarketReturnPoint[];
};

const DISPLAY_PERIODS = [
  ["1W", "1w"],
  ["1M", "1m"],
  ["3M", "3m"],
  ["6M", "6m"],
  ["1Y", "1y"],
  ["3Y", "3y"],
  ["5Y", "5y"],
] as const;

function pickRow(rows: BseRow[], query: string): BseRow | null {
  const needle = query.trim().toUpperCase();
  return (
    rows.find((row) => row.ticker.toUpperCase() === needle) ??
    rows.find((row) => row.code === needle) ??
    rows.find((row) => row.isin.toUpperCase() === needle) ??
    rows[0] ??
    null
  );
}

function overallMeasuredFrom(code: string, baselines: Baseline[]): string | null {
  return baselines.find((baseline) => baseline.prices.has(code))?.date ?? null;
}

export async function getBseMarketSnapshot(query: string): Promise<BseMarketSnapshot | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const directory = await getBseDirectory({ q: trimmed, pageSize: 10 });
  const row = pickRow(directory.rows, trimmed);
  if (!row) return null;

  const baselines = await Promise.all(HISTORY_PERIODS.map((period) => getBaseline(period)));
  const baselineByPeriod = new Map(HISTORY_PERIODS.map((period, index) => [period, baselines[index]]));
  const price = row.price;
  const identifiers = [row.code, row.ticker, row.isin];

  const returns: BseMarketReturnPoint[] = [
    { key: "1D", value: row.changePercent, measuredFrom: directory.sessionDate },
    ...DISPLAY_PERIODS.map(([label, period]) => {
      const baseline = baselineByPeriod.get(period);
      return {
        key: label,
        value: price === null || !baseline ? null : periodReturn(identifiers, price, baseline),
        measuredFrom: baseline?.date ?? null,
      };
    }),
    {
      key: "Overall",
      value: price === null ? null : overallReturn(identifiers, price, baselines),
      measuredFrom: overallMeasuredFrom(row.code, baselines) ?? overallMeasuredFrom(row.ticker, baselines) ?? overallMeasuredFrom(row.isin, baselines),
    },
  ];

  return {
    symbol: row.ticker,
    name: row.name,
    scripCode: row.code,
    price,
    previousClose: row.previousClose,
    change: row.change,
    changePercent: row.changePercent,
    sessionDate: directory.sessionDate,
    source: "BSE Bhavcopy",
    returns,
  };
}
