"use client";

import { useState } from "react";
import { MarketSection, PillTabs, SectionError, SectionFootnote, SectionSkeleton, useMarketFeed } from "./market-section";
import { SourceNote, StanceBadge, VerdictCards, type StockVerdict } from "./verdict-view";

export type ShowdownResult = {
  id: string;
  sector: string;
  title: string;
  premise: string;
  stocks: StockVerdict[];
  leader: string | null;
  laggard: string | null;
  takeaway: string;
};

export type ShowdownsResponse = { showdowns: ShowdownResult[] };

/** How many of a group's peers carry each call — the shape of the sector at a glance. */
export function stanceTally(stocks: StockVerdict[]): { Buy: number; Hold: number; Sell: number } {
  return stocks.reduce(
    (tally, stock) => ({ ...tally, [stock.stance]: tally[stock.stance] + 1 }),
    { Buy: 0, Hold: 0, Sell: 0 },
  );
}

/**
 * Five same-sector match-ups, each answering "of these peers, which would I own?".
 *
 * Peers only: a comparison is only meaningful when both sides face the same demand cycle, so each
 * board holds one sector — including the data-centre names, which have no single obvious peer
 * group anywhere else in the app.
 */
export function SectorShowdowns() {
  const { data, loading, error } = useMarketFeed<ShowdownsResponse>("/api/compare/sectors");
  const [active, setActive] = useState<string | null>(null);

  const showdowns = data?.showdowns ?? [];
  const current = showdowns.find((showdown) => showdown.id === active) ?? showdowns[0];
  const source = current?.stocks[0]?.source ?? "heuristic";

  return (
    <MarketSection
      eyebrow="Sector showdowns"
      eyebrowClass="text-violet-600 dark:text-violet-400"
      title="Five same-sector match-ups, called stock by stock"
      blurb="Peers from one sector at a time, ranked on measured performance across five windows. Each name carries its cap tier and an outperform, hold or underperform call with the reasoning behind it."
      aside={
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-400">
          {showdowns.length || 5} sector boards
        </div>
      }
    >
      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={3} height="h-24" />}

      {showdowns.length > 0 && current && (
        <>
          <div className="mt-6">
            <PillTabs
              options={showdowns.map((showdown) => ({ key: showdown.id, label: showdown.title }))}
              value={current.id}
              onChange={setActive}
              label="Sector match-up"
            />
          </div>

          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                {current.sector}
              </span>
              {(["Buy", "Hold", "Sell"] as const).map((stance) => {
                const count = stanceTally(current.stocks)[stance];
                return count > 0 ? (
                  <span key={stance} className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <StanceBadge stance={stance} size="sm" />× {count}
                  </span>
                ) : null;
              })}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{current.takeaway}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{current.premise}</p>
          </div>

          <div className="mt-5">
            <VerdictCards stocks={current.stocks} leader={current.leader} laggard={current.laggard} />
          </div>
        </>
      )}

      <SectionFootnote>
        <SourceNote source={source} />
      </SectionFootnote>
    </MarketSection>
  );
}
