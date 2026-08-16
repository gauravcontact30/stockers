"use client";

import { useMemo, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { StockCombobox } from "./stock-combobox";
import { StockDetailTrigger } from "./stock-detail-provider";
import { chipFor, formatCrore, formatQuantity, formatRupee, formatSignedPercent, sectorTone } from "./market-format";
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
// Values from ./bse-platform, types from ./bse-market: the latter reaches the network and Next's
// cache, so a client component may only ever take erased types from it.
import { BSE_PLATFORMS, PLATFORM_NOTE, bsePlatform, type BsePlatform } from "../lib/bse-platform";
import { TRENDING_PAGE_SIZE, buildTrendingUrl } from "../lib/market-urls";
import type { BseTrendingBoard as BseTrendingPayload, BseTrendingRow, TrendingRank } from "../lib/bse-market";

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
type PlatformKey = BsePlatform | "all";

// Both now live in ../lib/market-urls, so the server can build the same URL this board asks for
// when it prefetches the opening payload. Re-exported so existing importers are unaffected.
export { buildTrendingUrl };
const PAGE_SIZE = TRENDING_PAGE_SIZE;

const PLATFORM_TONE: Record<BsePlatform, string> = {
  "Main Board": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  SME: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "X Group": "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "Trade-to-Trade": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Z Group": "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

/** The figure the board is currently ranked by, drawn as the row's headline number. */
function rankValue(row: BseTrendingRow, rank: TrendingRank): string {
  if (rank === "turnover") return row.turnoverCr === null ? "—" : formatCrore(row.turnoverCr * 1e7);
  if (rank === "volume") return formatQuantity(row.volume);
  return formatQuantity(row.trades);
}

export function TrendingRow({ row, rank, position }: { row: BseTrendingRow; rank: TrendingRank; position: number }) {
  const platform = bsePlatform(row.group);

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
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
              <p className="truncate text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
                {row.name}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {row.ticker} · {row.code}
              </p>
            </StockDetailTrigger>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {platform && (
                <span
                  title={PLATFORM_NOTE[platform]}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PLATFORM_TONE[platform]}`}
                >
                  BSE {platform}
                </span>
              )}
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
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(row.price)}</p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(row.changePercent)}`}
          >
            {formatSignedPercent(row.changePercent)}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[11px] sm:grid-cols-4 dark:border-slate-800">
        <div>
          <dt className="text-slate-400 dark:text-slate-500">{RANK_OPTIONS.find((o) => o.key === rank)?.label}</dt>
          <dd className="mt-0.5 font-bold tabular-nums text-slate-900 dark:text-white">{rankValue(row, rank)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Share of BSE turnover</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {row.turnoverShare === null ? "—" : `${row.turnoverShare.toFixed(2)}%`}
          </dd>
        </div>
        <div>
          {/* Small average ticket beside heavy turnover is the retail-crowding tell. */}
          <dt className="text-slate-400 dark:text-slate-500">Avg trade size</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {row.averageTradeValue === null ? "—" : formatRupee(row.averageTradeValue, 0)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Day range</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">
            {formatRupee(row.dayLow)} – {formatRupee(row.dayHigh)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * The BSE stocks the session actually crowded into, searchable across the traded exchange.
 *
 * Every figure on this board is the exchange's own, and no other platform is named anywhere on it.
 * The only "platform" a row carries is the BSE segment it is listed and traded on — main board,
 * SME, X, T or Z — which the exchange states through the group letter on every scrip.
 *
 * It is also deliberately not a "most searched" board. No venue publishes its search or order flow,
 * so ranking by it would mean inventing the numbers; `MostTraded` hit the same wall on the NSE side.
 *
 * Searching, filtering and paging are all server-side, because the traded universe is thousands of
 * rows and each rendered row costs an upstream sector lookup.
 */
export function BseTrendingBoard({ prefetched }: { prefetched?: Prefetched<BseTrendingPayload> }) {
  // Turnover leads: of the three figures the exchange publishes it is the one that answers "where
  // did the session's money actually go", which is what this board is for. The opening rank is
  // mirrored by `OPENING` in ./streamed-trending-board — change one and the other must follow, or
  // the prefetched payload is not the page this board first renders.
  const [rank, setRank] = useState<TrendingRank>("turnover");
  const [term, setTerm] = useState("");
  const [platform, setPlatform] = useState<PlatformKey>("all");
  const [tier, setTier] = useState<TierKey>("all");
  const [move, setMove] = useState<MoveKey>("0");

  // Same cursor derivation as `BseMoversBoard`: change any input and the reader is looking at a
  // different list, so the page falls back to 1 rather than being reset in an effect — the new list
  // never renders at the stale page first.
  const listKey = `${rank}|${term}|${platform}|${tier}|${move}`;
  const [cursor, setCursor] = useState({ key: listKey, page: 1 });
  const page = cursor.key === listKey ? cursor.page : 1;

  // "all" for the broker facet the endpoint still accepts: this board no longer filters by one, and
  // passing "all" is what keeps it out of the query string entirely — see `buildTrendingUrl`.
  const url = buildTrendingUrl(rank, term, platform, "all", tier, move, page);
  const { data, loading, error } = useMarketFeed<BseTrendingPayload>(url, prefetched);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const active = RANK_OPTIONS.find((option) => option.key === rank);
  const filtered = term.length > 0 || platform !== "all" || tier !== "all" || move !== "0";

  const clearFilters = () => {
    setTerm("");
    setPlatform("all");
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
      blurb="Where the session's money actually went, ranked by the exchange's own figures — rupee turnover, transaction count and share volume. Every company carries the BSE platform it is listed on."
      aside={
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          {data ? `${data.total.toLocaleString("en-IN")} traded` : "Loading BSE…"}
        </div>
      }
    >
      {/* Not `PillTabs`: each ranking needs a sentence saying what it measures, because the three
          produce genuinely different boards and the difference is the point. */}
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Ranking method">
        {RANK_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setRank(option.key)}
            aria-pressed={rank === option.key}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              rank === option.key
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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

      {/* Faceted platform chips, each carrying how many of the current matches it would leave. */}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="BSE platform">
        <button
          type="button"
          onClick={() => setPlatform("all")}
          aria-pressed={platform === "all"}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            platform === "all"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          All platforms
        </button>
        {BSE_PLATFORMS.map((each) => {
          const facet = data?.platforms.find((entry) => entry.platform === each);
          // A platform nothing matches is still drawn, disabled, so the set of segments the
          // exchange has does not appear to change as the reader filters.
          const count = facet?.count ?? 0;
          return (
            <button
              key={each}
              type="button"
              disabled={count === 0}
              title={PLATFORM_NOTE[each]}
              onClick={() => setPlatform(each)}
              aria-pressed={platform === each}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                platform === each
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              BSE {each}
              <span className="ml-1.5 tabular-nums opacity-60">{count.toLocaleString("en-IN")}</span>
            </button>
          );
        })}
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
        Ranked from BSE&apos;s own end-of-session Bhavcopy across all ~4,900 listed scrips, with each company&apos;s BSE
        segment taken from its exchange group letter. No broker publishes its search or order flow, so
        &quot;trending&quot; here means traded activity on the exchange rather than searches on any one platform · not
        investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
