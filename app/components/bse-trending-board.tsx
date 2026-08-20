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
import type {
  BseTrendingBoard as BseTrendingPayload,
  BseTrendingRow,
  TrendingDirection,
  TrendingRank,
} from "../lib/bse-market";
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
const RANK_OPTIONS: { key: TrendingRank; label: string; note: string }[] = [
  { key: "turnover", label: "By turnover (₹)", note: "the rupees that changed hands" },
  { key: "trades", label: "By trade count", note: "how many separate transactions were struck" },
  { key: "volume", label: "By volume (shares)", note: "the number of shares that moved" },
];

/**
 * What a row calls its headline figure, for every ranking the payload type admits.
 *
 * A table rather than a lookup into `RANK_OPTIONS` above, because that list is the three rankings
 * this board *offers* and `TrendingRank` still admits a fourth — the broker placing, which the
 * endpoint serves for the hero. `rankValue` falls back to the trade count for it, so the label does
 * too; the alternative was a blank heading over a real number.
 */
const RANK_SHORT: Record<TrendingRank, string> = {
  brokers: "Trades",
  turnover: "Turnover",
  trades: "Trades",
  volume: "Volume",
};

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
 * How often the boards re-ask while the exchange is actually open.
 *
 * Half a minute rather than a whole one, because during a session this is the number the reader is
 * watching: the prices on every row are live, and a board that repainted them once a minute was
 * visibly behind the tape it claims to be tracking.
 *
 * Thirty and not less, deliberately. The endpoint answers with `max-age=30`, so a faster poll would
 * mostly be served out of the browser's own cache — the same rows again, at the cost of a request
 * and a re-render each time. This is the fastest cadence that actually returns new figures.
 */
const LIVE_REFRESH_MS = 30_000;

/**
 * The two halves of the tape, as the section draws them.
 *
 * "Bought" and "sold" are the sign of the session's move and nothing more — no exchange publishes
 * a buy/sell split, so the alternative to this substitution is not a better board, it is no board.
 * Each side says so in its own subtitle rather than leaving the words to be read as order flow.
 */
const SIDES: {
  direction: Exclude<TrendingDirection, "all">;
  title: string;
  note: string;
  chrome: string;
  accent: string;
}[] = [
  {
    direction: "bought",
    title: "Most bought",
    note: "Trading above the previous close — money going in",
    chrome: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/25 dark:bg-emerald-500/5",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  {
    direction: "sold",
    title: "Most sold",
    note: "Trading below the previous close — money coming out",
    chrome: "border-rose-200 bg-rose-50/50 dark:border-rose-500/25 dark:bg-rose-500/5",
    accent: "text-rose-700 dark:text-rose-300",
  },
];

/** The trailing windows the return column offers, and what each one is labelled on a row. */
const RETURN_OPTIONS = [
  { key: "1m", label: "Return: 1 month" },
  { key: "1y", label: "Return: 1 year" },
  { key: "3y", label: "Return: 3 years" },
  { key: "5y", label: "Return: 5 years" },
] as const;

type ReturnKey = (typeof RETURN_OPTIONS)[number]["key"];

/** The same four windows as a row's column heading — "1M return", "3Y return". */
const RETURN_SHORT: Record<ReturnKey, string> = { "1m": "1M", "1y": "1Y", "3y": "3Y", "5y": "5Y" };

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
      {/* `preferReal`: the extra real-image sources are tried before the drawn monogram, because
          this rail is a row of companies a reader is meant to recognise at a glance. */}
      <CompanyLogo symbol={row.ticker} size={40} preferReal />
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

/** One figure in the row's footer, so the six line up on a grid rather than by eye. */
function RowStat({
  label,
  value,
  emphasis = false,
  /** Green or red where the figure is a return; left plain for counts and rupee amounts. */
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "up" | "down";
}) {
  const colour = tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : "";

  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 truncate tabular-nums ${
          emphasis ? "text-sm font-bold text-slate-900 dark:text-white" : "text-[13px] font-semibold text-slate-700 dark:text-slate-200"
        } ${colour}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function TrendingRow({
  row,
  rank,
  position,
  returnLabel,
}: {
  row: BseTrendingRow;
  rank: TrendingRank;
  position: number;
  /** The window the row's return column reports — "1M", "3Y" and so on. */
  returnLabel: string;
}) {
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
            <CompanyLogo symbol={row.ticker} size={36} preferReal />
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

      {/* Five figures, three to a row on anything wider than a phone. The board sits in a
          half-width panel now, so four across was two truncated columns rather than four readable
          ones — and the ranked figure being first is what keeps it the one that reads as the
          headline whichever ranking is selected. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 sm:grid-cols-3 dark:border-slate-800">
        <RowStat label={RANK_SHORT[rank]} value={rankValue(row, rank)} emphasis />
        {/* The window the reader picked, measured against this company's own close in that session.
            A dash means the company is younger than the window, which is a fact rather than a gap. */}
        <RowStat
          label={`${returnLabel} return`}
          value={formatSignedPercent(row.returnPercent)}
          tone={row.returnPercent === null ? undefined : row.returnPercent >= 0 ? "up" : "down"}
        />
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

/**
 * One side of the section — the scrips being bought up, or the ones being sold off.
 *
 * Presentational: the feed lives in `BseTrendingBoard` above it, because the section header has to
 * say which session both boards are ranked on and it cannot ask a child for that. What this owns is
 * the panel, its rows, its own empty state and its own pager, so the two sides page independently —
 * a reader three pages into the selling board does not lose their place by turning the buying one.
 */
function TrendingSide({
  side,
  data,
  loading,
  updating,
  error,
  rank,
  returnLabel,
  filtered,
  page,
  onPage,
}: {
  side: (typeof SIDES)[number];
  data: BseTrendingPayload | null;
  loading: boolean;
  updating: boolean;
  error: string | null;
  rank: TrendingRank;
  returnLabel: string;
  filtered: boolean;
  page: number;
  onPage: (next: number) => void;
}) {
  const rows = data?.rows ?? [];

  const paged: Paged<BseTrendingRow> = {
    page: data?.page ?? page,
    pages: data?.pages ?? 1,
    slice: rows,
    setPage: onPage,
    from: data && rows.length ? (data.page - 1) * data.pageSize + 1 : 0,
    to: data ? (data.page - 1) * data.pageSize + rows.length : 0,
    total: data?.total ?? 0,
  };

  return (
    <section className={`rounded-3xl border p-4 ${side.chrome}`} aria-label={`${side.title} on BSE this session`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`text-base font-bold ${side.accent}`}>{side.title}</h4>
          {/* The substitution, stated on the board rather than left in the word "bought". */}
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{side.note}</p>
        </div>
        <p className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          {data ? `${data.total.toLocaleString("en-IN")} stocks` : "…"}
          {/* Rows stay on screen while a filter change is in flight — see `useMarketFeed`. Saying so
              is what keeps them from being read as the answer to filters the reader has moved past. */}
          {updating && <span className="ml-1 font-medium text-slate-400">updating…</span>}
        </p>
      </div>

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={3} height="h-32" />}

      {!loading && rows.length > 0 && (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {paged.slice.map((row, index) => (
              // Ranks run on across pages: the first row of page two is the sixth most traded.
              <TrendingRow key={row.code} row={row} rank={rank} position={paged.from + index} returnLabel={returnLabel} />
            ))}
          </ul>
          <Pager paged={paged} unit="stocks" />
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {filtered
            ? `No ${side.direction === "bought" ? "rising" : "falling"} BSE stock matches those filters this session.`
            : "BSE hasn't published a complete session file yet — this board fills in once the day's Bhavcopy lands."}
        </p>
      )}
    </section>
  );
}

/**
 * The BSE stocks the session actually crowded into and out of, searchable across the traded exchange.
 *
 * Two boards rather than one, standing side by side: what the exchange crowded *into* and what it
 * crowded *out of*. A single activity board answered neither question — a stock being dumped prints
 * exactly as busy a tape as one being bought, so the old ranking put both in the same list under a
 * heading that read as buying. The split is the sign of the session's move and nothing more, and
 * each side says so under its own title, because no exchange publishes a buy/sell figure and the
 * honest alternative to this substitution is not a better board but no board at all.
 *
 * Every figure here is the exchange's own, with segment labels kept out of the landing UI. It is
 * also deliberately not a "most searched" board. No venue publishes its search or order flow, so
 * ranking by it would mean inventing the numbers; `MostTraded` hit the same wall on the NSE side.
 *
 * Searching, filtering and paging are all server-side, because the traded universe is thousands of
 * rows and each rendered row costs an upstream sector lookup. The filters are shared and the pages
 * are not: one search, one cap tier and one return window describe both sides of the same question,
 * whereas a page number is a place in one particular list.
 *
 * Two clocks run through it, and keeping them apart is most of the design. The *ranking* is the
 * last completed session's, from the Bhavcopy — the only file that covers every scrip. The *prices*
 * are live while the exchange is open, for the rows on screen, and refresh twice as often then as
 * they do outside the session. The status pill, the session date and the "Close ₹x" line under a
 * live price exist so that no figure here is read as something it is not.
 */
export function BseTrendingBoard({
  prefetched,
  soldPrefetched,
}: {
  /** The buying board's opening payload, resolved on the server. */
  prefetched?: Prefetched<BseTrendingPayload>;
  /** The selling board's, which is a second query and therefore a second payload. */
  soldPrefetched?: Prefetched<BseTrendingPayload>;
}) {
  // Turnover leads: of the three figures the exchange publishes it is the one that answers "where
  // did the session's money actually go", which is what this board is for. The opening rank is
  // mirrored by `OPENING` in ./streamed-trending-board — change one and the other must follow, or
  // the prefetched payload is not the page this board first renders.
  const [rank, setRank] = useState<TrendingRank>("turnover");
  const [term, setTerm] = useState("");
  const [tier, setTier] = useState<TierKey>("all");
  const [move, setMove] = useState<MoveKey>("0");
  const [period, setPeriod] = useState<ReturnKey>("1m");

  // Same cursor derivation as `BseMoversBoard`: change any input and the reader is looking at a
  // different list, so the page falls back to 1 rather than being reset in an effect — the new list
  // never renders at the stale page first. One cursor per side, because they are two lists.
  const listKey = `${rank}|${term}|${tier}|${move}|${period}`;
  const [boughtCursor, setBoughtCursor] = useState({ key: listKey, page: 1 });
  const [soldCursor, setSoldCursor] = useState({ key: listKey, page: 1 });
  const boughtPage = boughtCursor.key === listKey ? boughtCursor.page : 1;
  const soldPage = soldCursor.key === listKey ? soldCursor.page : 1;

  // "all" for the platform and broker facets the endpoint still accepts: this board no longer
  // filters by either, and passing "all" is what keeps them out of the query string — see
  // `buildTrendingUrl`.
  const boughtUrl = buildTrendingUrl(rank, term, "all", "all", tier, move, boughtPage, "bought", period);
  const soldUrl = buildTrendingUrl(rank, term, "all", "all", tier, move, soldPage, "sold", period);

  /**
   * Whether a payload the page arrived with still owes us the live prices.
   *
   * The server renders both boards' opening views into the HTML, which is what saves the reader a
   * round trip — but that render cannot reach the quote feed: its per-symbol memo is module-scoped,
   * and a cached render scope will not fill an entry from one. So during market hours the prefetched
   * payloads come back ranked, dated and correct, with no live half to their prices.
   *
   * Rather than drop a perfectly good payload and open on a skeleton, the board renders it and asks
   * the endpoint — which has no such limit — once more immediately. The rows are on screen the whole
   * time; the prices sharpen a round trip later.
   */
  const needsPrices = (seed: Prefetched<BseTrendingPayload> | undefined, url: string) => {
    const data = seed && seed.url === url ? seed.data : null;
    return Boolean(
      data &&
        // Ranked but unpriced: market hours, and the render pass could not reach the quote feed.
        ((data.marketSession === "live" && data.liveAsOf === null) ||
          // Or nothing at all. A render that resolved no rows is indistinguishable on screen from an
          // exchange that has published nothing, and only one of those is worth a reader's patience
          // — so the board asks the endpoint, which keeps its own copy of the day, before believing it.
          data.rows.length === 0),
    );
  };

  /**
   * What the exchange is doing, and therefore how often both sides re-ask.
   *
   * Held in state rather than derived from the feeds below, for the plain reason that it has to be
   * decided *before* the hooks that would tell us: the cadence is an argument to them. The server's
   * prefetched payload answers it on the first render, and the effect below corrects it the moment a
   * fetched payload disagrees — which is what rolls the boards onto the faster cadence at 09:15 and
   * back off it at 15:30 without a reload.
   *
   * The server's answer rather than the browser's throughout: a reader's clock can be in any zone or
   * simply wrong, and the holiday list is server configuration.
   */
  const [session, setSession] = useState<MarketSessionState>(
    prefetched?.data.marketSession ?? soldPrefetched?.data.marketSession ?? "closed",
  );
  const refreshMs = session === "live" ? LIVE_REFRESH_MS : REFRESH_MS;

  const boughtFeed = useMarketFeed<BseTrendingPayload>(boughtUrl, prefetched, {
    refreshMs,
    refreshNow: needsPrices(prefetched, boughtUrl),
  });
  const soldFeed = useMarketFeed<BseTrendingPayload>(soldUrl, soldPrefetched, {
    refreshMs,
    refreshNow: needsPrices(soldPrefetched, soldUrl),
  });

  /**
   * Adopting the session the payload reported, during render rather than in an effect.
   *
   * This is React's own "adjusting state when a prop changes" escape hatch, and it is the right one
   * here for the reason that pattern exists: an effect would paint one frame at the old cadence
   * before correcting it, and — more to the point — `refreshMs` is an *argument* to the hooks above,
   * so a correction that lands after they have run has already missed them. React re-runs this
   * component immediately on seeing the call, before committing anything, so the feeds are armed
   * with the right interval on the same pass.
   */
  const reported = boughtFeed.data?.marketSession ?? soldFeed.data?.marketSession ?? null;
  if (reported !== null && reported !== session) setSession(reported);

  const active = RANK_OPTIONS.find((option) => option.key === rank);
  const returnLabel = RETURN_SHORT[period];
  const filtered = term.length > 0 || tier !== "all" || move !== "0";
  // Nothing is claimed about the session until a payload that describes it has arrived: the badge
  // below is rendered only when one has, so this fallback never reaches the screen.
  const badge = SESSION_BADGE[session];
  const dated = boughtFeed.data ?? soldFeed.data;

  // The return window is deliberately not cleared with the rest. It narrows nothing — every row is
  // still on the board whichever window is selected — so it is a choice about what a row *reports*,
  // and resetting it would undo a reader's reading preference along with their search.
  const clearFilters = () => {
    setTerm("");
    setTier("all");
    setMove("0");
  };

  // One string rather than interpolated fragments: it is a sentence, and a reader copying it out of
  // the page should get the sentence rather than a row of orphaned numbers.
  const summary = useMemo(() => {
    if (!dated) return null;

    const rising = boughtFeed.data?.total ?? 0;
    const falling = soldFeed.data?.total ?? 0;
    if (rising + falling === 0) return null;

    return `${rising.toLocaleString("en-IN")} BSE stocks closed above their previous close this session and ${falling.toLocaleString("en-IN")} closed below it, across ${formatQuantity(dated.totals.traded)} scrips that traded.`;
  }, [boughtFeed.data, soldFeed.data, dated]);

  // The shortcut rail names companies from the buying board, which is the one a reader lands on.
  const shortcuts = boughtFeed.data?.rows ?? [];

  return (
    <MarketSection
      id="bse-trending"
      eyebrow="Trending on BSE"
      title={dated?.sessionDate ? `What BSE crowded into on ${formatDayDate(dated.sessionDate)}` : "What BSE crowded into today"}
      blurb="Both halves of the session's money, ranked by the exchange's own figures — rupee turnover, transaction count and share volume — split into the stocks being bought up and the ones being sold off."
      aside={
        <div className="flex flex-col items-start gap-2 lg:items-end">
          {dated && (
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${badge.tone}`}
            >
              <LiveDot className={badge.dot} pulse={badge.pulse} />
              {badge.label}
            </span>
          )}
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
            {dated ? `${dated.totals.traded.toLocaleString("en-IN")} traded` : "Loading BSE…"}
          </div>
          {dated?.sessionDate && (
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Ranked on the session of {formatDayDate(dated.sessionDate)}
            </p>
          )}
          {/* How often what is on screen is being replaced, which is only worth saying while it
              genuinely is — outside the session nothing about these boards changes. */}
          {session === "live" && (
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Prices refresh every {Math.round(LIVE_REFRESH_MS / 1000)}s while the market is open
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

          {/* The trailing window each row reports beside the session's own figures. A stock can be
              the day's busiest and still be down over three years, and that is worth seeing on the
              same row rather than on another page. */}
          <label className="sr-only" htmlFor="trending-return">
            Return period
          </label>
          <select
            id="trending-return"
            value={period}
            onChange={(event) => setPeriod(event.target.value as ReturnKey)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {RETURN_OPTIONS.map((option) => (
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
        {shortcuts.slice(0, 5).map((row) => (
          <StockShortcut key={row.code} row={row} active={term.toUpperCase() === row.ticker.toUpperCase()} onSelect={() => setTerm(row.ticker)} />
        ))}
      </div>

      {summary && <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{summary}</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendingSide
          side={SIDES[0]}
          data={boughtFeed.data}
          loading={boughtFeed.loading}
          updating={boughtFeed.updating}
          error={boughtFeed.error}
          rank={rank}
          returnLabel={returnLabel}
          filtered={filtered}
          page={boughtPage}
          onPage={(next) => setBoughtCursor({ key: listKey, page: next })}
        />
        <TrendingSide
          side={SIDES[1]}
          data={soldFeed.data}
          loading={soldFeed.loading}
          updating={soldFeed.updating}
          error={soldFeed.error}
          rank={rank}
          returnLabel={returnLabel}
          filtered={filtered}
          page={soldPage}
          onPage={(next) => setSoldCursor({ key: listKey, page: next })}
        />
      </div>

      <SectionFootnote>
        Ranked from BSE&apos;s own end-of-session Bhavcopy across all ~4,900 listed scrips, for the session named above —
        today&apos;s file covers the whole exchange only after the close. While the market is open, the price and move on
        each row are live and the ranking behind them is the last completed session&apos;s. &quot;Bought&quot; and
        &quot;sold&quot; are the direction of that session&apos;s move, not order flow: no exchange or depository publishes
        a buy/sell split. Returns are measured against each company&apos;s own close in the reference session · not
        investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
