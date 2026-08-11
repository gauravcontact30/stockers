"use client";

import { useMemo, useState } from "react";
import { buildSectorMoversUrl, type MoverDirection } from "../lib/market-urls";
import type { BseMoverRow } from "./bse-movers-board";
import { CategoryIcon } from "./category-icon";
import { CompanyLogo } from "./company-logo";
import { StockDetailTrigger } from "./stock-detail-provider";
import { chipFor, formatDayDate, formatRupee, formatSignedPercent, sectorTone } from "./market-format";
import {
  MarketSection,
  Pager,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
  type Prefetched,
  usePaged,
  type Paged,
} from "./market-section";

export type BseSectorSummary = {
  sector: string;
  stocks: number;
  gainers: number;
  losers: number;
  /** Up 5% or more — the category's standout performers. */
  star: number;
  /** Down 5% or more — the ones lagging it. */
  red: number;
  /** A grouping we keep ourselves rather than one BSE publishes. */
  house: boolean;
};

type SortKey = "az" | "stocks" | "gainers" | "losers" | "star";
type ShowKey = "all" | "mapped";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "A to Z" },
  { key: "stocks", label: "Most stocks" },
  { key: "gainers", label: "Most gainers" },
  { key: "losers", label: "Most losers" },
  { key: "star", label: "Most leading" },
];

const SHOW_OPTIONS: { key: ShowKey; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "mapped", label: "With stocks only" },
];

export type BseSectorBoardResponse = {
  sectors: BseSectorSummary[];
  unclassified: number;
  classification: { done: number; total: number; ready: boolean };
  sessionDate: string | null;
};

export type BseMoverPage = {
  rows: BseMoverRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  sessionDate: string | null;
};

type Direction = MoverDirection;

/** Categories shown per page in the list itself. */
export const CATEGORIES_PER_PAGE = 10;

// Re-exported from ../lib/market-urls, where the server can reach it too; every existing import of
// it from this module still resolves.
export { buildSectorMoversUrl };

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

/**
 * The category list as the reader asked to see it.
 *
 * Searching, filtering and sorting all happen here rather than at the endpoint: this is two dozen
 * rows already in the browser, and a round trip to reorder them would be slower than the typing.
 */
function arrangeCategories(
  sectors: BseSectorSummary[],
  term: string,
  sort: SortKey,
  show: ShowKey,
): BseSectorSummary[] {
  const needle = term.trim().toLowerCase();

  const visible = sectors
    .filter((summary) => !needle || summary.sector.toLowerCase().includes(needle))
    .filter((summary) => show === "all" || summary.stocks > 0);

  const ranked = [...visible];
  ranked.sort((a, b) => {
    if (sort === "az") return a.sector.localeCompare(b.sector);
    const by = sort === "stocks" ? "stocks" : sort === "gainers" ? "gainers" : sort === "losers" ? "losers" : "star";
    // Ties fall back to the name, so equal categories keep a stable, readable order.
    return b[by] - a[by] || a.sector.localeCompare(b.sector);
  });

  return ranked;
}

/** One labelled select in the category toolbar. */
function CategorySelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <label className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="cursor-pointer bg-transparent py-1 text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} className="text-slate-900">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A mover inside a category block — narrower than the main table, so identity and move only. */
export function CategoryMoverRow({ row, rank }: { row: BseMoverRow; rank: number }) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950/40">
      <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">{rank}</span>
      <CompanyLogo symbol={row.ticker} size={28} />
      <StockDetailTrigger symbol={row.ticker} className="flex-1">
        <p className="truncate text-xs font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">{row.ticker}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{row.name}</p>
      </StockDetailTrigger>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{formatRupee(row.price)}</p>
        <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${chipFor(row.changePercent)}`}>
          {formatSignedPercent(row.changePercent)}
        </span>
      </div>
    </li>
  );
}

/**
 * One direction inside one category, paged on its own.
 *
 * The request only goes out for a category the reader has opened: with twenty-odd categories on
 * screen, fetching both directions of all of them on mount would be forty requests for a page
 * nobody has scrolled yet.
 */
function CategoryList({ category, direction }: { category: string; direction: Direction }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useMarketFeed<BseMoverPage>(buildSectorMoversUrl(category, direction, page));

  const rows = data?.rows ?? [];
  const gaining = direction === "gainers";

  const paged: Paged<BseMoverRow> = {
    page: data?.page ?? 1,
    pages: data?.pages ?? 1,
    slice: rows,
    setPage,
    from: data && rows.length ? (data.page - 1) * data.pageSize + 1 : 0,
    to: data ? (data.page - 1) * data.pageSize + rows.length : 0,
    total: data?.total ?? 0,
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className={`text-xs font-bold uppercase tracking-wide ${gaining ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {gaining ? "Most gainers" : "Most losers"}
        </h4>
        {data && <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{count(data.total)} in all</p>}
      </div>

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={3} height="h-12" />}

      {!loading && rows.length > 0 && (
        <>
          <ul className="mt-2 space-y-1.5">
            {rows.map((row, index) => (
              <CategoryMoverRow key={row.code} row={row} rank={paged.from + index} />
            ))}
          </ul>
          <Pager paged={paged} unit={gaining ? "gainers" : "losers"} />
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Nothing in this category closed {gaining ? "higher" : "lower"} this session.
        </p>
      )}
    </div>
  );
}

/**
 * One figure of a category's matrix.
 *
 * A column of number over label rather than a bordered box: five boxes in a row read as five
 * separate controls, and the eye has to enter each one to find its figure. Stacked and separated
 * by a hairline, the five numbers line up on one baseline and can be compared at a glance — which
 * is the only thing anyone does with them.
 */
function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  const displayLabel = label.includes("leading") ? "leaders" : label.includes("lagging") ? "laggards" : label;

  return (
    <span className="flex min-w-[62px] flex-col items-end gap-0.5 border-l border-slate-200 px-3 first:border-l-0 first:pl-0 dark:border-slate-800">
      <span className={`text-base font-semibold tabular-nums ${tone}`}>{count(value)}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {displayLabel}
      </span>
    </span>
  );
}

/**
 * How the session split inside one category, as a proportion rather than two numbers.
 *
 * Two figures say 340 rose and 260 fell; the bar says at a glance that the category leaned green,
 * which is what a reader scanning twenty rows is actually after.
 */
function BreadthBar({ gainers, losers }: { gainers: number; losers: number }) {
  const traded = gainers + losers;
  if (traded === 0) return null;

  const advancing = (gainers / traded) * 100;

  return (
    <span
      aria-hidden="true"
      className="flex h-1 w-full max-w-56 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
    >
      <span className="h-full bg-emerald-500" style={{ width: `${advancing}%` }} />
      <span className="h-full bg-rose-500" style={{ width: `${100 - advancing}%` }} />
    </span>
  );
}

/** The open/closed marker. An SVG rather than ▸/▾, which render at a different weight per platform. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${open ? "rotate-90" : ""}`}
    >
      <path d="m8 5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A category, closed to its matrix and opened to both sides of its session. */
function CategoryBlock({
  summary,
  open,
  onToggle,
}: {
  summary: BseSectorSummary;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `sector-panel-${summary.sector.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white transition-colors dark:bg-slate-950/40 ${
        open
          ? "border-violet-300 shadow-[0_18px_44px_-30px_rgba(109,40,217,0.55)] dark:border-violet-500/40"
          : "border-slate-200 shadow-[0_14px_38px_-30px_rgba(15,23,42,0.55)] hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`grid w-full grid-cols-1 gap-4 px-4 py-3.5 text-left transition md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
          open ? "bg-violet-50/40 dark:bg-violet-500/5" : "hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Chevron open={open} />
          {/* The category's colour moves off its name and onto its own mark: twenty filled
              name-pills down the page compete with the figures they are meant to label, while a
              tile gives each row a fixed left edge for the eye to run down — and the glyph says
              which industry it is before the name is read. */}
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${sectorTone(summary.sector)}`}
          >
            <CategoryIcon category={summary.sector} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{summary.sector}</span>
              {summary.house && (
                // Said plainly: BSE publishes no data-centre industry, so this grouping is ours.
                <span className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  our grouping
                </span>
              )}
            </span>
            <span className="mt-1 flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {summary.stocks === 0 ? "Classification pending" : `${count(summary.stocks)} mapped stocks`}
              </span>
              <BreadthBar gainers={summary.gainers} losers={summary.losers} />
            </span>
          </span>
        </span>

        {summary.stocks === 0 ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No company mapped yet
          </span>
        ) : (
          // No `shrink-0` here: it and `flex-wrap` pull against each other — the span kept its full
          // unwrapped width, so on a phone the last two figures were cropped away by the card's
          // `overflow-hidden` with no way to scroll to them. Allowed to shrink, the figures wrap
          // onto a second row instead.
          <span className="flex flex-wrap items-start justify-end gap-y-3">
            <Metric label="stocks" value={summary.stocks} tone="text-slate-900 dark:text-white" />
            <Metric label="gainers" value={summary.gainers} tone="text-emerald-600 dark:text-emerald-400" />
            <Metric label="losers" value={summary.losers} tone="text-rose-600 dark:text-rose-400" />
            <Metric label="★ leading" value={summary.star} tone="text-amber-600 dark:text-amber-400" />
            <Metric label="▼ lagging" value={summary.red} tone="text-red-600 dark:text-red-400" />
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/60">
          {summary.stocks === 0 ? (
            // Nothing to ask the endpoint for yet, so it is not asked.
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No company has been classified into this category yet. It fills in as the exchange is walked.
            </p>
          ) : (
            // grid-cols-1 is not redundant with the single implicit column it replaces: an implicit
            // track is sized `auto`, so it grew to its rows' min-content (357px) and was then
            // cropped by the card's `overflow-hidden`. `grid-cols-1` is `minmax(0, 1fr)`, which
            // caps the track at the card's width and lets the rows truncate as they were built to.
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <CategoryList category={summary.sector} direction="gainers" />
              <CategoryList category={summary.sector} direction="losers" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The session, category by category.
 *
 * BSE classifies a company's sector one company at a time, so the whole exchange is mapped by a
 * background walk (see lib/bse-sectors). That means this board can be honest rather than partial:
 * while the walk runs it says how far it has got, and every category it does show is complete for
 * the companies mapped so far. Opening a category pages through all of it — every name that rose
 * and every name that fell — rather than a top few.
 */
export function BseSectorMovers({ prefetched }: { prefetched?: Prefetched<BseSectorBoardResponse> }) {
  // Bumped by the refresh control to re-ask while the exchange is still being classified.
  const [nonce, setNonce] = useState(0);
  const { data, loading, error } = useMarketFeed<BseSectorBoardResponse>(
    nonce === 0 ? "/api/market/bse/sectors" : `/api/market/bse/sectors?t=${nonce}`,
    prefetched,
  );

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [show, setShow] = useState<ShowKey>("all");

  // Null means "not chosen yet"; "" means the reader closed the one that was open. Left to itself
  // the board opens the first category that actually has companies in it — alphabetically first is
  // not much use while the walk is still filling the early letters in.
  const [choice, setChoice] = useState<string | null>(null);
  const sectors = useMemo(
    () => arrangeCategories(data?.sectors ?? [], search, sort, show),
    [data, search, sort, show],
  );

  // Ten a page. The exchange publishes over twenty categories and each one opens into two paged
  // boards of its own, so the whole list at once was a long scroll before the reader reached the
  // one they came for. The key resets to page one whenever the list underneath becomes a
  // different list — otherwise a search that narrows to three rows leaves you on an empty page 3.
  const paged = usePaged(sectors, CATEGORIES_PER_PAGE, `${search}|${sort}|${show}`);

  const openSector = choice ?? paged.slice.find((summary) => summary.stocks > 0)?.sector ?? "";
  const progress = data?.classification;
  const filtered = search.trim().length > 0 || sort !== "az" || show !== "all";

  const resetFilters = () => {
    setSearch("");
    setSort("az");
    setShow("all");
    setChoice(null);
  };

  return (
    <MarketSection
      id="bse-sectors"
      eyebrow="Category wise"
      eyebrowClass="text-violet-600 dark:text-violet-400"
      title="Most gainers and most losers, category by category"
      blurb="Every category the exchange publishes, listed A to Z with every classified company counted into it. Open one to page through all of it — every name in that category that closed higher, and every name that closed lower."
      aside={
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400">
          {data ? `${count(sectors.length)} categories` : "Loading BSE…"}
        </div>
      }
    >
      {progress && !progress.ready && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-500/10">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Classifying the exchange — <span className="font-semibold tabular-nums">{count(progress.done)}</span> of{" "}
            <span className="font-semibold tabular-nums">{count(progress.total)}</span> companies mapped so far. BSE
            publishes a sector one company at a time, so the categories below fill in as the walk runs.
          </p>
          <button
            type="button"
            onClick={() => setNonce(Date.now())}
            className="shrink-0 rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-500 dark:border-amber-500/40 dark:text-amber-300"
          >
            Refresh categories
          </button>
        </div>
      )}

      {/* The same toolbar shape the movers board uses, so the two sections are operated the same
          way — search, two filters, and a reset, on one line. */}
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/50">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Search categories</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search categories"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <CategorySelect label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
        <CategorySelect label="Show" value={show} options={SHOW_OPTIONS} onChange={setShow} />
        <button
          type="button"
          onClick={resetFilters}
          disabled={!filtered}
          className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          Clear filters
        </button>
      </div>

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-14" />}

      {!loading && sectors.length > 0 && (
        <>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Showing{" "}
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
              {count(paged.from)}–{count(paged.to)}
            </span>{" "}
            of <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{count(paged.total)}</span>{" "}
            categories
            {search.trim() && <> matching &ldquo;{search.trim()}&rdquo;</>}
          </p>

          <div className="mt-2 space-y-2">
            {paged.slice.map((summary) => (
              <CategoryBlock
                key={summary.sector}
                summary={summary}
                open={summary.sector === openSector}
                onToggle={() => setChoice(summary.sector === openSector ? "" : summary.sector)}
              />
            ))}
          </div>

          <Pager paged={paged} unit="categories" />
        </>
      )}

      {!loading && sectors.length === 0 && !error && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-950/40">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {filtered
              ? `No category matches ${search.trim() ? `“${search.trim()}”` : "these filters"}.`
              : "No category is mapped yet — the classification has only just started. It fills in within a few minutes."}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              Reset search
            </button>
          )}
        </div>
      )}

      <SectionFootnote>
        ★ leading counts the companies up 5% or more on the session; ▼ lagging counts those down 5% or more.
        Categories are BSE&apos;s own sector classification, plus Data Centers as a grouping of ours, read per company from the exchange and refreshed daily;
        prices are from the official Bhavcopy for {formatDayDate(data?.sessionDate)}.
        {data && data.unclassified > 0 && ` ${count(data.unclassified)} traded companies are not in a category yet.`} Not
        investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
