"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney, formatPercent, toneFor } from "../lib/portfolio-metrics";
import {
  DEFAULT_CRITERIA,
  screenBrief,
  type ScreenCriteria,
  type ScreenMatch,
  type ScreenResult,
} from "../lib/portfolio-screen";
import { track } from "../lib/track";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CompanyLogo } from "./company-logo";
import { CARD, EmptyPanel, ErrorNote, FIELD, LABEL, PanelHeading } from "./portfolio-chrome";
import { StockDetailTrigger } from "./stock-detail-provider";
import { authHeaders } from "./subscription-provider";

/**
 * A screen of the whole listed exchange, run against this book.
 *
 * The dashboard's other screeners rank a fixed universe on one idea — today's movers, tomorrow's
 * setups, the dip. This one takes the reader's criteria and, crucially, their portfolio: it drops
 * what they already own, and it can weight the ranking towards cap tiers their book has no
 * exposure to. A shortlist of stocks you already hold is not a shortlist of decisions.
 *
 * Every match adds to the portfolio in one click, with no quantity — which files it under "tracked,
 * not owned". That is the honest default: finding a stock interesting is not buying it, and a
 * screener that pre-fills a position would put numbers in the reader's totals they never agreed to.
 */

/** What the screen route answers with: the pure result, plus the context only the server has. */
type ScreenPayload = ScreenResult & { universe?: number; sessionDate?: string | null };

/** The presets, because most readers want a shape of screen rather than seven numbers. */
const PRESETS: { key: string; label: string; blurb: string; criteria: Partial<ScreenCriteria> }[] = [
  {
    key: "liquid-large",
    label: "Liquid large caps",
    blurb: "The most tradeable end of the exchange",
    criteria: { tier: "Large", minTurnoverCr: 25, sort: "score" },
  },
  {
    key: "todays-dip",
    label: "Today's dip",
    blurb: "Down 2% or more, still liquid",
    criteria: { maxChangePercent: -2, minTurnoverCr: 10, sort: "change" },
  },
  {
    key: "momentum",
    label: "Momentum",
    blurb: "Up 2% or more on real volume",
    criteria: { minChangePercent: 2, minTurnoverCr: 10, sort: "change" },
  },
  {
    key: "fill-the-gaps",
    label: "Fill the gaps",
    blurb: "Weighted to tiers your book is missing",
    criteria: { fit: "diversify", minTurnoverCr: 5, sort: "score" },
  },
  {
    key: "midcap-value",
    label: "Mid caps under ₹500",
    blurb: "Smaller names at an accessible price",
    criteria: { tier: "Mid", maxPrice: 500, minTurnoverCr: 5, sort: "score" },
  },
];

/** Turns the criteria into the query string the screen route parses. */
export function screenQuery(criteria: ScreenCriteria): string {
  const params = new URLSearchParams();
  params.set("tier", criteria.tier);
  params.set("fit", criteria.fit);
  params.set("sort", criteria.sort);
  params.set("excludeHeld", String(criteria.excludeHeld));

  const numbers: [string, number | null][] = [
    ["minPrice", criteria.minPrice],
    ["maxPrice", criteria.maxPrice],
    ["minChange", criteria.minChangePercent],
    ["maxChange", criteria.maxChangePercent],
    ["minMcap", criteria.minMarketCapCr],
    ["minTurnover", criteria.minTurnoverCr],
  ];
  // Absent rather than empty: the route reads a missing key as "no bound", and sending "" for
  // every unset field would make the URL unreadable in a network log for no gain.
  for (const [key, value] of numbers) if (value !== null) params.set(key, String(value));

  return params.toString();
}

/** A number the reader typed, or null when the box is empty. */
function parseField(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-r-[3px] ${score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-slate-400"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="font-mono text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">{score}</span>
    </div>
  );
}

function MatchCard({ match, busy, onAdd }: { match: ScreenMatch; busy: boolean; onAdd: (symbol: string) => void }) {
  return (
    <li className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <CompanyLogo symbol={match.ticker} size={34} />
        <div className="min-w-0 flex-1">
          <StockDetailTrigger symbol={match.ticker}>
            <span className="text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
              {match.ticker}
            </span>
          </StockDetailTrigger>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{match.name}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(match.price)}</p>
          <p className={`font-mono text-[11px] font-bold tabular-nums ${toneFor(match.changePercent)}`}>
            {formatPercent(match.changePercent)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <ScoreBar score={match.score} />
        {match.newTier && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            New tier
          </span>
        )}
      </div>

      {match.reasons.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {match.reasons.map((reason) => (
            <li key={reason} className="flex gap-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
              {reason}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => onAdd(match.ticker)}
        className="mt-3 h-9 w-full rounded-full border border-emerald-300 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
      >
        Track in portfolio
      </button>
    </li>
  );
}

export function PortfolioScreener({ onAdd, busy }: { onAdd: (symbol: string) => Promise<void>; busy: boolean }) {
  const [criteria, setCriteria] = useState<ScreenCriteria>(DEFAULT_CRITERIA);
  const [result, setResult] = useState<ScreenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<string | null>(null);

  const query = screenQuery(criteria);

  const run = useCallback(async (search: string, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/portfolio/screen?${search}`, { headers: authHeaders(), signal });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "The screen could not be run.");
        return;
      }
      setResult(data);
      setError(null);
    } catch {
      if (!signal?.aborted) setError("Couldn't reach the exchange to run that screen.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change; every setState runs after the await.
    run(query, controller.signal);
    return () => controller.abort();
  }, [query, run]);

  const brief = useMemo(() => (result ? screenBrief(result) : null), [result]);

  const set = <K extends keyof ScreenCriteria>(key: K, value: ScreenCriteria[K]) => {
    setPreset(null);
    setCriteria((current) => ({ ...current, [key]: value }));
  };

  const applyPreset = (key: string) => {
    const chosen = PRESETS.find((entry) => entry.key === key);
    if (!chosen) return;
    track("portfolio.screen", key);
    setPreset(key);
    setCriteria({ ...DEFAULT_CRITERIA, ...chosen.criteria });
  };

  const add = async (symbol: string) => {
    await onAdd(symbol);
    // Re-run so the row disappears from the shortlist: with excludeHeld on it no longer matches,
    // and leaving it on screen would invite a second click that does nothing.
    if (criteria.excludeHeld) await run(query);
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="Screen the exchange"
          blurb="Every BSE-listed company, filtered on this session's published figures and ranked against what you already hold."
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => applyPreset(entry.key)}
              title={entry.blurb}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                preset === entry.key
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40"
              }`}
            >
              {entry.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPreset(null);
              setCriteria(DEFAULT_CRITERIA);
            }}
            className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={LABEL}>
            Cap tier
            <select
              value={criteria.tier}
              onChange={(event) => set("tier", event.target.value as ScreenCriteria["tier"])}
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            >
              <option value="all">Every tier</option>
              <option value="Large">Large cap</option>
              <option value="Mid">Mid cap</option>
              <option value="Small">Small cap</option>
            </select>
          </label>

          <label className={LABEL}>
            Min price ₹
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={criteria.minPrice ?? ""}
              onChange={(event) => set("minPrice", parseField(event.target.value))}
              placeholder="Any"
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            />
          </label>

          <label className={LABEL}>
            Max price ₹
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={criteria.maxPrice ?? ""}
              onChange={(event) => set("maxPrice", parseField(event.target.value))}
              placeholder="Any"
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            />
          </label>

          <label className={LABEL}>
            Min turnover ₹cr
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={criteria.minTurnoverCr ?? ""}
              onChange={(event) => set("minTurnoverCr", parseField(event.target.value))}
              placeholder="Any"
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            />
          </label>

          <label className={LABEL}>
            Min move % today
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={criteria.minChangePercent ?? ""}
              onChange={(event) => set("minChangePercent", parseField(event.target.value))}
              placeholder="Any"
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            />
          </label>

          <label className={LABEL}>
            Max move % today
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={criteria.maxChangePercent ?? ""}
              onChange={(event) => set("maxChangePercent", parseField(event.target.value))}
              placeholder="Any"
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            />
          </label>

          <label className={LABEL}>
            Fit to my book
            <select
              value={criteria.fit}
              onChange={(event) => set("fit", event.target.value as ScreenCriteria["fit"])}
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            >
              <option value="any">Don&apos;t weight for fit</option>
              <option value="diversify">Favour tiers I don&apos;t hold</option>
              <option value="concentrate">Favour tiers I already hold</option>
            </select>
          </label>

          <label className={LABEL}>
            Rank by
            <select
              value={criteria.sort}
              onChange={(event) => set("sort", event.target.value as ScreenCriteria["sort"])}
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            >
              <option value="score">Overall score</option>
              <option value="change">Today&apos;s move</option>
              <option value="turnover">Turnover</option>
              <option value="mcap">Market cap</option>
              <option value="price">Price</option>
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={criteria.excludeHeld}
            onChange={(event) => set("excludeHeld", event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
          />
          Hide stocks already in my portfolio
        </label>
      </section>

      <section className={`${CARD} p-5`}>
        <PanelHeading
          title={loading ? "Screening…" : `${result?.total ?? 0} matches`}
          blurb={
            result
              ? `From ${result.universe?.toLocaleString("en-IN") ?? "the"} listed scrips${result.heldExcluded > 0 ? `, with ${result.heldExcluded} you already hold filtered out` : ""}. Showing the top ${result.matches.length}.`
              : "Filtering the listed universe on this session's figures."
          }
        />

        {result && result.missingTiers.length > 0 && (
          <p className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
            Your book holds nothing in {result.missingTiers.join(", ")} cap. The &ldquo;Fill the gaps&rdquo; preset ranks those first.
          </p>
        )}

        {!loading && result && result.matches.length === 0 && (
          <EmptyPanel>
            Nothing on the exchange matched that screen today. Widening the price band or lowering the turnover floor is
            usually the quickest way back to a list.
          </EmptyPanel>
        )}

        {result && result.matches.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {result.matches.map((match) => (
              <MatchCard key={match.code ?? match.ticker} match={match} busy={busy} onAdd={add} />
            ))}
          </ul>
        )}

        <AiGate feature="portfolio" label="AI portfolio review">
          <AiBoardRead feature="portfolio" brief={brief} />
        </AiGate>
      </section>
    </div>
  );
}
