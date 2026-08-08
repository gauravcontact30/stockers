"use client";

import { useMemo, useState } from "react";
import { AiBoardRead } from "./ai-board-read";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatCrore, formatQuantity, formatRupee, formatSignedPercent, toneFor } from "./market-format";
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

export type EtfRow = {
  symbol: string;
  tracks: string;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  turnover: number | null;
  nav: number | null;
  premiumPercent: number | null;
  changePercent30d: number | null;
  changePercent365d: number | null;
};

export type EtfGroup = {
  key: string;
  name: string;
  description: string;
  etfs: EtfRow[];
  totalTurnover: number;
};

export type EtfBoardData = { groups: EtfGroup[]; live: boolean };

/**
 * An ETF trading above its NAV costs more than the assets behind it. Beyond about half a percent
 * that is worth flagging, because it is a cost the buyer pays on entry and does not get back.
 */
export function premiumLabel(premium: number | null): { text: string; tone: string } | null {
  if (typeof premium !== "number" || !Number.isFinite(premium)) return null;
  if (Math.abs(premium) < 0.5) return null;

  return premium > 0
    ? { text: `${premium.toFixed(2)}% above NAV`, tone: "text-amber-600 dark:text-amber-400" }
    : { text: `${Math.abs(premium).toFixed(2)}% below NAV`, tone: "text-emerald-600 dark:text-emerald-400" };
}

export type EtfSort = "return" | "turnover";

export const ETF_SORTS: { key: EtfSort; label: string }[] = [
  { key: "return", label: "Best returning first" },
  { key: "turnover", label: "Most traded first" },
];

/**
 * The return a fund is ranked on: a year where there is one, falling back to a month and then to
 * today. A fund listed three weeks ago has no annual figure, and dropping it to the bottom of the
 * board would be ranking it on missing data rather than on a poor result.
 */
export function etfReturn(etf: EtfRow): number | null {
  for (const value of [etf.changePercent365d, etf.changePercent30d, etf.changePercent]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** Which window the ranking figure came from, so the card can label it honestly. */
export function etfReturnWindow(etf: EtfRow): string {
  if (typeof etf.changePercent365d === "number") return "1 year";
  if (typeof etf.changePercent30d === "number") return "1 month";
  return "today";
}

/** Best-returning first, with unrated funds last rather than sorted as if they returned zero. */
export function sortEtfs(etfs: EtfRow[], sort: EtfSort): EtfRow[] {
  if (sort === "turnover") return [...etfs].sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0));

  return [...etfs].sort((a, b) => {
    const left = etfReturn(a);
    const right = etfReturn(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    return right - left;
  });
}

/** One asset class of funds, as figures. */
export function etfBrief(group: EtfGroup | undefined): BoardBrief | null {
  if (!group || group.etfs.length === 0) return null;

  const rising = group.etfs.filter((etf) => (etf.changePercent ?? 0) > 0).length;

  return {
    subject: `${group.name} ETFs listed on NSE, ranked by rupee turnover`,
    question: "What is this asset class doing, and is any of it expensive to buy into right now?",
    facts: [
      { label: "Funds in this class", value: String(group.etfs.length) },
      { label: "Traded today", value: formatCrore(group.totalTurnover) },
      { label: "Trading higher", value: `${rising} of ${group.etfs.length}` },
    ],
    highlights: group.etfs
      .slice(0, 4)
      .map(
        (etf) =>
          `${etf.symbol}: ${formatSignedPercent(etf.changePercent)} today, ${formatSignedPercent(etf.changePercent365d)} over a year, ${premiumLabel(etf.premiumPercent)?.text ?? "trading at around NAV"}`,
      ),
  };
}

function EtfCard({ etf, rank }: { etf: EtfRow; rank: number }) {
  const premium = premiumLabel(etf.premiumPercent);

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {rank}
          </span>
          <CompanyLogo symbol={etf.symbol} size={34} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{etf.symbol}</p>
            <p className="line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{etf.tracks}</p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(etf.lastPrice)}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(etf.changePercent)}`}>
            {formatSignedPercent(etf.changePercent)}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-[11px] sm:grid-cols-4 dark:border-slate-800">
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Turnover</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatCrore(etf.turnover)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Units traded</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatQuantity(etf.volume)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">NAV</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-800 dark:text-slate-200">{formatRupee(etf.nav)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Return · {etfReturnWindow(etf)}</dt>
          <dd className={`mt-0.5 font-semibold tabular-nums ${toneFor(etfReturn(etf))}`}>
            {formatSignedPercent(etfReturn(etf))}
          </dd>
        </div>
      </dl>

      {premium && <p className={`mt-2 text-[11px] font-semibold ${premium.tone}`}>Trading {premium.text}</p>}
    </li>
  );
}

/**
 * ETFs grouped by what they hold — gold, silver, Nifty 50, international and the rest — with each
 * group ranked by rupee turnover.
 *
 * "Most bought" is turnover, not net inflows: nobody publishes buy-versus-sell order flow for an
 * ETF, so the honest measure is how much money changed hands, and the section says so.
 */
export function EtfBoard() {
  const { data, loading, error } = useMarketFeed<EtfBoardData>("/api/market/etf-board");
  const [active, setActive] = useState<string | null>(null);

  const [sort, setSort] = useState<EtfSort>("return");

  const groups = data?.groups ?? [];
  const selected = groups.find((group) => group.key === active) ?? groups[0];
  const ordered = useMemo(() => sortEtfs(selected?.etfs ?? [], sort), [selected, sort]);
  const paged = usePaged(ordered, PAGE_SIZE, `${selected?.key ?? ""}|${sort}`);
  const brief = useMemo(() => etfBrief(selected && { ...selected, etfs: ordered }), [selected, ordered]);

  return (
    <MarketSection
      id="most-bought-etfs"
      eyebrow="Most bought ETFs"
      eyebrowClass="text-violet-600 dark:text-violet-400"
      title="ETFs by asset class, best returning first"
      blurb="Every ETF listed on NSE, grouped by what it actually holds — gold, silver, the Nifty 50, overseas indices and more — and ranked within each group by the return it has actually delivered, with turnover a click away."
      aside={
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400">
          {groups.length} asset classes
        </div>
      }
    >
      <AiBoardRead feature="etf-board" brief={brief} />

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-32" />}

      {!loading && groups.length > 0 && selected && (
        <>
          <div className="mt-5">
            <PillTabs
              label="ETF asset class"
              value={selected.key}
              onChange={setActive}
              options={groups.map((group) => ({ key: group.key, label: group.name, count: group.etfs.length }))}
            />
          </div>

          <div className="mt-3">
            <PillTabs label="Order funds by" value={sort} onChange={setSort} options={ETF_SORTS} />
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-600 dark:text-slate-400">{selected.description}</p>
            <p className="text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
              {formatCrore(selected.totalTurnover)} traded today
            </p>
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {paged.slice.map((etf, index) => (
              <EtfCard key={etf.symbol} etf={etf} rank={paged.from + index} />
            ))}
          </ul>
          <Pager paged={paged} unit="funds" />
        </>
      )}

      {!loading && groups.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">NSE hasn&apos;t published ETF trading data yet today.</p>
      )}

      <SectionFootnote>
        Live ETF data from NSE. Funds are ordered by their delivered return — a year where the fund has one, otherwise a
        month, otherwise today — and each card names the window it was ranked on. Net buying versus selling is not
        published for ETFs, so the turnover ordering means most money traded, not most bought · past returns are not a
        forecast · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
