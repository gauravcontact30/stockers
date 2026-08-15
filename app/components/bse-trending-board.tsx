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
import { PUBLISHING_BROKERS, type BrokerId, type PublishingBroker } from "../lib/brokers";
import type { BseTrendingBoard as BseTrendingPayload, BseTrendingRow, TrendingRank } from "../lib/bse-market";

/**
 * The tab's wording for the broker ranking.
 *
 * One publishing broker means the tab can name it outright — "Most bought on Groww" says exactly
 * what the board is. Two or more cannot be named in a tab, so it generalises. Either way the verb
 * is the broker's own: bought, never searched.
 *
 * Exported because which arm applies depends on the registry, and only one of them can be reached
 * at a time from the app itself.
 */
export function brokerRankLabel(brokers: readonly PublishingBroker[]): string {
  return brokers.length === 1 ? brokers[0].feed.label : "Most bought on brokers";
}

const BROKER_RANK_LABEL = brokerRankLabel(PUBLISHING_BROKERS);

const RANK_OPTIONS: { key: TrendingRank; label: string; note: string }[] = [
  {
    key: "brokers",
    label: BROKER_RANK_LABEL,
    note: `where ${PUBLISHING_BROKERS.map((each) => each.name).join(" and ")} place each company on their own published buying lists, most bought first`,
  },
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
type BrokerKey = BrokerId | "all";

const PAGE_SIZE = 10;

/** A light background per broker, so each platform reads as itself across the board. */
const BROKER_TONE: Record<BrokerId, { pill: string; selected: string }> = {
  groww: {
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
    selected: "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500",
  },
  zerodha: {
    pill: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30",
    selected: "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500",
  },
  "angel-one": {
    pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
    selected: "bg-amber-600 text-white border-amber-600 dark:bg-amber-500 dark:border-amber-500",
  },
  upstox: {
    pill: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30",
    selected: "bg-violet-600 text-white border-violet-600 dark:bg-violet-500 dark:border-violet-500",
  },
  "icici-direct": {
    pill: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
    selected: "bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:border-rose-500",
  },
};

const PLATFORM_TONE: Record<BsePlatform, string> = {
  "Main Board": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  SME: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "X Group": "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  "Trade-to-Trade": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Z Group": "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export function buildTrendingUrl(
  rank: TrendingRank,
  term: string,
  platform: PlatformKey,
  broker: BrokerKey,
  tier: TierKey,
  move: MoveKey,
  page: number,
): string {
  const params = new URLSearchParams({ rank, page: String(page), pageSize: String(PAGE_SIZE) });
  if (term) params.set("q", term);
  if (platform !== "all") params.set("platform", platform);
  if (broker !== "all") params.set("broker", broker);
  if (tier !== "all") params.set("tier", tier);
  if (move !== "0") params.set("min", move);
  return `/api/market/bse/trending?${params.toString()}`;
}

/** The figure the board is currently ranked by, drawn as the row's headline number. */
function rankValue(row: BseTrendingRow, rank: TrendingRank): string {
  if (rank === "brokers") return row.brokerRank === null ? "—" : `#${row.brokerRank}`;
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
              {/* The broker's own label and its own placing — "most bought", because that is what
                  Groww publishes. Never restated as "most searched", which nobody publishes. */}
              {row.brokers.map((pick) => (
                <span
                  key={pick.broker}
                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                >
                  {pick.label} #{pick.rank}
                </span>
              ))}
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
 * This is deliberately not a "most searched on Groww / Angel One / Zerodha" board. No broker
 * publishes its search or order flow, so ranking by it would mean inventing the numbers;
 * `MostTraded` hit the same wall on the NSE side. The platform shown against each company is the
 * BSE segment it is listed and traded on — main board, SME, X, T or Z — which the exchange does
 * state, through the group letter carried on every scrip.
 *
 * Searching, filtering and paging are all server-side, because the traded universe is thousands of
 * rows and each rendered row costs an upstream sector lookup.
 */
export function BseTrendingBoard({ prefetched }: { prefetched?: Prefetched<BseTrendingPayload> }) {
  // Opens on what retail is buying rather than on exchange turnover: the turnover board is led by
  // whichever institutions moved size today, which is not the question a visitor to the landing
  // page is asking. The exchange rankings are one tab away.
  const [rank, setRank] = useState<TrendingRank>("brokers");
  const [term, setTerm] = useState("");
  const [platform, setPlatform] = useState<PlatformKey>("all");
  const [broker, setBroker] = useState<BrokerKey>("all");
  const [tier, setTier] = useState<TierKey>("all");
  const [move, setMove] = useState<MoveKey>("0");

  // Same cursor derivation as `BseMoversBoard`: change any input and the reader is looking at a
  // different list, so the page falls back to 1 rather than being reset in an effect — the new list
  // never renders at the stale page first.
  const listKey = `${rank}|${term}|${platform}|${broker}|${tier}|${move}`;
  const [cursor, setCursor] = useState({ key: listKey, page: 1 });
  const page = cursor.key === listKey ? cursor.page : 1;

  const url = buildTrendingUrl(rank, term, platform, broker, tier, move, page);
  const { data, loading, error } = useMarketFeed<BseTrendingPayload>(url, prefetched);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const active = RANK_OPTIONS.find((option) => option.key === rank);
  const filtered = term.length > 0 || platform !== "all" || broker !== "all" || tier !== "all" || move !== "0";

  const clearFilters = () => {
    setTerm("");
    setPlatform("all");
    setBroker("all");
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
      blurb="What retail is buying on BSE, most bought first, taken from the brokers' own published lists — or ranked instead by the exchange's figures for rupee turnover, transaction count and share volume. Every company carries the BSE platform it is listed on."
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

      {/* Broker coverage, stated in full rather than only where it exists. Every tracked platform
          is named; the four that publish nothing say so, because a platform silently missing from
          this row would read as an oversight rather than as a fact about the platform. */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Broker lists
          </span>
          <button
            type="button"
            onClick={() => setBroker("all")}
            aria-pressed={broker === "all"}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              broker === "all"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            All BSE
          </button>
          {/* Only the platforms that actually publish a list. The rest are tracked in ./brokers
              with the reason each carries no data, but a pill that can never be selected is not
              worth the row it takes. */}
          {PUBLISHING_BROKERS.map((each) => {
            const tone = BROKER_TONE[each.id];
            return (
              <button
                key={each.id}
                type="button"
                title={`${each.feed?.label} · ${each.blurb}`}
                onClick={() => setBroker(each.id)}
                aria-pressed={broker === each.id}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  broker === each.id ? tone.selected : tone.pill
                }`}
              >
                {each.name}
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Shown under each broker&apos;s own wording for its list. No broker publishes a most-<em>searched</em> ranking —
          that is in-app telemetry nobody exposes — so nothing on this board is presented as one.
        </p>
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
          {/* Distinct from the exchange boards being empty: here the exchange file may be fine and
              it is the broker's own page that could not be read, which is a different failure and
              a different thing for the reader to do about it. */}
          {!filtered &&
            (rank === "brokers"
              ? `No broker list could be read this session — ${BROKER_RANK_LABEL} is published on the broker's own site, and that page did not answer. The exchange rankings above are unaffected.`
              : "BSE hasn't published a complete session file yet — this board fills in once the day's Bhavcopy lands.")}
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
