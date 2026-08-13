"use client";

import { useState } from "react";
import { HEAD_TO_HEAD_PICKS, type Contender, type MatchResult, type Side } from "../lib/head-to-head";
import { StockCombobox } from "./stock-combobox";

/**
 * Human against the AI, on the landing page.
 *
 * The pitch of the whole site is that the AI is worth paying for. This is the one place a visitor
 * gets to test that claim themselves before signing up for anything, so it has to be losable: the
 * AI picks by its own conviction and both sides are graded by the same arithmetic, rather than the
 * AI optimising the grading function and winning by construction. The honesty is the marketing.
 *
 * The two sides are separate cards on purpose — sky for the reader, violet for the machine, the
 * same two hues they carry everywhere else in the app — with the verdict between them rather than
 * on either. A single table of ten rows would have made this a data grid; it is meant to read as a
 * fixture.
 *
 * Nothing is stored. The match lives as long as the tab does.
 */

const EMPTY: string[] = Array.from({ length: HEAD_TO_HEAD_PICKS }, () => "");

/** Sky for the human, violet for the AI — held in one place so the two cards cannot drift apart. */
const CHROME = {
  human: {
    card: "border-sky-200 bg-sky-50/70 dark:border-sky-500/25 dark:bg-sky-500/10",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
    bar: "bg-sky-500 dark:bg-sky-400",
    score: "text-sky-700 dark:text-sky-300",
  },
  ai: {
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-500/25 dark:bg-violet-500/10",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
    bar: "bg-violet-500 dark:bg-violet-400",
    score: "text-violet-700 dark:text-violet-300",
  },
} as const;

export function formatReturn(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function returnTone(value: number | null): string {
  if (value === null || Number.isNaN(value) || value === 0) return "text-slate-500 dark:text-slate-400";
  return value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

/** The headline over the two cards, in the reader's own terms. */
export function verdictLine(result: MatchResult): string {
  if (result.winner === "draw") return "Dead heat — nothing in it";
  if (result.winner === "human") return `You win by ${result.margin}`;
  return `The AI wins by ${result.margin}`;
}

function PickRow({ pick, tone }: { pick: Contender; tone: string }) {
  return (
    <li className="flex items-center gap-3 border-t border-white/70 py-2 first:border-t-0 dark:border-white/5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{pick.symbol}</p>
        {pick.name && <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{pick.name}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-xs font-semibold tabular-nums ${returnTone(pick.oneYear)}`}>{formatReturn(pick.oneYear)}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">1 year</p>
      </div>
      <div className="w-12 shrink-0 text-right">
        <p className={`text-sm font-bold tabular-nums ${tone}`}>{pick.score}</p>
      </div>
    </li>
  );
}

function SideCard({
  side,
  who,
  title,
  blurb,
  won,
}: {
  side: Side;
  who: "human" | "ai";
  title: string;
  blurb: string;
  won: boolean;
}) {
  const chrome = CHROME[who];

  return (
    <section
      className={`flex flex-col rounded-3xl border p-5 transition ${chrome.card} ${won ? "ring-2 ring-emerald-400/60" : ""}`}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${chrome.badge}`}>
            {title}
          </span>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-4xl font-bold tabular-nums ${chrome.score}`}>{side.score}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Score</p>
        </div>
      </div>

      {/* 0-100, so the bar is the score itself rather than a share of anything. */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
        <div className={`h-full rounded-r-[4px] transition-[width] duration-500 ${chrome.bar}`} style={{ width: `${side.score}%` }} />
      </div>

      <ul className="mt-3">
        {side.picks.map((pick) => (
          <PickRow key={pick.symbol} pick={pick} tone={chrome.score} />
        ))}
      </ul>
    </section>
  );
}

export function HeadToHead() {
  const [picks, setPicks] = useState<string[]>(EMPTY);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const chosen = picks.filter((symbol) => symbol.trim() !== "");
  const ready = chosen.length === HEAD_TO_HEAD_PICKS;

  const setPick = (index: number, value: string) => {
    setPicks((previous) => previous.map((symbol, position) => (position === index ? value.toUpperCase() : symbol)));
    // The old verdict belongs to the old line-up. Leaving it up while the reader edits their team
    // would show a result for five stocks that are no longer the five on screen.
    setResult(null);
    setError(null);
  };

  const play = async () => {
    setPlaying(true);
    setError(null);
    try {
      const response = await fetch("/api/head-to-head", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: chosen }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't play that match.");
        return;
      }
      setResult(data as MatchResult);
    } catch {
      setError("Couldn't reach the market data for this match.");
    } finally {
      setPlaying(false);
    }
  };

  const reset = () => {
    setPicks(EMPTY);
    setResult(null);
    setError(null);
  };

  return (
    <section id="head-to-head" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-sky-600 dark:text-sky-400">Head to head</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          You against the AI, five stocks each
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Pick any five companies on the BSE. The AI picks five of its own — by what it rates highest for tomorrow, not by
          the formula it is about to be marked on. Both sides are then scored on the same real returns, out of 100. It is
          a fair fight, and the AI does not always take it.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {picks.map((symbol, index) => (
          <div key={index}>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pick {index + 1}
            </label>
            <StockCombobox
              value={symbol}
              onChange={(value) => setPick(index, value)}
              onSelect={(value) => setPick(index, value)}
              // Every other slot, so the same company cannot be fielded twice.
              exclude={picks.filter((_, position) => position !== index)}
              placeholder="Search a company"
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void play()}
          disabled={!ready || playing}
          className="h-11 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] transition hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {playing ? "Scoring the match..." : "Play the AI"}
        </button>

        {(result || chosen.length > 0) && (
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-full border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
          >
            Start over
          </button>
        )}

        {!ready && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {HEAD_TO_HEAD_PICKS - chosen.length} more to pick.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-5">
          <div
            // Announced, because the verdict is the entire payload of this section and a reader
            // using a screen reader would otherwise get two cards and no result.
            role="status"
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950/60"
          >
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{verdictLine(result)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Scored on weighted one-week to one-year returns, the same measure used across the site.
              {result.aiSource === "heuristic" && " The AI's picks came from the fallback ranking this time."}
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SideCard
              side={result.human}
              who="human"
              title="You"
              blurb="The five you chose."
              won={result.winner === "human"}
            />
            <SideCard
              side={result.ai}
              who="ai"
              title="The AI"
              blurb="Its five highest-conviction names today."
              won={result.winner === "ai"}
            />
          </div>
        </div>
      )}
    </section>
  );
}
