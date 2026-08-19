"use client";

import { useCallback, useEffect, useState } from "react";
import type { BseAiPredictionAccuracy, PredictionPerformance } from "../lib/bse-ai-prediction-accuracy";
import { CategoryIcon } from "./category-icon";
import { CompanyLogo } from "./company-logo";
import { chipFor, formatQuantity, formatRupee, formatSignedPercent, sectorTone, toneFor } from "./market-format";
import { MarketSection, SectionError, SectionFootnote, SectionSkeleton } from "./market-section";

const ENDPOINT = "/api/predictions/bse-accuracy";
const REFRESH_MS = 60_000;
const PAGE_SIZE = 5;
const CAP_TIERS = ["Large", "Mid", "Small"] as const;
type CapTier = (typeof CAP_TIERS)[number];

const RANK_PILLS = {
  predicted: [
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  ],
  actual: [
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  ],
};

function rankText(row: PredictionPerformance) {
  if (row.matchedActualRank === null) return "No top-10 match";
  if (row.rankDifference === 0) return `Exact rank #${row.matchedActualRank}`;
  return `Actual rank #${row.matchedActualRank}`;
}

function rowSourceText(row: PredictionPerformance) {
  if (row.live && row.asOf) {
    return `Live ${new Date(row.asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return row.priceSource === "BSE Bhavcopy" ? "Official BSE session" : row.priceSource;
}

function sectorName(row: PredictionPerformance) {
  return row.sector || "unclassified";
}

function capName(row: PredictionPerformance) {
  return row.capTier ?? "Unclassified";
}

function rankPillTone(side: "predicted" | "actual", rank: number) {
  const tones = RANK_PILLS[side];
  return tones[(Math.max(rank, 1) - 1) % tones.length];
}

function matchesSearch(row: PredictionPerformance, query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [row.symbol, row.stockName, sectorName(row), capName(row)].some((value) => value.toLowerCase().includes(term));
}

function formatTurnover(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${formatRupee(value, value >= 100 ? 0 : 1)} Cr`;
}

function rowsForCap(rows: PredictionPerformance[], cap: CapTier) {
  return rows.filter((row) => row.capTier === cap);
}

function capRowsFrom(
  groups: BseAiPredictionAccuracy["predictionsByCap"] | BseAiPredictionAccuracy["actualTopByCap"] | undefined,
  fallback: PredictionPerformance[],
  cap: CapTier,
) {
  return groups?.[cap] ?? rowsForCap(fallback, cap);
}

function StockLine({ row, side }: { row: PredictionPerformance; side: "predicted" | "actual" }) {
  const matched = row.matchedActualRank !== null;
  const isPredicted = side === "predicted";
  const sector = sectorName(row);
  const metrics = [
    { label: row.live ? "Live price" : "Last price", value: formatRupee(row.price), tone: "text-slate-900 dark:text-white" },
    { label: "Move", value: formatSignedPercent(row.changePercent), tone: toneFor(row.changePercent) },
    { label: "Low / high", value: `${formatRupee(row.dayLow)} / ${formatRupee(row.dayHigh)}`, tone: "text-slate-700 dark:text-slate-200" },
    { label: "Volume", value: formatQuantity(row.volume), tone: "text-slate-700 dark:text-slate-200" },
    { label: "Turnover", value: formatTurnover(row.turnoverCr), tone: "text-slate-700 dark:text-slate-200" },
  ];

  return (
    <li
      className={`rounded-xl border px-2.5 py-2 ${
        matched
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex w-9 shrink-0 flex-col items-center gap-1">
          <CompanyLogo symbol={row.symbol} size={32} preferReal />
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${rankPillTone(side, row.rank)}`}>
            #{row.rank}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{row.symbol}</p>
            {matched && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                Matched
              </span>
            )}
            {isPredicted && typeof row.confidence === "number" && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                {row.confidence}%
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                row.live
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                  : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
              }`}
              title={rowSourceText(row)}
            >
              {row.live ? "Live" : "BSE"}
            </span>
          </div>
          <p className="truncate text-xs leading-5 text-slate-500 dark:text-slate-400">{row.stockName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${sectorTone(sector)}`}>
              <CategoryIcon category={sector} className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[8rem] truncate">{sector}</span>
            </span>
            <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              {capName(row)} cap
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {formatRupee(row.price)}
            </span>
            {isPredicted && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chipFor(row.changePercent)}`}>
                {rankText(row)}
              </span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-950/70">
                <dt className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{metric.label}</dt>
                <dd className={`mt-0.5 truncate text-[11px] font-black tabular-nums ${metric.tone}`}>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-sm font-black tabular-nums ${toneFor(row.changePercent)}`}>{formatSignedPercent(row.changePercent)}</p>
          <p className={`text-[11px] font-semibold tabular-nums ${toneFor(row.change)}`}>{formatRupee(row.change)}</p>
        </div>
      </div>
    </li>
  );
}

function ListCard({
  title,
  blurb,
  rows,
  empty,
  side,
  cap,
  onCapChange,
}: {
  title: string;
  blurb: string;
  rows: PredictionPerformance[];
  empty: string;
  side: "predicted" | "actual";
  cap: CapTier;
  onCapChange: (cap: CapTier) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // The cap tier is owned by the section and shared with the other board, so it can change from
  // outside this card. Either way it is a different set of ten stocks — page 2 of the old tier is
  // not page 2 of the new one — so the pager goes back to the first page.
  //
  // Adjusted during render rather than in an effect: React re-runs this component with the new
  // page before anything is painted, where an effect would paint the wrong page first and then
  // correct it.
  const [pagedCap, setPagedCap] = useState(cap);
  if (pagedCap !== cap) {
    setPagedCap(cap);
    setPage(1);
  }

  const filteredRows = rows.filter((row) => matchesSearch(row, query));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const showingFrom = filteredRows.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + PAGE_SIZE, filteredRows.length);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50" aria-label={title}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{blurb}</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">
          Cap
          <select
            value={cap}
            aria-label={`${title} cap filter`}
            onChange={(event) => onCapChange(event.target.value as CapTier)}
            className="bg-transparent text-[10px] font-black outline-none"
          >
            {CAP_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          aria-label={`${title} search filter`}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search stock or sector"
          className="h-8 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setPage(1);
          }}
          disabled={!query}
          className="h-8 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        >
          Clear filter
        </button>
      </div>

      {pageRows.length > 0 ? (
        <ol className="space-y-2">
          {pageRows.map((row) => (
            <StockLine key={`${side}-${row.symbol}-${row.rank}`} row={row} side={side} />
          ))}
        </ol>
      ) : (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
          {query ? "No stock matches this filter." : empty}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <span>
          Showing {showingFrom}-{showingTo} of {filteredRows.length} real rows
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            Prev
          </button>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            Page {currentPage}/{pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage === pageCount}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function metaLabel(data: BseAiPredictionAccuracy | null) {
  if (!data) return "Loading AI accuracy";
  if (data.status === "not-generated") return "No locked prediction today";
  if (data.persistedSession) return "Market close snapshot";
  return `${data.accuracy.matched}/${data.accuracy.total} matched`;
}

/**
 * The one sentence this whole board exists to answer: did the AI's ten beat the market's ten?
 *
 * It used to answer it with six composite percentages — lock integrity, confidence calibration,
 * an "AI intelligence" score — and twelve supporting figures underneath them. Every one of those
 * was honestly computed and none of them told a reader who had just arrived what had happened.
 * So the arithmetic is unchanged and the presentation is not: the verdict in words, the two
 * average moves it is drawn from, and nothing a reader has to be taught to read.
 */
function VerdictBanner({
  data,
  cap,
  aiMove,
  marketMove,
  edge,
}: {
  data: BseAiPredictionAccuracy;
  cap: CapTier;
  aiMove: number;
  marketMove: number;
  edge: number;
}) {
  const aiAhead = edge > 0;
  const level = Math.abs(edge) < 0.05 ? "level" : aiAhead ? "ai" : "market";
  const headline =
    level === "level"
      ? "Too close to call"
      : level === "ai"
        ? `The AI is ahead by ${Math.abs(edge).toFixed(2)} points`
        : `The market is ahead by ${Math.abs(edge).toFixed(2)} points`;

  const tones = {
    ai: "border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10",
    market: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10",
    level: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50",
  };

  return (
    <section
      className={`mt-5 rounded-2xl border p-4 ${tones[level]}`}
      aria-label="AI versus market verdict"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-lg font-black text-slate-900 dark:text-white">{headline}</h3>
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {cap} cap · {SESSION_LABEL[data.marketSession]}
          {data.sessionDate ? ` · ${data.sessionDate}` : ""}
        </p>
      </div>

      {/* The two numbers the verdict is the difference between, side by side and nothing between
          them but the word. A reader can check the subtraction in their head, which is the point. */}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="rounded-xl bg-white/80 px-3 py-2 text-center dark:bg-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300">
            The AI&apos;s 10 picks
          </p>
          <p className={`mt-0.5 text-2xl font-black tabular-nums ${toneFor(aiMove)}`}>{formatSignedPercent(aiMove)}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">average move today</p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">vs</span>
        <div className="rounded-xl bg-white/80 px-3 py-2 text-center dark:bg-white/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
            The market&apos;s top 10
          </p>
          <p className={`mt-0.5 text-2xl font-black tabular-nums ${toneFor(marketMove)}`}>
            {formatSignedPercent(marketMove)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">average move today</p>
        </div>
      </div>
    </section>
  );
}

/** One plain answer: a question in words, the answer in figures, and a line saying what it means. */
function PlainCard({
  question,
  answer,
  answerTone = "",
  meaning,
}: {
  question: string;
  answer: string;
  answerTone?: string;
  meaning: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{question}</p>
      <p className={`mt-1 truncate text-xl font-black tabular-nums ${answerTone || "text-slate-900 dark:text-white"}`}>
        {answer}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{meaning}</p>
    </div>
  );
}

function nextLockShort(data: BseAiPredictionAccuracy) {
  const at = new Date(data.nextLockAt);
  const time = at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const day = at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  return `${time}, ${day}`;
}

/**
 * The board, as three questions a first-time reader actually has.
 *
 * How many did it get right; which one did best; when does the list change. Everything else that
 * used to be here — rank accuracy, calibration, lock integrity, the twelve-figure comparison — was
 * either derivable from the rows below or only meaningful to somebody who already knew how the
 * screen worked, which is nobody arriving at it for the first time.
 */
function PlainSummary({
  data,
  cap,
  predicted,
  actual,
}: {
  data: BseAiPredictionAccuracy;
  cap: CapTier;
  predicted: PredictionPerformance[];
  actual: PredictionPerformance[];
}) {
  const score = data.scorecard.byCap[cap];
  const best = [...predicted].sort((left, right) => (right.changePercent ?? -Infinity) - (left.changePercent ?? -Infinity))[0];
  const marketLeader = actual[0];

  return (
    <>
      <VerdictBanner
        data={data}
        cap={cap}
        aiMove={score.avgPickMovePercent}
        marketMove={score.avgMarketMovePercent}
        edge={score.edgePercent}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PlainCard
          question="Picks that landed"
          answer={`${score.hitCount} of 10`}
          meaning={`In today's real ${cap.toLowerCase()} cap top 10.`}
        />
        <PlainCard
          question="The AI's best pick"
          answer={best ? best.symbol : "—"}
          answerTone="text-slate-900 dark:text-white"
          meaning={best ? `${formatSignedPercent(best.changePercent)} today.` : "No picks are locked for this tier."}
        />
        <PlainCard
          question="The market's best"
          answer={marketLeader ? marketLeader.symbol : "—"}
          answerTone="text-slate-900 dark:text-white"
          meaning={marketLeader ? `${formatSignedPercent(marketLeader.changePercent)} today.` : "The live board is empty."}
        />
        <PlainCard
          question="Next list of 10"
          answer={nextLockShort(data)}
          answerTone="text-slate-900 dark:text-white"
          meaning="All 10 stocks are replaced at that lock."
        />
      </div>

      {/* One row, one number each: how many of that tier's ten are in its live top ten. The reader
          switches tiers with the dropdowns on the boards below; this is what they would switch for. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Picks that landed, per tier
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {CAP_TIERS.map((tier) => (
            <span
              key={tier}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums ${
                tier === cap
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200"
                  : "bg-white text-slate-500 dark:bg-white/10 dark:text-slate-400"
              }`}
            >
              {tier} {data.scorecard.byCap[tier].hitCount}/10
            </span>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {data.source === "ai" && data.model ? `Picked by ${data.model}.` : "Picked by the fallback ranking."} Locked
          at 8:50 AM IST{data.lockDate ? ` on ${data.lockDate}` : ""}.
        </p>
      </div>
    </>
  );
}

/** How the live board should describe itself: only a real session is "live". */
const SESSION_LABEL: Record<BseAiPredictionAccuracy["marketSession"], string> = {
  "pre-open": "Pre-open",
  live: "Live session",
  closed: "Session closed",
  holiday: "No session today",
};

const SESSION_BLURB: Record<BseAiPredictionAccuracy["marketSession"], string> = {
  "pre-open": "Ranked on the last completed BSE session until the 9:15 AM IST open, then re-ranked live all session.",
  live: "Live BSE session: the top 10 of this cap tier is re-ranked from current performance every minute, so this board changes during the day.",
  closed: "The 3:30 PM IST close: this is where the top 10 of this cap tier finished today.",
  holiday: "No BSE session today. Showing the last completed session's top 10 for this cap tier.",
};

export function AiPredictionAccuracySection() {
  const [data, setData] = useState<BseAiPredictionAccuracy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // One cap tier for both boards. Scoring the AI's large caps against the market's small caps
  // compares nothing, so the two selects are two handles on the same choice: changing either one
  // moves both lists and the three cards with them.
  const [cap, setCap] = useState<CapTier>("Large");

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error("Request failed");
      setData((await response.json()) as BseAiPredictionAccuracy);
      setError(null);
    } catch {
      setError("Couldn't reach the BSE AI prediction accuracy feed right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // The minute refresh, paused while the tab is in the background: a section nobody is looking at
  // does not need new prices, and the request, parse and re-render it skips is main-thread time
  // charged to whatever the reader is actually looking at. Returning to the tab refreshes at once,
  // so what is on screen is never stale.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void load();
    };

    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const predictedRows = data?.predictions ?? [];
  const actualRows = data?.actualTop ?? [];
  const predictedCapRows = capRowsFrom(data?.predictionsByCap, predictedRows, cap);
  const actualCapRows = capRowsFrom(data?.actualTopByCap, actualRows, cap);

  return (
    <MarketSection
      id="ai-prediction-accuracy"
      eyebrow="AI prediction accuracy"
      eyebrowClass="text-violet-600 dark:text-violet-400"
      title="Locked AI picks versus real BSE top performers"
      blurb="Every trading morning at 8:50, 25 minutes before the market opens, the AI reads the day's positive news and names 10 stocks. The list is then locked for the day. Below: those 10 against the 10 that actually did best."
      aside={
        <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
          {data?.status === "locked" ? `${data.accuracy.matched} of ${data.accuracy.total} picks landed` : metaLabel(data)}
        </div>
      }
    >
      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={4} height="h-20" />}

      {!loading && data && (
        <>
          <PlainSummary data={data} cap={cap} predicted={predictedCapRows} actual={actualCapRows} />

          {data.holdover && (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              {data.message}
            </p>
          )}

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <ListCard
              title="AI locked picks before open"
              blurb={
                data.holdover
                  ? `Locked at 8:50 AM IST on ${data.lockDate} and held until the next 8:50 AM lock replaces all 10.`
                  : "Locked at 8:50 AM IST, 25 minutes before the open. The stock list is fixed for the day; only live price, move and return fields refresh."
              }
              rows={predictedCapRows}
              empty={data.message}
              side="predicted"
              cap={cap}
              onCapChange={setCap}
            />
            <ListCard
              title="Actual top performers live today"
              blurb={
                data.persistedSession
                  ? "Showing the saved market-close performers until the next session begins."
                  : SESSION_BLURB[data.marketSession]
              }
              rows={actualCapRows}
              empty={`No ${cap} cap row is present in the current real top performers feed.`}
              side="actual"
              cap={cap}
              onCapChange={setCap}
            />
          </div>
        </>
      )}

      <SectionFootnote>
        Predictions are experimental and not financial advice. Live prices and returns are never generated by AI; they come from the app&apos;s BSE market feed and are refreshed every minute.
      </SectionFootnote>
    </MarketSection>
  );
}
