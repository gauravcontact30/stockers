"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareBrief,
  compareHoldings,
  defaultComparison,
  MAX_COMPARE,
  MIN_COMPARE,
} from "../lib/portfolio-compare";
import { formatMoney, formatPercent, toneFor, type HoldingMetrics } from "../lib/portfolio-metrics";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CompanyLogo } from "./company-logo";
import { CARD, EmptyPanel, LABEL, PanelHeading } from "./portfolio-chrome";
import { StockDetailTrigger } from "./stock-detail-provider";

/**
 * The reader's own positions, head to head.
 *
 * The dashboard already compares any two listed companies on their fundamentals. This compares the
 * ones in the book on the figures only the book has: return against what was actually paid, share
 * of the portfolio, and distance to the target the reader set themselves. That is the comparison
 * that answers "which of these is earning its place", which is not a question a general stock
 * comparison can be asked.
 *
 * It opens on the best and worst performer rather than on an empty picker. That pair is the
 * comparison most readers came for, and a page that makes you choose before it shows you anything
 * is a page most people close.
 */

const CHIP_ON =
  "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-400";
const CHIP_OFF =
  "border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40";

export function PortfolioComparison({ holdings }: { holdings: HoldingMetrics[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  // The opening pair is derived rather than stored, so it follows the book: a reader who adds a
  // new worst performer sees that one when they next open the tab, not whichever stock happened
  // to be losing when the component first mounted.
  const opening = useMemo(() => defaultComparison(holdings), [holdings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the picker once the book is priced; guarded so a reader's own choice is never overwritten.
    setSelected((current) => (current.length === 0 ? opening : current));
  }, [opening]);

  const table = useMemo(() => compareHoldings(holdings, selected), [holdings, selected]);
  const brief = useMemo(() => compareBrief(table), [table]);

  const toggle = (symbol: string) => {
    setSelected((current) => {
      if (current.includes(symbol)) {
        // Never below two: one column is not a comparison, and silently emptying the table would
        // make the tab look broken rather than under-specified.
        return current.length <= MIN_COMPARE ? current : current.filter((entry) => entry !== symbol);
      }
      // At the cap, the oldest choice drops out. The alternative is a disabled chip that does
      // nothing when clicked, which reads as a bug.
      return current.length >= MAX_COMPARE ? [...current.slice(1), symbol] : [...current, symbol];
    });
  };

  if (holdings.length < MIN_COMPARE) {
    return (
      <EmptyPanel>
        Add at least two stocks and this puts them side by side on return, momentum, weight and how far each has to run to
        your target.
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="Compare your holdings"
          blurb={`Pick up to ${MAX_COMPARE}. Every figure is measured — a blank cell means the feed had nothing, not a zero.`}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {holdings.map((holding) => (
            <button
              key={holding.symbol}
              type="button"
              onClick={() => toggle(holding.symbol)}
              aria-pressed={selected.includes(holding.symbol)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selected.includes(holding.symbol) ? CHIP_ON : CHIP_OFF
              }`}
            >
              <CompanyLogo symbol={holding.symbol} size={16} />
              {holding.symbol}
            </button>
          ))}
        </div>

        {table.holdings.length < MIN_COMPARE ? (
          <div className="mt-4">
            <EmptyPanel>Pick two of your holdings above to compare them.</EmptyPanel>
          </div>
        ) : (
          <>
            {/* Horizontal scroll on the table alone, not the page: four columns of numbers will not
                fit a phone, and a body that scrolls sideways loses the tab bar with it. */}
            <div className="mt-5 -mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={`pb-3 text-left ${LABEL}`}>Metric</th>
                    {table.holdings.map((holding) => (
                      <th key={holding.symbol} className="pb-3 text-right">
                        <StockDetailTrigger symbol={holding.symbol}>
                          <span className="text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
                            {holding.symbol}
                          </span>
                        </StockDetailTrigger>
                        <p className="font-mono text-[11px] font-normal tabular-nums text-slate-400 dark:text-slate-500">
                          {formatMoney(holding.price)}
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.metric.key} className="border-t border-slate-100 dark:border-slate-800">
                      <th scope="row" className="py-2.5 pr-3 text-left align-top">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{row.metric.label}</span>
                        <p className="mt-0.5 max-w-[16rem] text-[10px] font-normal leading-snug text-slate-400 dark:text-slate-500">
                          {row.metric.hint}
                        </p>
                      </th>
                      {row.values.map((entry) => (
                        <td key={entry.symbol} className="py-2.5 text-right align-top">
                          <span
                            className={`font-mono text-sm font-bold tabular-nums ${
                              row.metric.higherIsBetter === null ? "text-slate-900 dark:text-white" : toneFor(entry.value)
                            }`}
                          >
                            {row.metric.format(entry.value)}
                          </span>
                          {/* Only a directional metric can be won. Weight deliberately never marks
                              a winner: a bigger position is larger, not better. */}
                          {row.winner === entry.symbol && (
                            <span
                              title="Leads this metric"
                              className="ml-1.5 inline-block rounded-full bg-emerald-100 px-1.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            >
                              ▲
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}

                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <th scope="row" className={`py-3 text-left ${LABEL}`}>
                      Metrics led
                    </th>
                    {table.holdings.map((holding) => {
                      const entry = table.leaderboard.find((row) => row.symbol === holding.symbol);
                      return (
                        <td key={holding.symbol} className="py-3 text-right">
                          <span className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">
                            {entry?.wins ?? 0}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>

            {table.strongest && (
              <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-white">{table.strongest}</span> leads the most
                measured metrics here; <span className="font-semibold text-slate-900 dark:text-white">{table.weakest}</span>{" "}
                the fewest. That is a count of columns, not a verdict on either company — a stock can lead on momentum and
                still be the one you were right to trim.
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {table.holdings.map((holding) => (
                <div
                  key={holding.symbol}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{holding.symbol}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {holding.tracked
                      ? "Tracked, not owned — no cost basis to measure a return against."
                      : `${formatMoney(holding.value)} held against ${formatMoney(holding.invested)} invested (${formatPercent(holding.pnlPercent)}).`}
                  </p>
                  {holding.note && (
                    <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-500 dark:text-slate-400">
                      &ldquo;{holding.note}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>

            <AiGate feature="portfolio" label="AI portfolio review">
              <AiBoardRead feature="portfolio" brief={brief} />
            </AiGate>
          </>
        )}
      </section>
    </div>
  );
}
