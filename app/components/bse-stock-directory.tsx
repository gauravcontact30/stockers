"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AiBoardRead } from "./ai-board-read";
import type { BseCapTier, BseMoverRow } from "./bse-movers-board";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatCrore, formatRupee, formatSignedPercent, sectorTone } from "./market-format";
import { MarketSection, PillTabs, SectionError, SectionFootnote, SectionSkeleton, useMarketFeed } from "./market-section";
import type { BoardBrief } from "../lib/board-read";

type DirectoryRow = BseMoverRow & { isin: string; previousClose: number | null };

export type BseDirectoryResponse = {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  sessionDate: string | null;
};

type TierFilter = "all" | BseCapTier;
type SortKey = "mcap" | "change" | "price" | "name";

const TIER_OPTIONS: { key: TierFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Large", label: "Large cap" },
  { key: "Mid", label: "Mid cap" },
  { key: "Small", label: "Small cap" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "mcap", label: "Market cap" },
  { key: "change", label: "Day change" },
  { key: "price", label: "Price" },
  { key: "name", label: "Name" },
];

// Long enough that typing a company name is one request rather than one per keystroke.
const SEARCH_DEBOUNCE_MS = 350;

export function buildDirectoryUrl(term: string, tier: TierFilter, sort: SortKey, direction: "asc" | "desc", page: number) {
  const params = new URLSearchParams({ sort, direction, page: String(page) });
  if (term) params.set("q", term);
  if (tier !== "all") params.set("tier", tier);
  return `/api/market/bse/stocks?${params.toString()}`;
}

/** The slice of the universe currently on screen, as figures. */
export function directoryBrief(rows: DirectoryRow[], total: number, tier: TierFilter, term: string): BoardBrief | null {
  if (rows.length === 0) return null;

  const priced = rows.filter((row): row is DirectoryRow & { changePercent: number } => row.changePercent !== null);
  const rising = priced.filter((row) => row.changePercent > 0).length;

  return {
    subject: term
      ? `BSE-listed companies matching "${term}"`
      : `BSE-listed companies${tier === "all" ? "" : `, ${tier.toLowerCase()} cap only`}, largest first`,
    question: "What kind of companies are these, and how are they trading?",
    facts: [
      { label: "Companies matched", value: total.toLocaleString("en-IN") },
      { label: "On this page", value: String(rows.length) },
      { label: "Trading higher", value: `${rising} of ${priced.length}` },
    ],
    highlights: rows
      .slice(0, 4)
      .map(
        (row) =>
          `${row.ticker} (${row.name}, ${row.sector ?? "unclassified"}, ${row.capTier ?? "untiered"} cap): ${formatRupee(row.price)}, ${formatSignedPercent(row.changePercent)} on the day`,
      ),
  };
}

/**
 * A directory of every company listed on BSE, searchable by name, ticker, scrip code or ISIN.
 *
 * The universe runs to nearly five thousand names, so the filtering, sorting and paging all
 * happen server-side; the browser only ever holds one page.
 */
export function BseStockDirectory() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [sort, setSort] = useState<SortKey>("mcap");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Settling the search box also returns to page one — but only for a real edit. On mount there
  // is nothing to settle, and resetting then would yank back a page the reader had already
  // turned to a moment earlier.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) {
      typed.current = true;
      return;
    }

    const timer = setTimeout(() => {
      setTerm(input.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const url = useMemo(() => buildDirectoryUrl(term, tier, sort, direction, page), [term, tier, sort, direction, page]);
  const { data, loading, error } = useMarketFeed<BseDirectoryResponse>(url);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;
  const brief = useMemo(() => directoryBrief(rows, total, tier, term), [rows, total, tier, term]);

  const changeSort = (key: SortKey) => {
    // Re-picking the active column flips it; a new column starts in the direction that reads
    // naturally for it — biggest first for numbers, A-Z for names.
    if (key === sort) {
      setDirection((previous) => (previous === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setDirection(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  };

  return (
    <MarketSection
      id="bse-directory"
      eyebrow="Company directory"
      title="Look up any BSE-listed company"
      blurb="Search all listed companies by name, ticker, scrip code or ISIN. Every row carries the sector, cap tier, market capitalisation and the latest session's price."
      aside={
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
          {total.toLocaleString("en-IN")} companies
        </div>
      }
    >
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative flex-1 lg:max-w-md">
          <span className="sr-only">Search BSE companies</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Try RELIANCE, 500325 or INE002A01018"
            className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>
        <PillTabs options={TIER_OPTIONS} value={tier} onChange={(key) => { setTier(key); setPage(1); }} label="Cap tier" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Sort by</span>
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => changeSort(option.key)}
            aria-pressed={sort === option.key}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              sort === option.key
                ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-400"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300"
            }`}
          >
            {option.label}
            {sort === option.key && <span aria-hidden="true"> {direction === "asc" ? "↑" : "↓"}</span>}
          </button>
        ))}
      </div>

      <AiBoardRead feature="directory" brief={brief} />

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={3} height="h-12" />}

      {!loading && rows.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                <th scope="col" className="py-2 pr-3 font-medium">Company</th>
                <th scope="col" className="py-2 pr-3 font-medium">Sector</th>
                <th scope="col" className="py-2 pr-3 font-medium">Tier</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Market cap</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Price</th>
                <th scope="col" className="py-2 text-right font-medium">Day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-950/50">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo symbol={row.ticker} size={32} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white">{row.ticker}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {row.name} · {row.code}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    {row.sector ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(row.sector)}`}>{row.sector}</span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {row.capTier ?? "—"}
                    {row.rank !== null && <span className="ml-1 text-slate-400 dark:text-slate-500">#{row.rank}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {row.marketCapCr === null ? "—" : formatCrore(row.marketCapCr * 1e7)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatRupee(row.price)}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(row.changePercent)}`}>
                      {formatSignedPercent(row.changePercent)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          No listed company matches “{term}”. Try a ticker, a six-digit scrip code, or an ISIN.
        </p>
      )}

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={data.page <= 1}
            className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            ← Previous
          </button>
          <p className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            Page {data.page.toLocaleString("en-IN")} of {data.pages.toLocaleString("en-IN")}
          </p>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={data.page >= data.pages}
            className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
          >
            Next →
          </button>
        </div>
      )}

      <SectionFootnote>
        Listings, market caps and ISINs from BSE&apos;s scrip master; prices from the same session&apos;s Bhavcopy. Companies
        that did not trade in the session show no price · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
