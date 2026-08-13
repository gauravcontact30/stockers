"use client";

import { useMemo } from "react";
import { formatMoney, formatPercent, toneFor, type PortfolioSummary } from "../lib/portfolio-metrics";
import { reviewBrief, reviewPortfolio, WEIGHT_CAP, type Finding, type Severity } from "../lib/portfolio-review";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CARD, EmptyPanel, LABEL, PanelHeading, Tile } from "./portfolio-chrome";

/**
 * Is this book built well?
 *
 * The holdings grid answers "what is it worth" and the totals answer "am I up". Neither says
 * anything about how the portfolio is *constructed* — whether one name is quietly steering it,
 * whether twelve positions are behaving like three, whether a target that was set two years ago
 * has been reached and nobody noticed.
 *
 * Every finding is arithmetic over measured positions, and every one that suggests an action gives
 * the arithmetic of that action rather than an instruction. "Trimming to 25% would free ₹40,000"
 * is a fact the reader can act on or ignore; "sell RELIANCE" is advice this app does not give.
 *
 * The grade is deliberately the smallest thing on the panel. It is derived from the findings, not
 * the other way around, and a letter is easy to argue with in a way a list of specifics is not.
 */

const SEVERITY_STYLE: Record<Severity, { chip: string; card: string; word: string }> = {
  critical: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    card: "border-rose-200 dark:border-rose-500/30",
    word: "Address first",
  },
  warning: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    card: "border-amber-200 dark:border-amber-500/30",
    word: "Worth a look",
  },
  note: {
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    card: "border-slate-200 dark:border-slate-800",
    word: "For information",
  },
  good: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    card: "border-emerald-200 dark:border-emerald-500/30",
    word: "Going well",
  },
};

const GRADE_TONE: Record<string, string> = {
  A: "text-emerald-600 dark:text-emerald-400",
  B: "text-emerald-600 dark:text-emerald-400",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-orange-600 dark:text-orange-400",
  E: "text-rose-600 dark:text-rose-400",
};

function FindingCard({ finding }: { finding: Finding }) {
  const style = SEVERITY_STYLE[finding.severity];

  return (
    <li className={`rounded-2xl border bg-white p-4 dark:bg-slate-900 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{finding.title}</h4>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.chip}`}>{style.word}</span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{finding.detail}</p>

      {finding.action && (
        <p className="mt-2 rounded-xl bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-950/50 dark:text-slate-400">
          {finding.action}
        </p>
      )}

      {finding.symbols.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {finding.symbols.map((symbol) => (
            <span
              key={symbol}
              className="rounded-full border border-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              {symbol}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export function PortfolioReview({ summary }: { summary: PortfolioSummary }) {
  const review = useMemo(() => reviewPortfolio(summary), [summary]);
  const brief = useMemo(() => reviewBrief(summary, review), [summary, review]);

  if (summary.holdings.length === 0) {
    return (
      <EmptyPanel>
        Add a few positions and this reviews how the book is built — concentration, diversification, the targets you set and
        what the arithmetic of rebalancing would look like.
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="How this book is built"
          blurb="Structure rather than performance: whether the money is spread the way you meant it to be."
          aside={
            <div className="text-right">
              <p className={`text-4xl font-bold leading-none ${GRADE_TONE[review.grade] ?? ""}`}>{review.grade}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{review.score}/100 structure</p>
            </div>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Effective holdings"
            value={review.effectiveHoldings > 0 ? review.effectiveHoldings.toFixed(1) : "—"}
            hint={`${summary.owned} owned, weighted`}
          />
          <Tile
            label="Largest weight"
            value={`${Math.round(summary.concentration * 100)}%`}
            hint={`Cap is ${Math.round(WEIGHT_CAP * 100)}%`}
            tone={summary.concentration > WEIGHT_CAP ? "text-amber-600 dark:text-amber-400" : ""}
          />
          <Tile
            label="Up vs down"
            value={`${review.winners} / ${review.losers}`}
            hint="Priced positions against cost"
          />
          <Tile
            label="Targets set"
            value={`${review.targetsReached} / ${review.withTargets}`}
            hint="Reached of those you set"
          />
        </div>

        {/* The number the concentration tile is a summary of. Spelled out because "effective
            holdings" is an unfamiliar phrase and the sentence is what makes it land. */}
        {review.effectiveHoldings > 0 && summary.owned > review.effectiveHoldings + 0.5 && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            There are {summary.owned} owned positions, but the weights are uneven enough that the book moves like{" "}
            <span className="font-semibold text-slate-900 dark:text-white">{review.effectiveHoldings.toFixed(1)}</span>{" "}
            evenly-sized ones.
          </p>
        )}

        <div className="mt-5">
          <p className={LABEL}>What the figures say — most important first</p>
          <ul className="mt-2 grid gap-3 lg:grid-cols-2">
            {review.findings.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </ul>
        </div>

        {review.rebalance.length > 0 && (
          <div className="mt-5">
            <p className={LABEL}>If you wanted to rebalance</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              What it would take to bring each oversized position back to {Math.round(WEIGHT_CAP * 100)}% of market value.
              These are measurements, not recommendations — a concentrated position you chose on purpose is a decision, not
              an error.
            </p>
            <ul className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              {review.rebalance.map((trim) => (
                <li
                  key={trim.symbol}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800"
                >
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{trim.symbol}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {Math.round(trim.weight * 100)}% of market value
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(trim.excessValue)}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {trim.suggestedTrim > 0 ? `about ${trim.suggestedTrim} shares` : "above the cap"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className={LABEL}>Invested</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
              {formatMoney(summary.invested)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className={LABEL}>Market value</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
              {formatMoney(summary.value)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className={LABEL}>Unrealised</p>
            <p className={`mt-1 font-mono text-sm font-bold tabular-nums ${toneFor(summary.pnl)}`}>
              {formatMoney(summary.pnl)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <p className={LABEL}>Return</p>
            <p className={`mt-1 font-mono text-sm font-bold tabular-nums ${toneFor(summary.pnlPercent)}`}>
              {formatPercent(summary.pnlPercent)}
            </p>
          </div>
        </div>

        <AiGate feature="portfolio" label="AI portfolio review">
          <AiBoardRead feature="portfolio" brief={brief} />
        </AiGate>
      </section>
    </div>
  );
}
