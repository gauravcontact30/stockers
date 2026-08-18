"use client";

import { useMemo, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { StockCombobox } from "./stock-combobox";
import { StockDetailTrigger } from "./stock-detail-provider";
import {
  chipFor,
  formatCrore,
  formatDayDate,
  formatQuantity,
  formatRupee,
  formatSignedPercent,
  relativeAge,
  sectorTone,
} from "./market-format";
import {
  MarketSection,
  Pager,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
  type Paged,
  type Prefetched,
} from "./market-section";
import { buildTrendingUrl } from "../lib/market-urls";
import type { BseTrendingBoard as BseTrendingPayload, BseTrendingRow, TrendingRank } from "../lib/bse-market";
import type { MarketSessionState } from "../lib/market-session";

/**
 * The three rankings, all of them the exchange's own.
 *
 * A fourth used to lead this list: a "most bought" tab ordered by a retail broker's published
 * buying list, with a row of broker pills under the filters and a broker tag on every matching
 * company. It is gone, and the section is now what its heading has always said it is — BSE, ranked
 * by BSE's figures, naming no other platform.
 *
 * That ranking was the one thing here that did not come from the exchange. It was honest about its
 * source, which is exactly why it had to name that source everywhere it appeared; the alternative —
 * keeping the ordering and dropping the attribution — would have presented one broker's customers
 * as retail at large. The three below need no such footnote: turnover, trade count and share volume
 * are published by the exchange for every scrip that traded.
 *
 * `TrendingRank` in ../lib/bse-market still admits "brokers" and the endpoint still serves it —
 * `investorFavouriteTrio` in ../lib/hero-trios ranks the hero's fourth slide on it, under its own
 * attribution. Nothing was removed from the data layer; this board just no longer offers it.
 */
const RANK_OPTIONS: { key: TrendingRank; label: string; short: string; note: string }[] = [
  { key: "turnover", label: "By turnover (₹)", short: "Turnover", note: "the rupees that changed hands" },
  { key: "trades", label: "By trade count", short: "Trades", note: "how many separate transactions were struck" },
  { key: "volume", label: "By volume (shares)", short: "Volume", note: "the number of shares that moved" },
];

const TIER_OPTIONS = [
  { key: "all", label: "All caps" },
  { key: "large", label: "Large cap" },
  { key: "mid", label: "Mid cap" },
  { key: "small", label: "Small cap" },
] as const;

const MOVE_OPTIONS = [
  { key: "0", label: "Any move" },
  { key: "2", label: "Moved 2%+" },
  { key: "5", label: "Moved 5%+" },
  { key: "10", label: "Moved 10%+" },
] as const;

type TierKey = (typeof TIER_OPTIONS)[number]["key"];
type MoveKey = (typeof MOVE_OPTIONS)[number]["key"];

// Both now live in ../lib/market-urls, so the server can build the same URL this board asks for
// when it prefetches the opening payload. Re-exported so existing importers are unaffected.
export { buildTrendingUrl };

/**
 * How often the board re-asks the server.
 *
 * A minute, in every session state, and the same minute the endpoint's own `Cache-Control` is sized
 * for — so a poll that lands inside the window is served from cache and costs the exchange nothing.
 * It is the rate the quote feed reprints at while the market is open, which is the case that has to
 * be fast. It is also, and this is the case that actually mattered, what rolls the board onto the
 * new session: BSE publishes the day's Bhavcopy in the evening, and a board that never refreshed
 * sat on the previous day's ranking until somebody happened to reload the page.
 *
 * Only ticks while the tab is being looked at — see `useMarketFeed`. A page left open in a
 * background tab overnight makes no requests at all.
 */
const REFRESH_MS = 60_000;

/**
 * What the status pill says, and how loudly.
 *
 * The board used to say "today" in its heading and nothing anywhere about which session its
 * figures came from. During market hours that was simply untrue: the ranking is built from the
 * last *completed* session's Bhavcopy, because that is the only file BSE publishes covering all
 * ~4,900 scrips, and today's copy holds a few dozen rows until the close. A reader looking at it
 * at noon was reading yesterday, told it was today.
 */
const SESSION_BADGE: Record<MarketSessionState, { label: string; tone: string; dot: string; pulse: boolean }> = {
  live: {
    label: "Market live",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
    pulse: true,
  },
  "pre-open": {
    label: "Pre-open",
    tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
    pulse: false,
  },
  closed: {
    label: "Market closed",
    tone: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    dot: "bg-slate-400",
    pulse: false,
  },
  holiday: {
    label: "Exchange holiday",
    tone: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    dot: "bg-slate-400",
    pulse: false,
  },
};

/** The figure the board is currently ranked by, drawn as the row's headline number. */
function rankValue(row: BseTrendingRow, rank: TrendingRank): string {
  if (rank === "turnover") return row.turnoverCr === null ? "—" : formatCrore(row.turnoverCr * 1e7);
  if (rank === "volume") return formatQuantity(row.volume);
  return formatQuantity(row.trades);
}

function shortcutName(name: string): string {
  return name.replace(/\s+(Limited|Ltd\.?|Company Ltd\.?)$/i, "").trim();
}

/** The live price where the feed has one, the session's close otherwise. */
function shownPrice(row: BseTrendingRow): number | null {
  return row.liveQuote?.price ?? row.price;
}

function shownChange(row: BseTrendingRow): number | null {
  return row.liveQuote ? row.liveQuote.changePercent : row.changePercent;
}

/** The exchange-open dot, reused by the status pill and by every live row. */
function LiveDot({ className = "bg-emerald-500", pulse = true }: { className?: string; pulse?: boolean }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${className}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${className}`} />
    </span>
  );
}

function StockShortcut({ row, active, onSelect }: { row: BseTrendingRow; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group flex min-h-[74px] min-w-[240px] max-w-[280px] flex-1 items-center gap-3 rounded-2xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/15 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-500/40"
      }`}
    >
      <CompanyLogo symbol={row.ticker} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{shortcutName(row.name)}</span>
          <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-400">{row.ticker}</span>
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {row.sector && <span className="truncate">{row.sector}</span>}
          {row.capTier && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {row.capTier}
            </span>
          )}
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
            {formatRupee(shownPrice(row))}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${chipFor(shownChange(row))}`}>
            {formatSignedPercent(shownChange(row))}
          </span>
        </span>
      </span>
    </button>
  );
}

/** One figure in the row's footer, so the four line up on a grid rather than by eye. */
function RowStat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 truncate tabular-nums ${
          emphasis ? "text-sm font-bold text-slate-900 dark:text-white" : "text-[13px] font-semibold text-slate-700 dark:text-slate-200"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function TrendingRow({ row, rank, position }: { row: BseTrendingRow; rank: TrendingRank; position: number }) {
  const live = row.liveQuote;
  const price = shownPrice(row);
  const change = shownChange(row);

  return (
    <li className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* The rank sits under the logo rather than beside it: it is the weakest thing in the row
              and was competing with the company for the leading edge. Muted for the same reason. */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            <CompanyLogo symbol={row.ticker} size={36} />
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400 dark:bg-slate-800/60 dark:text-slate-500">
              {position}
            </span>
          </div>
          <div className="min-w-0">
            <StockDetailTrigger symbol={row.ticker}>
              {/* The company's registered name leads, with the ticker and the scrip code — the two
                  identifiers a BSE reader actually quotes — under it. */}
              <p className="truncate text-sm font-bold text-slate-900 underline-offset-2 group-hover:underline dark:text-white">
                {row.name}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {row.ticker} · {row.code}
              </p>
            </StockDetailTrigger>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {row.sector && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(row.sector)}`}>
                  {row.sector}
                </span>
              )}
              {row.capTier && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {row.capTier} cap
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1.5 text-base font-bold tabular-nums text-slate-900 dark:text-white">
            {live && <LiveDot />}
            {formatRupee(price)}
          </p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(change)}`}>
            {formatSignedPercent(change)}
          </span>
          {/* Both numbers, never one dressed as the other: the ranking below was computed from the
              session close, so a row trading live has to show what it closed at as well. */}
          {live && (
            <p className="mt-1 text-[10px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
              Close {formatRupee(row.price)}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 sm:grid-cols-4 dark:border-slate-800">
        <RowStat label={RANK_OPTIONS.find((option) => option.key === rank)?.short ?? ""} value={rankValue(row, rank)} emphasis />
        <RowStat
          label="Share of BSE"
          value={row.turnoverShare === null ? "—" : `${row.turnoverShare.toFixed(2)}%`}
        />
        {/* Small average ticket beside heavy turnover is the retail-crowding tell. */}
        <RowStat
          label="Avg trade"
          value={row.averageTradeValue === null ? "—" : formatRupee(row.averageTradeValue, 0)}
        />
        <RowStat label="Day range" value={`${formatRupee(row.dayLow)} – ${formatRupee(row.dayHigh)}`} />
      </dl>
    </li>
  );
}

/** One headline figure above the board, describing the session rather than any single company. */
function SessionStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * The BSE stocks the session actually crowded into, searchable across the traded exchange.
 *
 * Every figure on this board is the exchange's own, with segment labels kept out of the landing UI.
 *
 * It is also deliberately not a "most searched" board. No venue publishes its search or order flow,
 * so ranking by it would mean inventing the numbers; `MostTraded` hit the same wall on the NSE side.
 *
 * Searching, filtering and paging are all server-side, because the traded universe is thousands of
 * rows and each rendered row costs an upstream sector lookup.
 *
 * Two clocks run through it, and keeping them apart is most of the design. The *ranking* is the
 * last completed session's, from the Bhavcopy — the only file that covers every scrip. The *prices*
 * are live while the exchange is open, for the ten rows on screen. The status pill, the session
 * date and the "Close ₹x" line under a live price exist so that no figure here is read as
 * something it is not.
 */
export function BseTrendingBoard({ prefetched }: { prefetched?: Prefetched<BseTrendingPayload> }) {
  // Turnover leads: of the three figures the exchange publishes it is the one that answers "where
  // did the session's money actually go", which is what this board is for. The opening rank is
  // mirrored by `OPENING` in ./streamed-trending-board — change one and the other must follow, or
  // the prefetched payload is not the page this board first renders.
  const [rank, setRank] = useState<TrendingRank>("turnover");
  const [term, setTerm] = useState("");
  const [tier, setTier] = useState<TierKey>("all");
  const [move, setMove] = useState<MoveKey>("0");

  // Same cursor derivation as `BseMoversBoard`: change any input and the reader is looking at a
  // different list, so the page falls back to 1 rather than being reset in an effect — the new list
  // never renders at the stale page first.
  const listKey = `${rank}|${term}|${tier}|${move}`;
  const [cursor, setCursor] = useState({ key: listKey, page: 1 });
  const page = cursor.key === listKey ? cursor.page : 1;

  // "all" for the broker facet the endpoint still accepts: this board no longer filters by one, and
  // passing "all" is what keeps it out of the query string entirely — see `buildTrendingUrl`.
  const url = buildTrendingUrl(rank, term, "all", "all", tier, move, page);
  /**
   * Whether the payload the page arrived with still owes us the live prices.
   *
   * The server renders this board's opening view into the HTML, which is what saves the reader a
   * round trip — but that render cannot reach the quote feed: its per-symbol memo is module-scoped,
   * and a cached render scope will not fill an entry from one. So during market hours the prefetched
   * payload comes back ranked, dated and correct, with no live half to its prices.
   *
   * Rather than drop a perfectly good payload and open on a skeleton, the board renders it and asks
   * the endpoint — which has no such limit — once more immediately. The rows are on screen the whole
   * time; the prices sharpen a round trip later.
   */
  const seed = prefetched && prefetched.url === url ? prefetched.data : null;
  const seedNeedsPrices = Boolean(
    seed && (
      // Ranked but unpriced: market hours, and the render pass could not reach the quote feed.
      (seed.marketSession === "live" && seed.liveAsOf === null) ||
      // Or nothing at all. A render that resolved no rows is indistinguishable on screen from an
      // exchange that has published nothing, and only one of those is worth a reader's patience —
      // so the board asks the endpoint, which keeps its own copy of the day, before believing it.
      seed.rows.length === 0
    ),
  );
  const { data, loading, error } = useMarketFeed<BseTrendingPayload>(url, prefetched, {
    refreshMs: REFRESH_MS,
    refreshNow: seedNeedsPrices,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const active = RANK_OPTIONS.find((option) => option.key === rank);
  const filtered = term.length > 0 || tier !== "all" || move !== "0";
  // Nothing is claimed about the session until the payload that describes it has arrived: the
  // badge below is rendered only when `data` is, so this fallback never reaches the screen.
  const badge = SESSION_BADGE[data?.marketSession ?? "closed"];

  const clearFilters = () => {
    setTerm("");
    setTier("all");
    setMove("0");
  };

  // One string rather than interpolated fragments: it is a sentence, and a reader copying it out of
  // the page should get the sentence rather than a row of orphaned numbers.
  const summary = useMemo(() => {
    if (!data || data.rows.length === 0) return null;

    const rising = data.rows.filter((row) => (row.changePercent ?? 0) > 0).length;
    const share = data.rows.reduce((sum, row) => sum + (row.turnoverShare ?? 0), 0);

    return `${rising} of ${data.rows.length} on this page rising · they are ${share.toFixed(1)}% of the session's traded value across ${formatQuantity(data.totals.traded)} scrips.`;
  }, [data]);

  const paged: Paged<BseTrendingRow> = {
    page: data?.page ?? 1,
    pages: data?.pages ?? 1,
    slice: rows,
    setPage: (next) => setCursor({ key: listKey, page: next }),
    from: data && rows.length ? (data.page - 1) * data.pageSize + 1 : 0,
    to: data ? (data.page - 1) * data.pageSize + rows.length : 0,
    total: data?.total ?? 0,
  };

  return (
    <MarketSection
      id="bse-trending"
      eyebrow="Trending on BSE"
      title="What BSE crowded into today"
      blurb="Where the session's money actually went, ranked by the exchange's own figures — rupee turnover, transaction count and share volume."
      aside={
        <div className="flex flex-col items-start gap-2 lg:items-end">
          {data && (
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${badge.tone}`}
            >
              <LiveDot className={badge.dot} pulse={badge.pulse} />
              {badge.label}
            </span>
          )}
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            {data ? `${data.total.toLocaleString("en-IN")} traded` : "Loading BSE…"}
          </div>
          {data?.sessionDate && (
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Ranked on the session of {formatDayDate(data.sessionDate)}
            </p>
          )}
        </div>
      }
    >
      {/* Not `PillTabs`: each ranking needs a sentence saying what it measures, because the three
          produce genuinely different boards and the difference is the point. */}
      <div
        className="mt-5 inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/60"
        role="group"
        aria-label="Ranking method"
      >
        {RANK_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setRank(option.key)}
            aria-pressed={rank === option.key}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              rank === option.key
                ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {active && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Ranked by {active.note}.</p>}

      {/* The session in four numbers, above the list rather than buried under it. A reader who
          wants "how big was the day" should not have to add up ten rows to find out. */}
      {data && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SessionStat label="Session turnover" value={formatCrore(data.totals.turnoverCr * 1e7)} hint="all traded scrips" />
          <SessionStat label="Scrips traded" value={formatQuantity(data.totals.traded)} hint="of the whole exchange" />
          <SessionStat label="Trades struck" value={formatQuantity(data.totals.trades)} hint="transactions" />
          <SessionStat
            label={data.liveAsOf ? "Prices live" : "Prices"}
            value={data.liveAsOf ? relativeAge(data.liveAsOf) : "At session close"}
            hint={data.liveAsOf ? "for the rows below" : formatDayDate(data.sessionDate)}
          />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* The exchange-wide type-ahead, so a company can be found by name without knowing its
            ticker. Selecting a row sets the term; the box itself is a plain input underneath, so a
            partial name that matches nothing in the catalogue is still searched for on the board. */}
        <div className="lg:w-96">
          <StockCombobox value={term} onChange={setTerm} placeholder="Search any BSE company, ticker or scrip code" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="trending-tier">
            Market cap tier
          </label>
          <select
            id="trending-tier"
            value={tier}
            onChange={(event) => setTier(event.target.value as TierKey)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {TIER_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="trending-move">
            Minimum move
          </label>
          <select
            id="trending-move"
            value={move}
            onChange={(event) => setMove(event.target.value as MoveKey)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {MOVE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>

          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-stretch gap-2" role="group" aria-label="Popular stock shortcuts">
        <button
          type="button"
          onClick={() => setTerm("")}
          aria-pressed={term === ""}
          className={`min-h-[74px] rounded-2xl border px-4 text-sm font-bold transition ${
            term === ""
              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          All Platform
        </button>
        {rows.slice(0, 6).map((row) => (
          <StockShortcut key={row.code} row={row} active={term.toUpperCase() === row.ticker.toUpperCase()} onSelect={() => setTerm(row.ticker)} />
        ))}
      </div>

      {summary && <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{summary}</p>}

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-32" />}

      {!loading && rows.length > 0 && (
        <>
          <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {paged.slice.map((row, index) => (
              // Ranks run on across pages: the first row of page two is the 11th most traded.
              <TrendingRow key={row.code} row={row} rank={rank} position={paged.from + index} />
            ))}
          </ul>
          <Pager paged={paged} unit="stocks" />
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
          {filtered && "No traded BSE stock matches those filters this session."}
          {/* One empty state now, rather than two. Every ranking this board offers is read from the
              same exchange file, so there is only one thing that can be missing and one thing to
              say about it — the broker-feed arm went with the broker ranking. */}
          {!filtered &&
            "BSE hasn't published a complete session file yet — this board fills in once the day's Bhavcopy lands."}
        </p>
      )}

      <SectionFootnote>
        Ranked from BSE&apos;s own end-of-session Bhavcopy across all ~4,900 listed scrips, for the session named above —
        today&apos;s file covers the whole exchange only after the close. While the market is open, the price and move on
        each row are live and the ranking behind them is the last completed session&apos;s. No broker publishes its search
        or order flow, so &quot;trending&quot; here means traded activity on the exchange rather than searches on any one
        platform · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
