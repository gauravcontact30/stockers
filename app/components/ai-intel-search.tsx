"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { track } from "../lib/track";
import { CompanyLogo } from "./company-logo";
import {
  bookmarkId,
  bookmarksSnapshot,
  clearBookmarks,
  recordAsk,
  removeBookmark,
  serverBookmarks,
  subscribeBookmarks,
  toggleBookmark,
  type IntelBookmark,
} from "./intel-bookmarks";
import {
  chipFor,
  formatCrore,
  formatDayDate,
  formatQuantity,
  formatRupee,
  formatSignedPercent,
  sectorTone,
  toneFor,
} from "./market-format";
import { Pager, usePaged } from "./market-section";
import { authHeaders } from "./subscription-provider";

/**
 * The intelligence search: ask anything about a BSE-listed company, get the answer in points.
 *
 * Every other panel in this workspace answers a question we chose in advance. This one lets the
 * reader ask their own — and answers it from what Indian publishers actually wrote, not from the
 * model's memory. What makes that trustworthy on screen:
 *
 *   the company is shown as the exchange has it, logo and ticker and today's price, so a reader
 *   can see immediately whether the search understood who they meant;
 *
 *   the answer is points and nothing else — no paragraph, no preamble — sorted onto one card per
 *   subject, so "what did brokerages say" and "what did the regulator do" never blur into one
 *   list. The card holding the most important finding carries a star ribbon;
 *
 *   every point carries a badge naming the fact, a pill saying whether it reads well or badly for
 *   a shareholder, and a link to the report it came from. Anything the desk couldn't attribute is
 *   marked unsourced rather than quietly dressed up as sourced;
 *
 *   the outperform/hold/underperform call and the four holding-period outlooks are computed from measured returns
 *   and the tone of that same coverage. They are a reading of the record, not a promise about the
 *   future, and the footnote says so.
 */

// ---------------------------------------------------------------------------
// The filters
// ---------------------------------------------------------------------------
// Declared here rather than imported from the server module that also uses them: that module
// reaches the exchange feeds and the full listed catalogue, none of which belongs in a browser
// bundle. The route validates whatever arrives against its own copy, so a drift between the two
// costs a filter falling back to its default — never a bad search.

export type IntelTopic =
  | "all"
  | "results"
  | "orders"
  | "brokerage"
  | "corporate-actions"
  | "regulatory"
  | "ownership";

export type IntelWindow = "1d" | "3d" | "1w" | "1m" | "3m" | "1y";
export type IntelSort = "relevance" | "recent";

export const TOPIC_OPTIONS: readonly { key: IntelTopic; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "results", label: "Results & earnings" },
  { key: "orders", label: "Orders & deals" },
  { key: "brokerage", label: "Brokerage & targets" },
  { key: "corporate-actions", label: "Dividends & actions" },
  { key: "regulatory", label: "Regulatory & legal" },
  { key: "ownership", label: "Promoters & holdings" },
];

export const WINDOW_OPTIONS: readonly { key: IntelWindow; label: string }[] = [
  { key: "1d", label: "24 hours" },
  { key: "3d", label: "3 days" },
  { key: "1w", label: "1 week" },
  { key: "1m", label: "1 month" },
  { key: "3m", label: "3 months" },
  { key: "1y", label: "1 year" },
];

export const SORT_OPTIONS: readonly { key: IntelSort; label: string }[] = [
  { key: "relevance", label: "Most relevant" },
  { key: "recent", label: "Newest first" },
];

export type IntelFilters = { topic: IntelTopic; window: IntelWindow; sort: IntelSort };

export const DEFAULT_FILTERS: IntelFilters = { topic: "all", window: "1w", sort: "relevance" };

/** True when nothing is set — which is when "Clear filters" has nothing to clear. */
export function isDefaultFilters(filters: IntelFilters): boolean {
  return (
    filters.topic === DEFAULT_FILTERS.topic &&
    filters.window === DEFAULT_FILTERS.window &&
    filters.sort === DEFAULT_FILTERS.sort
  );
}

/** The request body for one search. Pure, so the wiring can be checked without a network. */
export function buildIntelBody(query: string, filters: IntelFilters) {
  return { query: query.trim(), ...filters };
}

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

export type IntelStock = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string | null;
  code: string | null;
  isin: string | null;
  group: string | null;
  rank: number | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
  trades: number | null;
  marketCapCr: number | null;
  sessionDate: string | null;
};

export type IntelCategory =
  | "results"
  | "orders"
  | "brokerage"
  | "actions"
  | "regulatory"
  | "ownership"
  | "price"
  | "other";

export type IntelImpact = "positive" | "negative" | "neutral";

export type IntelPoint = {
  text: string;
  source: number | null;
  category: IntelCategory;
  impact: IntelImpact;
  badge: string;
};

export type IntelGroup = { category: IntelCategory; label: string; points: IntelPoint[]; star: boolean };
export type IntelSource = { title: string; publisher: string; url: string; publishedAt: string };
export type IntelFollowUp = { label: string; topic: IntelTopic; window: IntelWindow };

export type Stance = "Buy" | "Hold" | "Sell";

export type HorizonOutlook = {
  key: string;
  label: string;
  stance: Stance;
  conviction: number;
  trailing: number | null;
  annualised: number | null;
  basis: string;
};

export type StockOutlook = {
  stance: Stance;
  conviction: number;
  momentum: number;
  news: { positive: number; negative: number; neutral: number; total: number; score: number };
  horizons: HorizonOutlook[];
  basis: string;
};

export type IntelAnswer = {
  stock: IntelStock | null;
  subject: string;
  headline: string;
  points: IntelPoint[];
  groups: IntelGroup[];
  sources: IntelSource[];
  outlook: StockOutlook | null;
  measuredFrom: Record<string, string | null>;
  peers: IntelPeers | null;
  followUps: IntelFollowUp[];
  writer: "ai" | "extractive";
  fetchedAt: string;
};

// ---------------------------------------------------------------------------
// Colour, per category and per call
// ---------------------------------------------------------------------------
// Each card is washed in its own pale tint so eight findings read as four subjects rather than one
// long list. The tints are light enough that the text on them carries the contrast, not the panel.

const CATEGORY_TINT: Record<IntelCategory, string> = {
  results: "border-sky-200 bg-sky-50/80 dark:border-sky-500/25 dark:bg-sky-500/10",
  orders: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-500/10",
  brokerage: "border-violet-200 bg-violet-50/80 dark:border-violet-500/25 dark:bg-violet-500/10",
  actions: "border-amber-200 bg-amber-50/80 dark:border-amber-500/25 dark:bg-amber-500/10",
  regulatory: "border-rose-200 bg-rose-50/80 dark:border-rose-500/25 dark:bg-rose-500/10",
  ownership: "border-indigo-200 bg-indigo-50/80 dark:border-indigo-500/25 dark:bg-indigo-500/10",
  price: "border-teal-200 bg-teal-50/80 dark:border-teal-500/25 dark:bg-teal-500/10",
  other: "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/40",
};

const CATEGORY_PILL: Record<IntelCategory, string> = {
  results: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  orders: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  brokerage: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  actions: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  regulatory: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  ownership: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  price: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  other: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

const IMPACT_PILL: Record<IntelImpact, string> = {
  positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  negative: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  neutral: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const IMPACT_LABEL: Record<IntelImpact, string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
};

export const STANCE_TONE: Record<Stance, string> = {
  Buy: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300",
  Hold: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300",
  Sell: "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-300",
};

const STANCE_BAR: Record<Stance, string> = {
  Buy: "bg-emerald-500",
  Hold: "bg-amber-500",
  Sell: "bg-rose-500",
};

const STANCE_LABEL: Record<Stance, string> = {
  Buy: "Outperform",
  Hold: "Hold",
  Sell: "Underperform",
};

// ---------------------------------------------------------------------------
// Typing ahead
// ---------------------------------------------------------------------------

type SuggestHit = { symbol: string; name: string; sector: string };

/** One row of the dropdown: a company to search, or a question to ask about the one above it. */
export type Suggestion =
  | { kind: "company"; symbol: string; name: string; label: string }
  | { kind: "question"; symbol: string; name: string; label: string; topic: IntelTopic };

/** The flat list of companies behind a /api/stocks/search response, best group first. */
export function suggestionsFrom(payload: unknown, limit = 5): SuggestHit[] {
  const groups = (payload as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) return [];

  return groups
    .flatMap((group) => ((group as { stocks?: unknown })?.stocks as SuggestHit[]) ?? [])
    .filter((hit) => hit && typeof hit.symbol === "string")
    .slice(0, limit);
}

// The questions worth offering about whichever company the reader is halfway through typing.
// Deliberately the three most-asked: what did it earn, what do brokers think, what will it pay.
const SUGGESTED_QUESTIONS: { topic: IntelTopic; phrase: string }[] = [
  { topic: "results", phrase: "latest results" },
  { topic: "brokerage", phrase: "brokerage targets" },
  { topic: "corporate-actions", phrase: "dividend & bonus" },
];

/**
 * The dropdown: the companies that match, then questions about the best of them.
 *
 * Offering the questions under the leading company is what makes this more than an autocomplete —
 * a reader who does not know what to ask is shown three things worth asking, already wired to the
 * filter that answers each.
 */
export function buildSuggestions(hits: SuggestHit[]): Suggestion[] {
  const companies: Suggestion[] = hits.map((hit) => ({
    kind: "company",
    symbol: hit.symbol,
    name: hit.name,
    label: hit.symbol,
  }));

  if (hits.length === 0) return companies;

  const lead = hits[0];
  const questions: Suggestion[] = SUGGESTED_QUESTIONS.map((question) => ({
    kind: "question",
    symbol: lead.symbol,
    name: lead.name,
    label: `${lead.name} — ${question.phrase}`,
    topic: question.topic,
  }));

  return [...companies, ...questions];
}

// Long enough that typing a ticker doesn't fire a request per letter, short enough that the list
// is there by the time the reader looks down at it.
const SUGGEST_DELAY_MS = 200;
const MIN_SUGGEST_CHARS = 2;

/** The listed companies matching what has been typed so far, and what to ask about them. */
function useSuggestions(term: string): Suggestion[] {
  const [hits, setHits] = useState<Suggestion[]>([]);

  useEffect(() => {
    const trimmed = term.trim();
    let live = true;

    // Everything — including clearing the list for a query too short to search — happens on the
    // debounce timer rather than in the effect body, so a keystroke never triggers a synchronous
    // second render.
    const timer = setTimeout(async () => {
      let next: Suggestion[] = [];

      if (trimmed.length >= MIN_SUGGEST_CHARS) {
        try {
          const response = await fetch(`/api/stocks/search?q=${encodeURIComponent(trimmed)}`);
          if (!response.ok) throw new Error("Search failed");
          next = buildSuggestions(suggestionsFrom(await response.json()));
        } catch {
          // A failed lookup costs the dropdown, not the search: the box still submits whatever was
          // typed, and the server resolves the company its own way.
          next = [];
        }
      }

      // The reader has typed on since this request left, so its answer is about a word they are no
      // longer looking at. Dropping it is what stops a slow lookup overwriting a fresher one.
      if (live) setHits(next);
    }, SUGGEST_DELAY_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term]);

  return hits;
}

// The questions worth asking that nobody types unprompted. Each one runs a real search.
const EXAMPLES = [
  { query: "RELIANCE", topic: "all" as IntelTopic, label: "What's new at Reliance" },
  { query: "TCS", topic: "results" as IntelTopic, label: "TCS results" },
  { query: "TATAMOTORS", topic: "brokerage" as IntelTopic, label: "Brokerage calls on Tata Motors" },
  { query: "HDFCBANK", topic: "corporate-actions" as IntelTopic, label: "HDFC Bank dividends" },
];

/**
 * A labelled dropdown.
 *
 * `srLabel` exists for the case where two of these sit on the same page filtering different boards:
 * the accessible name has to say which board ("laggards tier"), but printing that qualifier makes
 * the control half again as wide and pushes its neighbour onto a second row. So the caller can pass
 * the long name for screen readers and keep the printed one short.
 */
function FilterSelect<T extends string>({
  label,
  srLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  srLabel?: string;
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <label className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      <select
        aria-label={srLabel ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-w-0 flex-1 cursor-pointer bg-transparent py-1 text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
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

/**
 * Every field the exchange publishes for a scrip, in the order a reader checks them.
 *
 * A fact that the feed did not carry is dropped rather than printed as a dash: an absent ISIN is
 * not a value, and a strip of dashes reads as a broken panel.
 */
const STOCK_FACTS: { label: string; value: (stock: IntelStock) => string | null }[] = [
  { label: "Scrip code", value: (stock) => stock.code },
  { label: "ISIN", value: (stock) => stock.isin },
  { label: "Group", value: (stock) => stock.group },
  { label: "Mcap rank", value: (stock) => (stock.rank === null ? null : `#${stock.rank}`) },
  { label: "Market cap", value: (stock) => (stock.marketCapCr === null ? null : formatCrore(stock.marketCapCr * 1e7)) },
  { label: "Prev close", value: (stock) => (stock.previousClose === null ? null : formatRupee(stock.previousClose)) },
  { label: "Open", value: (stock) => (stock.open === null ? null : formatRupee(stock.open)) },
  { label: "Day change", value: (stock) => (stock.change === null ? null : formatRupee(stock.change)) },
  {
    label: "Day range",
    value: (stock) =>
      stock.dayLow === null || stock.dayHigh === null ? null : `${formatRupee(stock.dayLow)} – ${formatRupee(stock.dayHigh)}`,
  },
  { label: "Volume", value: (stock) => (stock.volume === null ? null : formatQuantity(stock.volume)) },
  { label: "Turnover", value: (stock) => (stock.turnoverCr === null ? null : `${formatRupee(stock.turnoverCr, 1)} Cr`) },
  { label: "Trades", value: (stock) => (stock.trades === null ? null : stock.trades.toLocaleString("en-IN")) },
];

/** The company an answer is about, as the exchange files it — the proof the search understood. */
export function StockProfile({ stock, subject }: { stock: IntelStock | null; subject: string }) {
  if (!stock) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/60">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          ?
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{subject}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            No BSE-listed company matched this search, so the answer below is about the words themselves.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
      <CompanyLogo symbol={stock.symbol} size={44} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-slate-900 dark:text-white">{stock.name}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {stock.symbol}
          {stock.code && ` · ${stock.code}`}
          {stock.capTier && ` · ${stock.capTier} cap`}
          {/* The exchange files market cap in crore; formatCrore takes rupees, as every other
              board on the site hands it. */}
          {stock.marketCapCr !== null && ` · ${formatCrore(stock.marketCapCr * 1e7)}`}
        </p>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(stock.sector)}`}>
          {stock.sector}
        </span>
      </div>

      {stock.price !== null && (
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{formatRupee(stock.price)}</p>
          <span
            title={exactPercent(stock.changePercent)}
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${chipFor(stock.changePercent)}`}
          >
            {formatSignedPercent(stock.changePercent)}
          </span>
        </div>
      )}

      {/* Everything else the exchange publishes about this scrip, to the exchange's own precision.
          It is here so a reader can confirm the panel is looking at their company — the ISIN and
          the code are what settle that — and size a position without leaving the answer. */}
      <dl className="grid w-full grid-cols-2 gap-1.5 border-t border-slate-200 pt-2.5 sm:grid-cols-4 lg:grid-cols-6 dark:border-slate-800">
        {STOCK_FACTS.map((fact) => {
          const value = fact.value(stock);
          if (value === null) return null;

          return (
            <div key={fact.label} className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-900/60">
              <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {fact.label}
              </dt>
              <dd className="truncate text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {value}
              </dd>
            </div>
          );
        })}
      </dl>

      {stock.sessionDate && (
        <p className="w-full text-[10px] text-slate-400 dark:text-slate-500">
          Every figure above is BSE&apos;s own for the session of {formatDayDate(stock.sessionDate)} — nothing here is
          estimated, rounded up or filled in.
        </p>
      )}
    </div>
  );
}

function convictionBar(stance: Stance, conviction: number) {
  return (
    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <span className={`block h-full rounded-full ${STANCE_BAR[stance]}`} style={{ width: `${conviction}%` }} />
    </span>
  );
}

/** The standing call, and what it was read off. */
export function VerdictBanner({ outlook }: { outlook: StockOutlook }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-2xl border px-4 py-2 text-lg font-bold tracking-wide ${STANCE_TONE[outlook.stance]}`}
        >
          {STANCE_LABEL[outlook.stance]}
        </span>

        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Conviction {outlook.conviction}/100
          </p>
          {convictionBar(outlook.stance, outlook.conviction)}
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{outlook.basis}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Trend {outlook.momentum}/100
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            {outlook.news.positive} positive
          </span>
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
            {outlook.news.negative} negative
          </span>
        </div>
      </div>
    </div>
  );
}

/** One card per holding period: the call for that horizon, and the measured line behind it. */
export function HorizonCards({
  horizons,
  measuredFrom = {},
}: {
  horizons: HorizonOutlook[];
  /** The session each window is counted from, so no return on screen is undated. */
  measuredFrom?: Record<string, string | null>;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {horizons.map((horizon) => (
        <div
          key={horizon.key}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/60"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{horizon.label}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STANCE_TONE[horizon.stance]}`}>
              {STANCE_LABEL[horizon.stance]}
            </span>
          </div>

          {convictionBar(horizon.stance, horizon.conviction)}

          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span
              title={exactPercent(horizon.trailing)}
              className={`text-sm font-bold tabular-nums ${horizon.trailing === null ? "text-slate-400" : ""}`}
            >
              {formatSignedPercent(horizon.trailing)}
            </span>
            <span>
              measured · {horizon.annualised === null ? "—" : `${formatSignedPercent(horizon.annualised)} a year`}
            </span>
          </p>

          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{horizon.basis}</p>

          {measuredFrom[horizon.key] && (
            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
              Measured from the close of {formatDayDate(measuredFrom[horizon.key])}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * One subject's findings, on its own tinted card.
 *
 * The star ribbon marks the card holding the most important finding — the points arrive ranked, so
 * that is simply whichever card the first point landed on, not a category we favoured in advance.
 */
export function CategoryCard({ group, sources }: { group: IntelGroup; sources: IntelSource[] }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${CATEGORY_TINT[group.category]}`}>
      {group.star && (
        <span
          data-testid="star-ribbon"
          className="absolute right-[-34px] top-[14px] w-[128px] rotate-45 bg-gradient-to-r from-amber-400 to-amber-500 py-1 text-center text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
        >
          ★ Key
        </span>
      )}

      <span
        className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${CATEGORY_PILL[group.category]}`}
      >
        {group.label}
      </span>

      <ul className="mt-3 flex flex-col gap-3">
        {group.points.map((point, index) => {
          const cited = point.source !== null ? sources[point.source - 1] : undefined;

          return (
            <li key={index} className="border-t border-white/60 pt-3 first:border-0 first:pt-0 dark:border-white/5">
              <div className="flex flex-wrap items-center gap-1.5">
                {point.badge && (
                  <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-bold text-slate-700 shadow-sm dark:bg-slate-900/70 dark:text-slate-100">
                    {point.badge}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${IMPACT_PILL[point.impact]}`}>
                  {IMPACT_LABEL[point.impact]}
                </span>
                {cited ? (
                  <a
                    href={cited.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:text-emerald-400"
                  >
                    {cited.publisher} ↗
                  </a>
                ) : (
                  <span className="rounded-full border border-dashed border-slate-400/60 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    unsourced
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{point.text}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The category, ranked
// ---------------------------------------------------------------------------

export type PeerRow = {
  symbol: string;
  name: string;
  code: string;
  capTier: string | null;
  category: string;
  price: number | null;
  changePercent: number | null;
  returns: Record<string, number | null>;
};

export type IntelPeers = { category: string; leaders: PeerRow[]; laggards: PeerRow[] };

/**
 * The unrounded figure, for the tooltip.
 *
 * Every percentage on screen is printed to two decimals, which is the precision a reader can use.
 * The exact value the exchange's closes produce is kept on the element itself, so a figure that
 * matters to the fourth decimal is one hover away rather than lost to the rounding.
 */
export function exactPercent(value: number | null | undefined): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(6)}%` : undefined;
}

/** Every window a peer is measured over, in the order they are printed. */
export const PEER_PERIODS: readonly { key: string; label: string }[] = [
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "3y", label: "3Y" },
  { key: "5y", label: "5Y" },
  { key: "overall", label: "Overall" },
];

/** One company in a ranked list, with its whole measured record beside it. */
export function PeerCard({ peer, rank }: { peer: PeerRow; rank: number }) {
  return (
    <li className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
          {rank}
        </span>
        <CompanyLogo symbol={peer.symbol} size={30} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{peer.symbol}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{peer.name}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formatRupee(peer.price)}</p>
          <span
            title={exactPercent(peer.changePercent)}
            className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${chipFor(peer.changePercent)}`}
          >
            {formatSignedPercent(peer.changePercent)}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {peer.capTier && (
          <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            {peer.capTier} cap
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(peer.category)}`}>
          {peer.category}
        </span>
      </div>

      {/* Eight windows on one company.
          Eight columns across a card this narrow put a label under a figure under another figure —
          at "-100.00%" they touched. So each window is its own bordered row instead: the label on
          the left, the figure hard right in tabular numerals, on a line of its own. Two columns on
          a phone, four on a wide screen, and nothing can run into anything. */}
      <dl className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
        {PEER_PERIODS.map((period) => (
          <div
            key={period.key}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/70 px-2 py-1 dark:border-slate-700/60 dark:bg-slate-950/50"
          >
            <dt className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {period.label}
            </dt>
            <dd
              title={exactPercent(peer.returns[period.key])}
              className={`whitespace-nowrap text-[11px] font-bold tabular-nums ${toneFor(peer.returns[period.key])}`}
            >
              {formatSignedPercent(peer.returns[period.key])}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/** How a peer board is being read: which tier it is filtered to, and what it is ranked by. */
export type PeerView = { tier: string; period: string };

export const PEER_TIERS: readonly { key: string; label: string }[] = [
  { key: "all", label: "All caps" },
  { key: "Large", label: "Large cap" },
  { key: "Mid", label: "Mid cap" },
  { key: "Small", label: "Small cap" },
];

/**
 * One board's rows, filtered and re-ranked.
 *
 * The twenty were chosen by their one-year return, which is the ranking the exchange archive can
 * answer for a whole category at once. Re-ordering them by another window is honest — every window
 * is already measured for every row — but it reorders those twenty rather than re-picking them
 * from the category, and the note under the board says so.
 *
 * Leaders read downwards from the best, laggards upwards from the worst; a row with no reading for
 * the chosen window sorts to the bottom of either, because "no history" is not a rank.
 */
export function rankPeers(rows: PeerRow[], view: PeerView, direction: "leaders" | "laggards"): PeerRow[] {
  const filtered = view.tier === "all" ? rows : rows.filter((row) => row.capTier === view.tier);

  return [...filtered].sort((a, b) => {
    const left = a.returns[view.period];
    const right = b.returns[view.period];
    if (left === null || left === undefined) return right === null || right === undefined ? 0 : 1;
    if (right === null || right === undefined) return -1;
    return direction === "leaders" ? right - left : left - right;
  });
}

const PEERS_PER_PAGE = 5;

/**
 * One end of the category: the twenty that compounded, or the twenty that destroyed value.
 *
 * Paged five at a time rather than printed as a wall of twenty — each row carries eight windows of
 * returns, and twenty of those is a page nobody reads to the end of.
 */
export function PeerBoard({
  title,
  ribbon,
  blurb,
  rows,
  direction,
  tint,
  ribbonTone,
}: {
  title: string;
  ribbon: string;
  blurb: string;
  rows: PeerRow[];
  direction: "leaders" | "laggards";
  tint: string;
  ribbonTone: string;
}) {
  const [view, setView] = useState<PeerView>({ tier: "all", period: "1y" });
  const ranked = rankPeers(rows, view, direction);
  // The key resets the pager whenever the list underneath it becomes a different list.
  const paged = usePaged(ranked, PEERS_PER_PAGE, `${direction}|${view.tier}|${view.period}`);

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${tint}`}>
      <span
        data-testid={`peer-ribbon-${direction}`}
        className={`absolute right-[-38px] top-[16px] w-[140px] rotate-45 bg-gradient-to-r py-1 text-center text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ${ribbonTone}`}
      >
        {ribbon}
      </span>

      <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{blurb}</p>

      {/* Two equal columns rather than a wrapping flex row: these boards render two-up inside the
          results grid, and at that width a flex row put each dropdown on a line of its own. The
          grid keeps the pair side by side and lets each one shrink to half the card instead. */}
      <div className="mt-2.5 grid grid-cols-2 items-center gap-2">
        <FilterSelect
          label="Tier"
          srLabel={`${direction} tier`}
          value={view.tier}
          options={PEER_TIERS}
          onChange={(tier) => setView({ ...view, tier })}
        />
        <FilterSelect
          label="Rank by"
          srLabel={`${direction} rank by`}
          value={view.period}
          options={PEER_PERIODS}
          onChange={(period) => setView({ ...view, period })}
        />
      </div>

      {ranked.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Nothing in this category matches these filters.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {paged.slice.map((peer, index) => (
              <PeerCard key={peer.code} peer={peer} rank={paged.from + index} />
            ))}
          </ul>
          <Pager paged={paged} unit={`${direction} `} />
        </>
      )}
    </div>
  );
}

/**
 * The searched company's category, ranked from both ends.
 *
 * Two boards rather than one list, because they answer different questions — what in this category
 * has compounded, and what in it has destroyed value. Both are the exchange's own closes; the "to
 * outperform" and "to avoid" wording is this app's reading of that ranking, and the note under the boards
 * says so rather than letting the ribbon imply a recommendation.
 */
export function PeerBoards({ peers }: { peers: IntelPeers }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <PeerBoard
        title="Top 20 to outperform"
        ribbon="★ Leaders"
        blurb={`Strongest one-year record in ${peers.category}`}
        rows={peers.leaders}
        direction="leaders"
        tint="border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-500/10"
        ribbonTone="from-emerald-400 to-emerald-500"
      />
      <PeerBoard
        title="Top 20 losers to avoid"
        ribbon="▼ Laggards"
        blurb={`Weakest one-year record in ${peers.category}`}
        rows={peers.laggards}
        direction="laggards"
        tint="border-rose-200 bg-rose-50/80 dark:border-rose-500/25 dark:bg-rose-500/10"
        ribbonTone="from-rose-400 to-rose-500"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------
// Maintenance is icons only — a star to keep a search, a cross to drop one, a broom to drop them
// all. Every one carries an aria-label, so "icon only" is a visual decision rather than a
// screen-reader dead end.

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m12 3 2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.3 9.4l6.1-.8Z" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3 w-3" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function BroomIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M19 4 9.5 13.5" />
      <path d="M6 12h6l1.5 8H4.5Z" />
      <path d="M8 16h6" />
    </svg>
  );
}

/** A saved search in words: the question, and the filter it was saved under. */
export function bookmarkLabel(bookmark: IntelBookmark): string {
  const topic = TOPIC_OPTIONS.find((option) => option.key === bookmark.topic);
  return topic && topic.key !== "all" ? `${bookmark.query} · ${topic.label}` : bookmark.query;
}

/**
 * The saved-search shelf.
 *
 * Sits above the answer rather than below it, because its job is to start a search — and it
 * carries a count so a reader can see at a glance whether there is anything in it before they
 * look. Each chip is one click back to a question they have already decided is worth asking.
 */
export function BookmarkPanel({
  bookmarks,
  currentId,
  canSave,
  onSave,
  onOpen,
  onRemove,
  onClear,
}: {
  bookmarks: IntelBookmark[];
  /** The id of the search on screen, so the star can show whether it is already kept. */
  currentId: string | null;
  canSave: boolean;
  onSave: () => void;
  onOpen: (bookmark: IntelBookmark) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const saved = currentId !== null && bookmarks.some((entry) => entry.id === currentId);

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-3.5 dark:border-amber-500/30 dark:from-amber-500/10 dark:via-slate-900 dark:to-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">
          Bookmarked searches
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
          {bookmarks.length}
        </span>

        <span className="flex-1" />

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          aria-label={saved ? "Remove this search from bookmarks" : "Bookmark this search"}
          aria-pressed={saved}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition disabled:opacity-40 ${
            saved
              ? "border-amber-400 bg-amber-400 text-white"
              : "border-amber-300 bg-white text-amber-600 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-400"
          }`}
        >
          <StarIcon filled={saved} />
        </button>

        {bookmarks.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear all bookmarks"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            <BroomIcon />
          </button>
        )}
      </div>

      {bookmarks.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Star a search to keep it here. The ones you run most often rise to the front.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {bookmarks.map((bookmark) => (
            <li
              key={bookmark.id}
              className="flex items-center gap-1 rounded-full border border-amber-200 bg-white pl-1 pr-1 shadow-sm dark:border-amber-500/30 dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => onOpen(bookmark)}
                className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5 text-xs font-semibold text-slate-700 transition hover:text-emerald-700 dark:text-slate-200 dark:hover:text-emerald-400"
              >
                <CompanyLogo symbol={bookmark.query} size={20} />
                <span className="max-w-[220px] truncate">{bookmarkLabel(bookmark)}</span>
                {bookmark.uses > 1 && (
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    ×{bookmark.uses}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemove(bookmark.id)}
                aria-label={`Remove ${bookmarkLabel(bookmark)} from bookmarks`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/20"
              >
                <CrossIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What to ask next, already wired to the filters that would answer it. */
export function FollowUps({ items, onAsk }: { items: IntelFollowUp[]; onAsk: (item: IntelFollowUp) => void }) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ask next</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onAsk(item)}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            {item.label} →
          </button>
        ))}
      </div>
    </div>
  );
}

export function AiIntelSearch() {
  const [input, setInput] = useState("");
  const [filters, setFilters] = useState<IntelFilters>(DEFAULT_FILTERS);
  const [answer, setAnswer] = useState<IntelAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState(false);
  // The search the panel is currently showing, so a filter change can re-run it without the
  // reader retyping — and so an edit to the box doesn't silently change what is on screen.
  const [asked, setAsked] = useState("");
  const [askedFilters, setAskedFilters] = useState<IntelFilters>(DEFAULT_FILTERS);

  const suggestions = useSuggestions(input);
  const bookmarks = useSyncExternalStore(subscribeBookmarks, bookmarksSnapshot, serverBookmarks);

  const run = async (query: string, next: IntelFilters) => {
    const term = query.trim();
    if (!term) return;

    setAsked(term);
    setAskedFilters(next);
    // Counts against this search's bookmark if it has one, which is what floats a reader's
    // morning routine to the front of the shelf over time.
    recordAsk(term, next);
    // The topic it was filed under, never the question itself: what somebody asks the desk is
    // theirs, and the admin dashboard needs the volume and the shape, not the words.
    track("ai.ask", next.topic);
    setOpen(false);
    setLoading(true);
    setError(null);
    setLocked(false);

    try {
      const response = await fetch("/api/ai/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(buildIntelBody(term, next)),
      });

      if (response.status === 402) {
        setLocked(true);
        setAnswer(null);
        return;
      }
      if (!response.ok) throw new Error("Search failed");

      setAnswer(await response.json());
    } catch {
      setError("The AI desk couldn't reach the web for this search. Try again in a moment.");
      setAnswer(null);
    } finally {
      setLoading(false);
    }
  };

  /** A filter is a re-ask of the same question, not a new one — so it only fires once one exists. */
  const changeFilter = (patch: Partial<IntelFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (asked) run(asked, next);
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    if (asked) run(asked, DEFAULT_FILTERS);
  };

  /** Empties the box and the answer under it, back to the opening state of the panel. */
  const clearSearch = () => {
    setInput("");
    setAnswer(null);
    setError(null);
    setLocked(false);
    setAsked("");
    setOpen(false);
  };

  /** Everything that asks a fresh question: an example, a suggestion, a follow-up chip. */
  const ask = (query: string, patch: Partial<IntelFilters>) => {
    const next = { ...filters, ...patch };
    setInput(query);
    setFilters(next);
    run(query, next);
  };

  /** Re-runs a saved search exactly as it was saved: same words, same filters. */
  const openBookmark = (bookmark: IntelBookmark) => {
    const next: IntelFilters = {
      topic: bookmark.topic as IntelTopic,
      window: bookmark.window as IntelWindow,
      sort: bookmark.sort as IntelSort,
    };
    setInput(bookmark.query);
    setFilters(next);
    run(bookmark.query, next);
  };

  const showList = open && suggestions.length > 0;
  // The star reflects the search on screen, not whatever is half-typed in the box.
  const currentId = asked ? bookmarkId(asked, askedFilters) : null;

  return (
    <section className="overflow-hidden rounded-[32px] border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-white shadow-[0_20px_60px_-40px_rgba(5,150,105,0.6)] transition-colors dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
              AI intelligence search
            </p>
            <h3 className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
              Ask anything about a BSE-listed company
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-400">
              The desk reads what Indian publishers have written, sorts what it finds onto a card per subject, and states
              an outperform, hold or underperform for six months, a year, three and five — every call computed from measured returns and
              the tone of that coverage.
            </p>
          </div>
          {answer && (
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-400">
              {answer.sources.length} {answer.sources.length === 1 ? "report" : "reports"} read
            </span>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(input, filters);
          }}
          className="mt-4 flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              role="combobox"
              aria-label="Search BSE stocks and the web"
              aria-expanded={showList}
              aria-controls="intel-search-results"
              aria-autocomplete="list"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="Company, ticker or a question — e.g. Tata Motors order wins"
              className="h-11 w-full rounded-full border border-slate-200 bg-white pl-4 pr-10 text-sm text-slate-900 outline-none transition focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            {/* Clearing the box also clears the answer under it. Leaving a stale answer on screen
                beside an empty search is how a reader ends up reading last week's question. */}
            {(input.length > 0 || answer !== null) && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-rose-100 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-500/20"
              >
                <CrossIcon />
              </button>
            )}

            {showList && (
              <ul
                id="intel-search-results"
                role="listbox"
                aria-label="Companies and questions"
                className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {suggestions.map((hit) => (
                  <li key={`${hit.kind}-${hit.label}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => ask(hit.symbol, hit.kind === "question" ? { topic: hit.topic } : {})}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <CompanyLogo symbol={hit.symbol} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {hit.label}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {hit.kind === "question" ? "Suggested question" : hit.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || input.trim().length === 0}
            className="h-11 shrink-0 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterSelect label="Topic" value={filters.topic} options={TOPIC_OPTIONS} onChange={(topic) => changeFilter({ topic })} />
          <FilterSelect label="Since" value={filters.window} options={WINDOW_OPTIONS} onChange={(window) => changeFilter({ window })} />
          <FilterSelect label="Order" value={filters.sort} options={SORT_OPTIONS} onChange={(sort) => changeFilter({ sort })} />
          <button
            type="button"
            onClick={clearFilters}
            disabled={isDefaultFilters(filters)}
            className="h-10 shrink-0 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:text-emerald-400"
          >
            Clear filters
          </button>
        </div>

        <div className="mt-3">
          <BookmarkPanel
            bookmarks={bookmarks}
            currentId={currentId}
            canSave={asked.length > 0}
            onSave={() => toggleBookmark(asked, askedFilters)}
            onOpen={openBookmark}
            onRemove={removeBookmark}
            onClear={clearBookmarks}
          />
        </div>
      </div>

      <div className="border-t border-emerald-100 bg-white/70 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-950/40">
        {loading && (
          <div className="flex flex-col gap-2">
            <div className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
        )}

        {!loading && locked && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-2xl" aria-hidden="true">
              🔒
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">Intelligence search is locked</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
              Your free trial has ended, or an administrator has turned this feature off. Exchange data stays free.
            </p>
            <Link
              href="/pricing"
              className="mt-3 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              See plans
            </Link>
          </div>
        )}

        {!loading && error && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
            {error}
          </p>
        )}

        {!loading && !locked && !error && !answer && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Try one of these</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => ask(example.query, { topic: example.topic })}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-emerald-400"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && !locked && !error && answer && (
          <div data-testid="intel-answer" className="flex flex-col gap-4">
            <StockProfile stock={answer.stock} subject={answer.subject} />

            {answer.outlook && (
              <div className="flex flex-col gap-2.5">
                <VerdictBanner outlook={answer.outlook} />
                <HorizonCards horizons={answer.outlook.horizons} measuredFrom={answer.measuredFrom} />
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{answer.headline}</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {answer.groups.map((group) => (
                  <CategoryCard key={group.category} group={group} sources={answer.sources} />
                ))}
              </div>
            </div>

            {answer.peers && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  The rest of {answer.peers.category}, ranked
                </h4>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Twenty a side, picked by one-year return and re-orderable by any window — the exchange&apos;s own
                  closes, which is a record rather than a recommendation.
                </p>
                <div className="mt-3">
                  <PeerBoards peers={answer.peers} />
                </div>
              </div>
            )}

            <FollowUps items={answer.followUps} onAsk={(item) => ask(asked, { topic: item.topic, window: item.window })} />

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {answer.writer === "ai"
                ? "Points are written by the AI desk from the reports linked on each card, and from nothing else."
                : "No AI model is configured, so these are the publishers' own headlines rather than a synthesis of them."}{" "}
              Calls are computed from measured BSE closes and the tone of that coverage — a reading of the record, not a
              forecast. AI insights, not investment advice.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
