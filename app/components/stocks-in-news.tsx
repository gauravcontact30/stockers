"use client";

import { useMemo, useState } from "react";
import { AiBoardRead } from "./ai-board-read";
import { CompanyLogo } from "./company-logo";
import { relativeAge, sectorTone } from "./market-format";
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

export type StockNewsItem = {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  category: string;
  headline: string;
  documentUrl: string | null;
  publishedAt: string | null;
};

const PAGE_SIZE = 10;

/** Today's filings as figures: how many, from which sectors, and of what kind. */
export function newsBrief(sectors: StockNewsSector[], total: number): BoardBrief | null {
  if (sectors.length === 0) return null;

  const categories = new Map<string, number>();
  for (const sector of sectors) {
    for (const item of sector.items) categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  }
  const commonest = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return {
    subject: "Corporate filings made to NSE today, grouped by sector",
    question: "Of everything filed today, which items would actually change a holding decision?",
    facts: [
      { label: "Filings today", value: String(total) },
      { label: "Sectors filing", value: String(sectors.length) },
      { label: "Busiest sector", value: `${sectors[0].sector} (${sectors[0].total})` },
      ...commonest.map(([category, count]) => ({ label: category, value: `${count} filings` })),
    ],
    highlights: sectors
      .flatMap((sector) => sector.items.slice(0, 1))
      .slice(0, 5)
      .map((item) => `${item.symbol} \u2014 ${item.category}: ${item.headline}`),
  };
}

export type StockNewsSector = { sector: string; items: StockNewsItem[]; total: number };
export type StockNewsBoard = { sectors: StockNewsSector[]; total: number; live: boolean };

/** Category colours make results, meetings and ratings distinguishable at a glance. */
export function categoryTone(category: string): string {
  const text = category.toLowerCase();
  if (text.includes("result") || text.includes("financial")) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400";
  }
  if (text.includes("dividend") || text.includes("bonus") || text.includes("split")) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400";
  }
  if (text.includes("meeting") || text.includes("meet")) {
    return "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400";
  }
  if (text.includes("rating") || text.includes("credit")) {
    return "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400";
  }
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

function NewsRow({ item }: { item: StockNewsItem }) {
  const age = relativeAge(item.publishedAt);

  const content = (
    <>
      <div className="flex items-start gap-3">
        <CompanyLogo symbol={item.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{item.symbol}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryTone(item.category)}`}>
              {item.category}
            </span>
            {age && <span className="text-[10px] text-slate-400 dark:text-slate-500">{age}</span>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{item.company}</p>
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{item.headline}</p>
    </>
  );

  // Every announcement is backed by the company's own signed filing; when NSE gives the document
  // the card links straight to it rather than to a summary of it.
  if (item.documentUrl) {
    return (
      <li>
        <a
          href={item.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/5"
        >
          {content}
          <p className="mt-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Read the filing ↗</p>
        </a>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">{content}</li>
  );
}

/**
 * Company news grouped by sector, sourced from NSE's corporate-announcements feed.
 *
 * These are filings companies are legally obliged to make, so every item is first-hand and links
 * to the company's own signed document — not a press summary of it.
 */
export function StocksInNews() {
  const { data, loading, error } = useMarketFeed<StockNewsBoard>("/api/market/stock-news");
  const [active, setActive] = useState<string | null>(null);

  const sectors = useMemo(() => data?.sectors ?? [], [data]);
  const selected = sectors.find((sector) => sector.sector === active) ?? sectors[0];
  // Switching sector is switching lists, so the pager starts again at page one.
  const paged = usePaged(selected?.items ?? [], PAGE_SIZE, selected?.sector ?? "");

  const brief = useMemo(() => newsBrief(sectors, data?.total ?? 0), [sectors, data?.total]);

  return (
    <MarketSection
      id="stocks-in-news"
      eyebrow="Stocks in news"
      eyebrowClass="text-rose-600 dark:text-rose-400"
      title="What listed companies filed today, by sector"
      blurb="Live corporate announcements from NSE — results, board meetings, ratings and material events — grouped by the sector each company belongs to."
      aside={
        <div className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
          {data?.total ?? 0} announcements
        </div>
      }
    >
      <AiBoardRead feature="stock-news" brief={brief} />

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-28" />}

      {!loading && sectors.length > 0 && selected && (
        <>
          <div className="mt-5">
            <PillTabs
              label="Sector"
              value={selected.sector}
              onChange={setActive}
              options={sectors.map((sector) => ({ key: sector.sector, label: sector.sector, count: sector.total }))}
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${sectorTone(selected.sector)}`}>
              {selected.sector}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">newest first</span>
          </div>

          <ul className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {paged.slice.map((item) => (
              <NewsRow key={item.id} item={item} />
            ))}
          </ul>
          <Pager paged={paged} unit="filings" />
        </>
      )}

      {!loading && sectors.length === 0 && !error && (
        <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">No company announcements on the feed right now.</p>
      )}

      <SectionFootnote>
        Corporate filings from NSE India, linked to each company&apos;s original signed document · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
