"use client";

import { useState } from "react";
import { CompanyLogo } from "./company-logo";
import {
  chipFor,
  formatDayDate,
  formatQuantity,
  formatRupee,
  formatSignedPercent,
  sectorTone,
  toneFor,
} from "./market-format";
import { MarketSection, PillTabs, SectionError, SectionFootnote, SectionSkeleton, useMarketFeed } from "./market-section";

export type BseCapTier = "Large" | "Mid" | "Small";

export type BseMoverRow = {
  code: string;
  ticker: string;
  name: string;
  group: string;
  capTier: BseCapTier | null;
  rank: number | null;
  marketCapCr: number | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
};

type Breadth = { advancing: number; declining: number; unchanged: number; traded: number };

export type BseBoardResponse = {
  summary: {
    listed: number;
    priced: number;
    totalMarketCapCr: number;
    breadth: Breadth;
    byTier: Record<BseCapTier, { count: number; breadth: Breadth; averageChangePercent: number | null }>;
    sessionDate: string | null;
  };
};

type TierKey = "all" | "large" | "mid" | "small";

const TIER_OPTIONS: { key: TierKey; label: string }[] = [
  { key: "all", label: "Whole exchange" },
  { key: "large", label: "Large cap" },
  { key: "mid", label: "Mid cap" },
  { key: "small", label: "Small cap" },
];

const TIER_FOR_KEY: Record<Exclude<TierKey, "all">, BseCapTier> = { large: "Large", mid: "Mid", small: "Small" };

/** The share of traded scrips that rose, as a 0-100 width for the breadth bar. */
export function advancePercent(breadth: Breadth): number {
  if (!breadth.traded) return 0;
  return (breadth.advancing / breadth.traded) * 100;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

export function BreadthBar({ breadth }: { breadth: Breadth }) {
  const advancing = advancePercent(breadth);

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums">
        <span className="text-emerald-600 dark:text-emerald-400">{breadth.advancing.toLocaleString("en-IN")} advancing</span>
        <span className="text-rose-600 dark:text-rose-400">{breadth.declining.toLocaleString("en-IN")} declining</span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <span className="bg-emerald-500 transition-all duration-500" style={{ width: `${advancing}%` }} aria-hidden="true" />
        <span className="flex-1 bg-rose-500" aria-hidden="true" />
      </div>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        {breadth.unchanged.toLocaleString("en-IN")} unchanged · {breadth.traded.toLocaleString("en-IN")} scrips traded
      </p>
    </div>
  );
}

export function MoverRow({ row, rank }: { row: BseMoverRow; rank: number }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {rank}
      </span>

      <CompanyLogo symbol={row.ticker} size={34} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{row.ticker}</p>
          {row.capTier && (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {row.capTier}
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{row.name}</p>
        {row.sector && (
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(row.sector)}`}>
            {row.sector}
          </span>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(row.price)}</p>
        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(row.changePercent)}`}>
          {formatSignedPercent(row.changePercent)}
        </span>
        <p className="mt-0.5 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{formatQuantity(row.volume)} shares</p>
      </div>
    </li>
  );
}

export type BseMoverPage = {
  rows: BseMoverRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
};

export function buildMoversUrl(tier: TierKey, direction: "gainers" | "losers", page: number) {
  return `/api/market/bse/movers?tier=${tier}&direction=${direction}&page=${page}`;
}

/**
 * One direction of the day's movers, paged on its own.
 *
 * Gainers and losers page independently because they are two separate questions — a reader deep
 * into the losers has no reason to lose their place among the gainers. Paging is server-side:
 * the full list runs to thousands of names and each row's sector costs an upstream call, so only
 * the five on screen are ever resolved.
 */
function MoverList({
  title,
  tone,
  tier,
  direction,
  emptyNote,
}: {
  title: string;
  tone: string;
  tier: TierKey;
  direction: "gainers" | "losers";
  emptyNote: string;
}) {
  // The tier is carried alongside the page so that switching cap tier starts this list again at
  // its sharpest mover, derived rather than reset in an effect — page four of the large caps is
  // not a sensible place to land in the small caps.
  const [cursor, setCursor] = useState({ tier, page: 1 });
  const page = cursor.tier === tier ? cursor.page : 1;
  const setPage = (next: number) => setCursor({ tier, page: next });

  const { data, loading, error } = useMarketFeed<BseMoverPage>(buildMoversUrl(tier, direction, page));
  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className={`text-sm font-bold uppercase tracking-wide ${tone}`}>{title}</h4>
        {data && (
          <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {data.total.toLocaleString("en-IN")} in all
          </p>
        )}
      </div>

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={3} height="h-20" />}

      {!loading && rows.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {rows.map((row, index) => (
              // Ranks run on across pages: the first row of page two is the sixth biggest move.
              <MoverRow key={row.code} row={row} rank={(data!.page - 1) * data!.pageSize + index + 1} />
            ))}
          </ul>

          {data!.pages > 1 && (
            <nav aria-label={`${title} pages`} className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPage(data!.page - 1)}
                disabled={data!.page <= 1}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                ← Prev
              </button>
              <p className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                Page {data!.page.toLocaleString("en-IN")} of {data!.pages.toLocaleString("en-IN")}
              </p>
              <button
                type="button"
                onClick={() => setPage(data!.page + 1)}
                disabled={data!.page >= data!.pages}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                Next →
              </button>
            </nav>
          )}
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{emptyNote}</p>
      )}
    </div>
  );
}

/**
 * The whole BSE in one board: how many companies are listed, how the session's breadth split, and
 * the ten biggest moves each way — for the exchange as a whole and for each cap tier.
 *
 * Cap tiers follow SEBI's definition (top 100 companies by market capitalisation are large cap,
 * the next 150 mid cap, the rest small cap), computed from BSE's own market-cap data rather than
 * guessed from index membership.
 */
export function BseMarketBoard() {
  const { data, loading, error } = useMarketFeed<BseBoardResponse>("/api/market/bse");
  const [tier, setTier] = useState<TierKey>("all");

  const summary = data?.summary;
  const tierStats = tier === "all" ? null : summary?.byTier[TIER_FOR_KEY[tier]];
  const breadth = tierStats?.breadth ?? summary?.breadth;

  return (
    <MarketSection
      id="bse-board"
      eyebrow="BSE market research"
      title="Every listed BSE company, ranked by the day's move"
      blurb="Every gainer and every loser on the exchange, five at a time and sharpest first, for the market as a whole and within each cap tier — with the sector each company trades in. Built from BSE's own scrip master and end-of-session Bhavcopy, so nothing is sampled or estimated."
      aside={
        <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400">
          {summary ? `${summary.listed.toLocaleString("en-IN")} listed companies` : "Loading BSE…"}
        </div>
      }
    >
      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={3} height="h-28" />}

      {summary && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Listed companies"
              value={summary.listed.toLocaleString("en-IN")}
              sub={`${summary.priced.toLocaleString("en-IN")} traded this session`}
            />
            <StatTile label="Total market cap" value={`₹${(summary.totalMarketCapCr / 1e5).toFixed(1)} lakh Cr`} sub="Sum of every listed company" />
            <StatTile
              label="Large / Mid / Small"
              value={`${summary.byTier.Large.count} · ${summary.byTier.Mid.count} · ${summary.byTier.Small.count.toLocaleString("en-IN")}`}
              sub="SEBI cap classification"
            />
            <StatTile label="Session" value={formatDayDate(summary.sessionDate)} sub="BSE Bhavcopy, official close" />
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
            {breadth && <BreadthBar breadth={breadth} />}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <PillTabs
              options={TIER_OPTIONS.map((option) => ({
                ...option,
                count: option.key === "all" ? summary.listed : summary.byTier[TIER_FOR_KEY[option.key]].count,
              }))}
              value={tier}
              onChange={setTier}
              label="Market capitalisation tier"
            />
            {tierStats && (
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Tier average{" "}
                <span className={`tabular-nums ${toneFor(tierStats.averageChangePercent)}`}>
                  {formatSignedPercent(tierStats.averageChangePercent)}
                </span>
              </p>
            )}
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <MoverList
              title="Gainers"
              tone="text-emerald-600 dark:text-emerald-400"
              tier={tier}
              direction="gainers"
              emptyNote="No stock in this tier closed higher this session."
            />
            <MoverList
              title="Losers"
              tone="text-rose-600 dark:text-rose-400"
              tier={tier}
              direction="losers"
              emptyNote="No stock in this tier closed lower this session."
            />
          </div>
        </>
      )}

      <SectionFootnote>
        Prices from BSE&apos;s official Bhavcopy for {formatDayDate(summary?.sessionDate)}; market caps and listings from
        BSE&apos;s scrip master. Cap tiers follow SEBI&apos;s rule — top 100 by market capitalisation are large cap, the next
        150 mid cap, the remainder small cap · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
