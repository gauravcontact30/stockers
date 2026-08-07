import { cached, fetchNse, toNumber, toText, todayIST } from "./nse-client";
import { getIndustryMap, UNCLASSIFIED } from "./nse-industry";

// Declared dividends straight from NSE's corporate-actions feed. The window runs a full quarter
// into the past and two quarters forward: back far enough that a sector still has a body of
// recent payouts to judge a company's record by, and forward far enough to cover everything
// already declared. The board pages and filters what comes back, so a wide window costs the
// reader nothing and a narrow one silently hides declared dividends.
const LOOKBACK_DAYS = 90;
const LOOKAHEAD_DAYS = 180;
const TTL_MS = 60 * 60_000;

export type Dividend = {
  symbol: string;
  company: string;
  sector: string;
  /** NSE's raw subject line, e.g. "Interim Dividend - Rs 8 Per Share". */
  subject: string;
  /** "Interim", "Final", "Special" — read off the subject line. */
  kind: string;
  /** Rupees per share, parsed from the subject line; null when NSE words it unusually. */
  amount: number | null;
  faceValue: number | null;
  /** Dividend as a percentage of face value — how Indian companies traditionally declare it. */
  percentOfFaceValue: number | null;
  /** The date from which the stock trades without the dividend — the one that matters to buyers. */
  exDate: string | null;
  recordDate: string | null;
  /** Month label for the ex-date, e.g. "Aug 2026". */
  month: string | null;
  /** True when the ex-date has not yet passed, so the dividend is still capturable. */
  upcoming: boolean;
};

export type DividendSector = {
  sector: string;
  dividends: Dividend[];
  /** Number still capturable — the ex-date hasn't passed. */
  upcomingCount: number;
  totalAmount: number;
};

export type DividendBoard = {
  sectors: DividendSector[];
  total: number;
  upcomingTotal: number;
  today: string;
  fetchedAt: string;
  live: boolean;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** NSE writes corporate-action dates as "05-Aug-2026"; normalised to ISO for comparison. */
export function parseActionDate(value: unknown): string | null {
  const text = toText(value);
  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;

  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;

  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

export function monthLabel(iso: string | null): string | null {
  if (!iso) return null;
  const [year, month] = iso.split("-");
  const index = Number(month) - 1;
  if (!MONTH_LABELS[index]) return null;
  return `${MONTH_LABELS[index]} ${year}`;
}

/**
 * Pulls the per-share amount out of NSE's subject line. It appears as "Rs 2", "Rs 1.50" or
 * "Re 0.50" ("Re" being the singular rupee), so both spellings are matched.
 */
export function parseDividendAmount(subject: string): number | null {
  const match = subject.match(/\bRs?e?\.?\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

/** Interim, Final, Special or plain — taken from the words before the dash in the subject. */
export function dividendKind(subject: string): string {
  const head = subject.split("-")[0].toLowerCase();
  if (head.includes("interim")) return "Interim";
  if (head.includes("special")) return "Special";
  if (head.includes("final")) return "Final";
  return "Dividend";
}

function formatNseDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

export const getDividendBoard = cached(TTL_MS, async (): Promise<DividendBoard> => {
  const today = todayIST();

  const from = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const to = new Date(Date.now() + LOOKAHEAD_DAYS * 86_400_000);

  const [payload, industries] = await Promise.all([
    fetchNse<unknown>(
      `/corporates-corporateActions?index=equities&from_date=${formatNseDate(from)}&to_date=${formatNseDate(to)}`,
    ),
    getIndustryMap(),
  ]);

  const rows = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
  const bySector = new Map<string, Dividend[]>();
  let total = 0;
  let upcomingTotal = 0;

  for (const row of rows) {
    const subject = toText(row.subject);
    // The same feed carries splits, bonuses and rights issues; only dividends belong here.
    // "Distribution" rows are InvIT/REIT payouts with a different structure, so they're excluded.
    if (!/dividend/i.test(subject) || /^distribution/i.test(subject)) continue;

    const symbol = toText(row.symbol);
    if (!symbol) continue;

    const exDate = parseActionDate(row.exDate);
    const amount = parseDividendAmount(subject);
    const faceValue = toNumber(row.faceVal);
    const meta = industries.get(symbol);
    const upcoming = exDate !== null && exDate >= today;

    const dividend: Dividend = {
      symbol,
      company: toText(row.comp) || meta?.name || symbol,
      sector: meta?.industry || UNCLASSIFIED,
      subject,
      kind: dividendKind(subject),
      amount,
      faceValue,
      percentOfFaceValue: amount !== null && faceValue !== null && faceValue > 0 ? (amount / faceValue) * 100 : null,
      exDate,
      recordDate: parseActionDate(row.recDate),
      month: monthLabel(exDate),
      upcoming,
    };

    const bucket = bySector.get(dividend.sector) ?? [];
    bucket.push(dividend);
    bySector.set(dividend.sector, bucket);

    total++;
    if (upcoming) upcomingTotal++;
  }

  const sectors: DividendSector[] = Array.from(bySector.entries())
    .map(([sector, dividends]) => {
      // Soonest ex-date first: the nearest deadline is the one a reader can still act on.
      dividends.sort((a, b) => (a.exDate ?? "9999").localeCompare(b.exDate ?? "9999"));
      return {
        sector,
        dividends,
        upcomingCount: dividends.filter((dividend) => dividend.upcoming).length,
        totalAmount: dividends.reduce((sum, dividend) => sum + (dividend.amount ?? 0), 0),
      };
    })
    // Real sectors first, biggest first; the unclassified bucket always sinks to the end so it
    // never leads a list of genuine industries.
    .sort((a, b) => {
      if (a.sector !== b.sector) {
        if (a.sector === UNCLASSIFIED) return 1;
        if (b.sector === UNCLASSIFIED) return -1;
      }
      return b.dividends.length - a.dividends.length || a.sector.localeCompare(b.sector);
    });

  return {
    sectors,
    total,
    upcomingTotal,
    today,
    fetchedAt: new Date().toISOString(),
    live: total > 0,
  };
});
