"use client";

import { useEffect, useState } from "react";
import { HEAD_TO_HEAD_PICKS, type Contender, type MatchResult, type Side } from "../lib/head-to-head";
import { CapTierBadge } from "./cap-tier-badge";
import { CompanyLogo } from "./company-logo";
import { StockCombobox } from "./stock-combobox";

/**
 * Human against the AI, on the landing page.
 *
 * The pitch of the whole site is that the AI is worth paying for. This is the one place a visitor
 * gets to test that claim themselves before signing up for anything, so it has to be losable: the
 * AI picks by its own conviction and both sides are graded by the same arithmetic, rather than the
 * AI optimising the grading function and winning by construction. The honesty is the marketing.
 *
 * The AI's five stay blurred until the reader commits. Its team is not chosen — not even fetched —
 * until the human's five are locked and sent, so there is nothing on the page to read ahead and
 * copy, and the blur is covering a genuine unknown rather than an answer already in the browser.
 *
 * The two sides are separate cards, sky for the reader and violet for the machine, the same two
 * hues they carry everywhere else in the app. Nothing is stored; the match lives as long as the tab.
 */

const EMPTY: string[] = Array.from({ length: HEAD_TO_HEAD_PICKS }, () => "");

/** The countdown before the verdict, in seconds. Long enough to feel like a fight starting. */
export const COUNTDOWN_FROM = 10;

/** How long the fireworks run for once the verdict lands. */
export const CELEBRATION_MS = 20_000;

/** The countdown ring, in the 100x100 viewBox it is drawn in. */
const RING_RADIUS = 44;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

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

/** What a locked slot shows: the company, its mark, its industry and its tier. */
type SlotPick = { symbol: string; name: string | null; sector: string | null; capTier: string | null };

function slotsFrom(picks: Contender[] | undefined): SlotPick[] {
  return (picks ?? []).map((pick) => ({
    symbol: pick.symbol,
    name: pick.name,
    sector: pick.sector,
    capTier: pick.capTier,
  }));
}

/**
 * One locked pick, on either side.
 *
 * The two line-ups differ only in colour, so they share this: the company's real mark, its ticker,
 * its cap tier, its name and the industry the exchange files it under. A ticker on its own is a
 * code; this is a company.
 */
function LockedSlot({ pick, chrome, label }: { pick: SlotPick; chrome: "human" | "ai"; label: string }) {
  const tone =
    chrome === "human"
      ? "border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
      : "border-violet-200 bg-violet-50/70 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200";

  return (
    <div aria-label={label} className={`flex w-full items-center gap-2 overflow-hidden rounded-xl border px-2 py-1.5 ${tone}`}>
      <CompanyLogo symbol={pick.symbol} size={24} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-bold">{pick.symbol}</span>
          <CapTierBadge raw={pick.capTier} />
        </span>
        {pick.name && <span className="block truncate text-[10px] opacity-70">{pick.name}</span>}
        {sectorLabel(pick.sector) && (
          <span className="block truncate text-[9px] font-semibold opacity-60">{sectorLabel(pick.sector)}</span>
        )}
      </span>
    </div>
  );
}

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

/** Where the bursts sit on a card, and when each one goes off. */
const BURSTS = [
  { left: "22%", top: "26%", delay: 0, hue: "bg-amber-400" },
  { left: "72%", top: "18%", delay: 0.45, hue: "bg-sky-400" },
  { left: "48%", top: "58%", delay: 0.9, hue: "bg-fuchsia-400" },
];

/** Sparks per burst. Twelve reads as a firework; more is just heat. */
const SPARKS = 12;

/**
 * The fireworks over a settled card.
 *
 * Purely decorative and hidden from assistive technology: the verdict is the text underneath, and
 * a screen reader working through thirty-six sparks would bury the one line that matters.
 *
 * Each spark is handed the direction it flies in as CSS custom properties, so one keyframe rule in
 * globals.css serves every angle of every burst. Only transform and opacity move, which keeps all
 * of this off the main thread while it runs.
 */
function Fireworks() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      {BURSTS.map((burst, burstIndex) => (
        <span key={burstIndex} className="absolute" style={{ left: burst.left, top: burst.top }}>
          {Array.from({ length: SPARKS }, (_, sparkIndex) => {
            const angle = (sparkIndex / SPARKS) * 2 * Math.PI;
            const reach = 34 + ((sparkIndex * 5) % 16);
            return (
              <span
                key={sparkIndex}
                className={`animate-firework-spark absolute block h-1.5 w-1.5 rounded-full ${burst.hue}`}
                style={
                  {
                    "--dx": `${Math.cos(angle) * reach}px`,
                    "--dy": `${Math.sin(angle) * reach}px`,
                    animationDelay: `${burst.delay}s`,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}

/**
 * Every window the exchange has for a company, shortest first.
 *
 * `scored` marks the four `momentumScore` actually weighs. The rest are shown because a reader
 * comparing two companies wants the whole record — but they are marked, because a five-year return
 * sitting next to a score that never read it would be quietly misleading.
 */
type MatrixKey = keyof Pick<
  Contender,
  "oneDay" | "oneWeek" | "oneMonth" | "threeMonth" | "sixMonth" | "oneYear" | "threeYear" | "fiveYear" | "overall"
>;

const MATRIX: { key: MatrixKey; label: string; scored: boolean }[] = [
  { key: "oneDay", label: "1D", scored: false },
  { key: "oneWeek", label: "1W", scored: true },
  { key: "oneMonth", label: "1M", scored: true },
  { key: "threeMonth", label: "3M", scored: false },
  { key: "sixMonth", label: "6M", scored: true },
  { key: "oneYear", label: "1Y", scored: true },
  { key: "threeYear", label: "3Y", scored: false },
  { key: "fiveYear", label: "5Y", scored: false },
  { key: "overall", label: "ALL", scored: false },
];

function PickRow({ pick, tone }: { pick: Contender; tone: string }) {
  // A company the price feed could not answer for has no windows at all. Its score is the engine's
  // neutral 50 rather than a measurement, and saying so is the difference between an honest card
  // and one that quietly presents a default as a result.
  const unpriced = MATRIX.every((window) => pick[window.key] === null);

  return (
    <li className="border-t border-white/70 py-1.5 first:border-t-0 dark:border-white/5">
      {/* One row that wraps rather than two breakpoint copies of the same figures: duplicating the
          matrix would put every return twice into the accessibility tree, where a screen reader
          reads both. `w-full` drops it to its own line on a narrow screen; `sm:w-auto` lets it sit
          beside the company name when there is room. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CompanyLogo symbol={pick.symbol} size={24} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold leading-tight text-slate-900 dark:text-white">
              {pick.symbol}
            </span>
            <CapTierBadge raw={pick.capTier} />
          </p>
          {pick.name && <p className="truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">{pick.name}</p>}
          {/* The live last-traded price, from the same 60-second quote cache the boards read. It
              is what makes the row a company at a price rather than a ticker and a grade. */}
          {pick.price !== null && (
            <p className="truncate text-[10px] font-semibold leading-tight tabular-nums text-slate-700 dark:text-slate-300">
              ₹{pick.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
          {unpriced && (
            <p className="truncate text-[9px] font-semibold leading-tight text-amber-600 dark:text-amber-400">
              No price history — scored neutral
            </p>
          )}
        </div>

        <div className="w-9 shrink-0 text-right">
          <p className={`text-sm font-bold tabular-nums ${tone}`} title={unpriced ? "Neutral: no returns to score" : undefined}>
            {pick.score}
          </p>
        </div>

        {/* The whole record. The four windows the score weighs are ringed and carry a dot; the
            rest are context. A reader can see why one stock scored above another rather than
            taking the number on trust, and can also see what the score did not look at. */}
        <dl className="grid w-full shrink-0 grid-cols-5 gap-1 sm:grid-cols-9">
          {MATRIX.map((window) => (
            <div
              key={window.key}
              title={window.scored ? `${window.label} — counts towards the score` : `${window.label} — shown, not scored`}
              className={`rounded-md px-1 py-0.5 text-center ${
                window.scored
                  ? "bg-white ring-1 ring-slate-300 dark:bg-white/10 dark:ring-white/20"
                  : "bg-white/50 dark:bg-white/[0.04]"
              }`}
            >
              <dt className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {window.label}
                {window.scored && <span aria-hidden="true"> ·</span>}
              </dt>
              <dd className={`text-[10px] font-semibold leading-tight tabular-nums ${returnTone(pick[window.key])}`}>
                {formatReturn(pick[window.key])}
              </dd>
            </div>
          ))}
        </dl>
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
  celebrating,
  tag,
}: {
  side: Side;
  who: "human" | "ai";
  title: string;
  blurb: string;
  won: boolean;
  celebrating: boolean;
  /** A second badge beside the title — the AI's chosen lens for this match. */
  tag?: string;
}) {
  const chrome = CHROME[who];

  return (
    <section
      className={`relative flex flex-col rounded-3xl border p-5 transition ${chrome.card} ${won ? "ring-2 ring-emerald-400/60" : ""} ${celebrating ? "animate-celebrate-glow" : ""}`}
      aria-label={title}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${chrome.badge}`}>
              {title}
            </span>
            {tag && (
              <span className="inline-flex rounded-full border border-current/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
                {tag}
              </span>
            )}
          </div>
          {/* Clamped: the skill blurbs run to two lines and were pushing the two cards to
              different heights depending on which lens the AI happened to draw. */}
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400">{blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-3xl font-bold leading-none tabular-nums ${chrome.score}`}>{side.score}</p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Score</p>
        </div>
      </div>

      {/* 0-100, so the bar is the score itself rather than a share of anything. */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/70 dark:bg-white/10">
        <div className={`h-full rounded-r-[4px] transition-[width] duration-500 ${chrome.bar}`} style={{ width: `${side.score}%` }} />
      </div>

      <ul className="mt-1.5">
        {side.picks.map((pick) => (
          <PickRow key={pick.symbol} pick={pick} tone={chrome.score} />
        ))}
      </ul>

      {celebrating && <Fireworks />}
    </section>
  );
}

export function HeadToHead() {
  const [picks, setPicks] = useState<string[]>(EMPTY);
  const [result, setResult] = useState<MatchResult | null>(null);
  /**
   * The played match, held back until the reader asks for the score.
   *
   * Both line-ups and both scores arrive together, in the one request the lock fires. Only the
   * line-ups are shown at that point — the scores wait for "Check Score" and the countdown after
   * it. Fetching twice would let the AI's team and the marking disagree about which day it was.
   */
  const [locked, setLocked] = useState<MatchResult | null>(null);
  const [locking, setLocking] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = picks.filter((symbol) => symbol.trim() !== "");
  const ready = chosen.length === HEAD_TO_HEAD_PICKS;
  const counting = countdown !== null;
  // Once locked, both teams are on the table and neither side can be edited. The scores are still
  // behind the countdown; this is only "the hands are down".
  const revealed = result ?? locked;
  const aiPicks: AiPick[] = revealed?.ai.picks.map((pick) => ({ symbol: pick.symbol, name: pick.name })) ?? [];
  const humanPicks: AiPick[] = revealed?.human.picks.map((pick) => ({ symbol: pick.symbol, name: pick.name })) ?? [];

  // One tick a second while a fight is on.
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    // The next value is computed from the `countdown` this effect closed over rather than through
    // a functional update: the guard above and the cleanup below mean this timer only ever fires
    // for the count it was scheduled against, so there is no staler value to defend against.
    const timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  // Zero: the scores come out and the fireworks start. The match itself was settled at the lock.
  useEffect(() => {
    if (countdown !== 0 || !locked) return;
    setResult(locked);
    setCountdown(null);
    setCelebrating(true);
  }, [countdown, locked]);

  // Twenty seconds of fireworks, then quiet. Cleared on unmount so a reader who scrolls away and
  // comes back does not find a timer still running over the old match.
  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  const setPick = (index: number, value: string) => {
    setPicks((previous) => previous.map((symbol, position) => (position === index ? value.toUpperCase() : symbol)));
    // The old match belongs to the old line-up. Leaving either the lock or the verdict up while
    // the reader edits their team would show a result for five stocks no longer on screen.
    setResult(null);
    setLocked(null);
    setCelebrating(false);
    setError(null);
  };

  /** Locks the reader's five and has the AI answer them. Scores come back too, and wait. */
  const lock = async () => {
    setError(null);
    setLocking(true);

    try {
      const response = await fetch("/api/head-to-head", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: chosen }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't lock that line-up.");
        return;
      }
      setLocked(data as MatchResult);
    } catch {
      setError("Couldn't reach the market data for this match.");
    } finally {
      setLocking(false);
    }
  };

  /** Starts the clock on a match already decided, so the reveal is paced rather than instant. */
  const check = () => {
    setError(null);
    setCelebrating(false);
    setCountdown(COUNTDOWN_FROM);
  };

  const reset = () => {
    setPicks(EMPTY);
    setResult(null);
    setLocked(null);
    setCountdown(null);
    setCelebrating(false);
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
          Pick any five companies on the BSE and lock them in. Only then does the AI answer with five of its own — drawn
          on the exchange&apos;s long-run record and its own forward view, never the formula it is about to be marked on.
          Both sides are then scored on the same real returns, out of 100. It is a fair fight, and the AI does not
          always take it.
        </p>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
          {revealed ? "Your five — locked" : "Your five"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {picks.map((symbol, index) => (
            <div key={index}>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pick {index + 1}
              </label>
              {humanPicks[index] ? (
                // Locked. The search boxes are gone rather than disabled: once the AI has answered
                // this line-up, a greyed-out field still looks like something you might edit.
                // Driven off the scored contenders rather than the typed strings, so the tile shows
                // the company the server actually priced.
                <div
                  aria-label={`Your pick ${index + 1}`}
                  className="flex h-10 w-full items-center gap-2 overflow-hidden rounded-xl border border-sky-200 bg-sky-50/70 px-2 dark:border-sky-500/30 dark:bg-sky-500/10"
                >
                  <CompanyLogo symbol={humanPicks[index].symbol} size={22} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-xs font-bold text-sky-900 dark:text-sky-200">
                      {humanPicks[index].symbol}
                    </span>
                    {humanPicks[index].name && (
                      <span className="block truncate text-[10px] text-sky-700/70 dark:text-sky-300/70">
                        {humanPicks[index].name}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <StockCombobox
                  value={symbol}
                  onChange={(value) => setPick(index, value)}
                  onSelect={(value) => setPick(index, value)}
                  // Every other slot, so the same company cannot be fielded twice.
                  exclude={picks.filter((_, position) => position !== index)}
                  placeholder="Search a company"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          {revealed ? "The AI's five — locked" : "The AI's five — chosen when you lock yours in"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: HEAD_TO_HEAD_PICKS }, (_, index) => {
            const pick = aiPicks[index];
            return (
              <div key={index}>
                <label
                  className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  htmlFor={`ai-pick-${index}`}
                >
                  AI pick {index + 1}
                </label>
                {pick ? (
                  // Revealed: a tile rather than the select, because a <select> cannot hold an
                  // image and the company's own mark is most of what makes a ticker recognisable.
                  <div
                    id={`ai-pick-${index}`}
                    aria-label={`AI pick ${index + 1}`}
                    className="flex h-10 w-full items-center gap-2 overflow-hidden rounded-xl border border-violet-200 bg-violet-50/70 px-2 dark:border-violet-500/30 dark:bg-violet-500/10"
                  >
                    <CompanyLogo symbol={pick.symbol} size={22} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-xs font-bold text-violet-900 dark:text-violet-200">
                        {pick.symbol}
                      </span>
                      {pick.name && (
                        <span className="block truncate text-[10px] text-violet-700/70 dark:text-violet-300/70">
                          {pick.name}
                        </span>
                      )}
                    </span>
                  </div>
                ) : (
                  /* Still hidden. A real select, locked and blurred, mirroring the shape of the
                     reader's own five so the two line-ups read as opposing teams. The placeholder
                     under the blur is deliberately ticker-shaped: a blurred blank box reads as
                     broken, a blurred ticker reads as withheld. */
                  <select
                    id={`ai-pick-${index}`}
                    disabled
                    // No `onChange`, and no warning for the want of one: React only asks for a
                    // handler on a field somebody could actually change, and this one is disabled.
                    value=""
                    className="h-10 w-full cursor-not-allowed select-none truncate rounded-xl border border-violet-200 bg-violet-50/70 px-3 text-sm font-semibold text-violet-900 blur-[5px] disabled:opacity-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200"
                  >
                    <option value="">▮▮▮▮▮▮</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {revealed
            ? "Both line-ups are locked. Check the score when you are ready."
            : "Pick your five, then lock them in. Only then does the AI choose — so there is nothing here to copy."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Two steps, two buttons. Locking is what sends the line-up and brings the AI's answer
            back; checking the score is what starts the clock on a match already decided. Keeping
            them separate is what lets the reader see the opposition before the verdict. */}
        {revealed ? (
          <button
            type="button"
            onClick={check}
            disabled={counting || result !== null}
            className="h-11 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] transition hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {counting ? "Fight on..." : result ? "Scored" : "Check Score"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void lock()}
            disabled={!ready || locking}
            className="h-11 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-6 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] transition hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {locking ? "Locking in..." : "Lock Now"}
          </button>
        )}

        {(result || chosen.length > 0) && !counting && (
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-full border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
          >
            Start over
          </button>
        )}

        {!ready && !counting && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {HEAD_TO_HEAD_PICKS - chosen.length} more to pick.
          </p>
        )}
      </div>

      {/* Tested against null rather than through `counting`, so the count is narrowed to a number
          inside and the bar needs no fallback for a case this block cannot be rendered in. */}
      {countdown !== null && (
        <div
          role="status"
          aria-live="assertive"
          className="mt-5 flex flex-col items-center rounded-3xl border border-amber-200 bg-amber-50/70 p-6 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          {/* Both line-ups are already on the table by this point — the clock is the marking. */}
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
            Scoring both sides
          </p>

          <div className="relative mt-3 h-32 w-32">
            {/* Rotated so the ring starts draining from twelve o'clock rather than three. */}
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="8" className="stroke-amber-200 dark:stroke-amber-500/25" />
              <circle
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                // Offset grows as the count falls, so the ring empties anticlockwise in step with
                // the number. `ease-linear` over exactly one second makes the sweep match the tick
                // instead of easing out early and sitting still.
                strokeDashoffset={RING_LENGTH * (1 - countdown / COUNTDOWN_FROM)}
                className="stroke-amber-500 transition-[stroke-dashoffset] duration-1000 ease-linear dark:stroke-amber-400"
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-5xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {countdown}
            </span>
          </div>

          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Marking both line-ups on the same real returns.
          </p>
        </div>
      )}

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
              celebrating={celebrating}
            />
            <SideCard
              side={result.ai}
              who="ai"
              title="The AI"
              // Which lens it used this time, in its own words. The AI draws a different one each
              // match, so without this the five would look arbitrary rather than argued for.
              blurb={result.aiSkill.blurb}
              won={result.winner === "ai"}
              celebrating={celebrating}
              tag={result.aiSkill.label}
            />
          </div>
        </div>
      )}
    </section>
  );
}
