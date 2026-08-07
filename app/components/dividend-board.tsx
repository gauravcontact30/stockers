"use client";

import { useMemo, useState } from "react";
import { AiBoardRead } from "./ai-board-read";
import { CompanyLogo } from "./company-logo";
import { formatDayDate, formatRupee, sectorTone } from "./market-format";
import {
  MarketSection,
  Pager,
  PillTabs,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
  usePaged,
} from "./market-section";
import type { BoardBrief } from "../lib/board-read";

const PAGE_SIZE = 12;

export type Dividend = {
  symbol: string;
  company: string;
  sector: string;
  subject: string;
  kind: string;
  amount: number | null;
  faceValue: number | null;
  percentOfFaceValue: number | null;
  exDate: string | null;
  recordDate: string | null;
  month: string | null;
  upcoming: boolean;
};

export type DividendSector = {
  sector: string;
  dividends: Dividend[];
  upcomingCount: number;
  totalAmount: number;
};

export type DividendBoardData = {
  sectors: DividendSector[];
  total: number;
  upcomingTotal: number;
  today: string;
  live: boolean;
};

/** The dividend calendar as figures: what is still capturable and what pays the most. */
export function dividendBrief(sectors: DividendSector[], upcomingTotal: number, total: number): BoardBrief | null {
  if (sectors.length === 0) return null;

  const upcoming = sectors.flatMap((sector) => sector.dividends).filter((dividend) => dividend.upcoming);
  const byAmount = [...upcoming].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const byDate = upcoming
    .filter((dividend): dividend is Dividend & { exDate: string } => dividend.exDate !== null)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));

  return {
    subject: "Declared dividends on NSE's corporate-actions calendar, grouped by sector",
    question: "Which of these is still capturable, and is the payout worth holding the stock for?",
    facts: [
      { label: "Declared dividends", value: String(total) },
      { label: "Still ahead of ex-date", value: String(upcomingTotal) },
      { label: "Sectors paying", value: String(sectors.length) },
      ...(byDate[0] ? [{ label: "Next ex-date", value: `${byDate[0].symbol} on ${formatDayDate(byDate[0].exDate)}` }] : []),
    ],
    highlights: byAmount
      .slice(0, 4)
      .map(
        (dividend) =>
          `${dividend.symbol} (${dividend.sector}): ${dividend.kind.toLowerCase()} dividend of ${formatRupee(dividend.amount)} a share, ex-date ${formatDayDate(dividend.exDate)}`,
      ),
  };
}

/**
 * A colour per category, carried by the whole card rather than one small chip.
 *
 * The four kinds mean genuinely different things — an interim is paid mid-year against profits
 * not yet final, a final is declared with the results, a special is one-off — so a reader
 * scanning a page of cards should be able to sort them by eye before reading a word.
 */
export const KIND_STYLES: Record<string, { chip: string; card: string; rule: string; label: string }> = {
  Interim: {
    chip: "bg-sky-600 text-white",
    card: "border-sky-200 bg-sky-50/60 hover:border-sky-400 dark:border-sky-500/30 dark:bg-sky-500/5",
    rule: "border-sky-200/80 dark:border-sky-500/20",
    label: "Paid part-way through the financial year",
  },
  Final: {
    chip: "bg-emerald-600 text-white",
    card: "border-emerald-200 bg-emerald-50/60 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/5",
    rule: "border-emerald-200/80 dark:border-emerald-500/20",
    label: "Declared with the full-year results",
  },
  Special: {
    chip: "bg-violet-600 text-white",
    card: "border-violet-200 bg-violet-50/60 hover:border-violet-400 dark:border-violet-500/30 dark:bg-violet-500/5",
    rule: "border-violet-200/80 dark:border-violet-500/20",
    label: "One-off, outside the usual schedule",
  },
  Dividend: {
    chip: "bg-slate-600 text-white",
    card: "border-slate-200 bg-slate-50 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/60",
    rule: "border-slate-200 dark:border-slate-800",
    label: "Declared without a stated type",
  },
};

export const DIVIDEND_KINDS = ["Interim", "Final", "Special", "Dividend"];

export const ALL_SECTORS = "__all__";
export const ALL_KINDS = "__any__";

export type Timing = "upcoming" | "passed" | "all";

export const TIMING_OPTIONS: { key: Timing; label: string }[] = [
  { key: "upcoming", label: "Still capturable" },
  { key: "passed", label: "Ex-date passed" },
  { key: "all", label: "Everything declared" },
];

export type DividendFilters = { sector: string; query: string; kind: string; timing: Timing };

/**
 * The whole calendar reduced to what the reader asked for.
 *
 * Filtering across every sector rather than within one selected tab is the point: "which telecom
 * dividends are still capturable" and "where can I find TCS" are the two real questions, and the
 * second one cannot be answered by a tab you have to guess first.
 */
export function filterDividends(sectors: DividendSector[], filters: DividendFilters): Dividend[] {
  const term = filters.query.trim().toLowerCase();

  const rows = sectors
    .filter((sector) => filters.sector === ALL_SECTORS || sector.sector === filters.sector)
    .flatMap((sector) => sector.dividends)
    .filter((dividend) => filters.kind === ALL_KINDS || dividend.kind === filters.kind)
    .filter((dividend) =>
      filters.timing === "all" ? true : filters.timing === "upcoming" ? dividend.upcoming : !dividend.upcoming,
    )
    .filter(
      (dividend) =>
        !term ||
        dividend.symbol.toLowerCase().includes(term) ||
        dividend.company.toLowerCase().includes(term) ||
        dividend.sector.toLowerCase().includes(term),
    );

  // Soonest ex-date first: the nearest deadline is the one still worth acting on.
  return [...rows].sort((a, b) => (a.exDate ?? "9999").localeCompare(b.exDate ?? "9999"));
}

export function kindStyle(kind: string) {
  return KIND_STYLES[kind] ?? KIND_STYLES.Dividend;
}

export function kindTone(kind: string): string {
  return kindStyle(kind).chip;
}

/**
 * Indian companies traditionally declare a dividend as a percentage of face value, which is why
 * "500% dividend" on a ₹2 face value means ₹10 a share. Both are shown so neither misleads.
 */
export function faceValueLabel(percentOfFaceValue: number | null, faceValue: number | null): string | null {
  if (percentOfFaceValue === null || faceValue === null) return null;
  return `${percentOfFaceValue.toFixed(0)}% of ₹${faceValue} face value`;
}

function DividendRow({ dividend }: { dividend: Dividend }) {
  const faceLabel = faceValueLabel(dividend.percentOfFaceValue, dividend.faceValue);
  const style = kindStyle(dividend.kind);

  return (
    // Colour says which category; whether the ex-date has passed is said in words and by fading
    // the card, so the two never compete for the same signal.
    <li className={`rounded-2xl border p-4 transition ${style.card} ${dividend.upcoming ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <CompanyLogo symbol={dividend.symbol} size={34} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{dividend.symbol}</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{dividend.company}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white">
            {dividend.amount === null ? "—" : formatRupee(dividend.amount)}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">per share</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindTone(dividend.kind)}`}>{dividend.kind}</span>
        {dividend.month && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {dividend.month}
          </span>
        )}
        {dividend.upcoming ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            UPCOMING
          </span>
        ) : (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            EX-DATE PASSED
          </span>
        )}
      </div>

      <dl className={`mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3 text-[11px] ${style.rule}`}>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Ex-date</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatDayDate(dividend.exDate)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Record date</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {formatDayDate(dividend.recordDate)}
          </dd>
        </div>
      </dl>

      {faceLabel && <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">{faceLabel}</p>}
    </li>
  );
}

/**
 * Declared dividends grouped by sector, from NSE's corporate-actions feed.
 *
 * The ex-date is the one that matters and is therefore the sort key: buy on or after it and the
 * dividend goes to the seller, not to you.
 */
export function DividendBoard() {
  const { data, loading, error } = useMarketFeed<DividendBoardData>("/api/market/dividends");
  const [active, setActive] = useState<string>(ALL_SECTORS);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>(ALL_KINDS);
  const [timing, setTiming] = useState<Timing>("upcoming");

  const sectors = useMemo(() => data?.sectors ?? [], [data]);
  const total = data?.total ?? 0;
  const rows = useMemo(() => filterDividends(sectors, { sector: active, query, kind, timing }), [
    sectors,
    active,
    query,
    kind,
    timing,
  ]);

  // Any change to the filters is a different list, so paging restarts.
  const paged = usePaged(rows, PAGE_SIZE, `${active}|${query}|${kind}|${timing}`);
  const brief = useMemo(
    () => dividendBrief(sectors, data?.upcomingTotal ?? 0, total),
    [sectors, data?.upcomingTotal, total],
  );

  const capturable = rows.filter((dividend) => dividend.upcoming).length;
  const filtered = active !== ALL_SECTORS || query !== "" || kind !== ALL_KINDS || timing !== "upcoming";

  return (
    <MarketSection
      id="dividends"
      eyebrow="Stock dividends"
      eyebrowClass="text-teal-600 dark:text-teal-400"
      title="Declared dividends, sector by sector"
      blurb="Every dividend on NSE's corporate-actions calendar, grouped by sector, with the amount per share, the month and the ex-date you must own the stock before to receive it."
      aside={
        <div className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-400">
          {data?.upcomingTotal ?? 0} still capturable
        </div>
      }
    >
      <AiBoardRead feature="dividends" brief={brief} />

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-32" />}

      {!loading && sectors.length > 0 && (
        <>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Advanced search
            </p>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Company or ticker</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try INFY, Hindustan Unilever or Telecom"
                  className="mt-1 w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Sector</span>
                <select
                  value={active}
                  onChange={(event) => setActive(event.target.value)}
                  className="mt-1 w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value={ALL_SECTORS}>All sectors ({total})</option>
                  {sectors.map((sector) => (
                    <option key={sector.sector} value={sector.sector}>
                      {sector.sector} ({sector.dividends.length})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Category</span>
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                  className="mt-1 w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value={ALL_KINDS}>Any category</option>
                  {DIVIDEND_KINDS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <PillTabs label="Ex-date timing" value={timing} onChange={setTiming} options={TIMING_OPTIONS} />
              {filtered && (
                <button
                  type="button"
                  onClick={() => {
                    setActive(ALL_SECTORS);
                    setQuery("");
                    setKind(ALL_KINDS);
                    setTiming("upcoming");
                  }}
                  className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* A legend, because the cards are now colour-coded and a colour nobody can decode is
              just decoration. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {DIVIDEND_KINDS.map((option) => (
              <span key={option} className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${kindStyle(option).chip}`}>{option}</span>
                {kindStyle(option).label}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sectorTone(active === ALL_SECTORS ? "All sectors" : active)}`}>
              {active === ALL_SECTORS ? "All sectors" : active}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{rows.length}</span> matching
              {" · "}
              <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{capturable}</span> still ahead of
              their ex-date
            </p>
          </div>

          {rows.length > 0 ? (
            <>
              <ul className="mt-3 grid gap-3 lg:grid-cols-2">
                {paged.slice.map((dividend) => (
                  <DividendRow key={`${dividend.symbol}-${dividend.exDate}-${dividend.subject}`} dividend={dividend} />
                ))}
              </ul>
              <Pager paged={paged} unit="dividends" />
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              No declared dividend matches those filters. Widen the sector or category, or switch the timing to everything
              declared.
            </p>
          )}
        </>
      )}

      {!loading && sectors.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          No dividends on NSE&apos;s corporate-actions calendar for the current window.
        </p>
      )}

      <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 text-xs text-teal-900 dark:border-teal-500/25 dark:bg-teal-500/5 dark:text-teal-200">
        <p className="font-semibold">Reading a dividend</p>
        <p className="mt-1.5">
          You must hold the stock <span className="font-semibold">before</span> the ex-date to receive the payout. Buy on the
          ex-date itself and the dividend goes to the seller. The price also typically falls by roughly the dividend amount
          on that date, so a dividend is not free money — it is part of the stock&apos;s value paid out in cash.
        </p>
      </div>

      <SectionFootnote>
        Declared dividends from NSE India&apos;s corporate-actions calendar · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
