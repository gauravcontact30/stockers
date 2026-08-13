"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionKind } from "../lib/corporate-actions";
import { actionsBrief, whenLabel, type ActionsView, type HeldAction } from "../lib/portfolio-actions";
import { formatMoney } from "../lib/portfolio-metrics";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CompanyLogo } from "./company-logo";
import { CARD, EmptyPanel, ErrorNote, LABEL, PanelHeading, Tile } from "./portfolio-chrome";
import { StockDetailTrigger } from "./stock-detail-provider";
import { authHeaders } from "./subscription-provider";

/**
 * What the companies in this book are about to do to their own shares.
 *
 * The dividend board elsewhere in the dashboard is a market-wide calendar; this is the same
 * exchange feed narrowed to the reader's holdings and priced against their position, which turns
 * "Interim Dividend - Rs 8 Per Share" into "₹2,000, ex-date Tuesday".
 *
 * Two kinds of row, never mixed. A dividend pays cash and leaves the position alone. A bonus or a
 * split leaves the value alone and changes the share count — which means the average price stored
 * against that holding is about to be wrong, and nothing else in the app would have said so.
 */

const KIND_STYLE: Record<ActionKind, string> = {
  Dividend: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Bonus: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  Split: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  Rights: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Buyback: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  Meeting: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

type ActionsPayload = { view: ActionsView; live: boolean; today?: string; fetchedAt?: string };

function ActionRow({ action, past = false }: { action: HeldAction; past?: boolean }) {
  return (
    <li className={`flex flex-wrap items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800 ${past ? "opacity-75" : ""}`}>
      <CompanyLogo symbol={action.symbol} size={30} />

      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-2">
          <StockDetailTrigger symbol={action.symbol}>
            <span className="text-sm font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
              {action.symbol}
            </span>
          </StockDetailTrigger>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[action.kind]}`}>{action.kind}</span>
          {action.ratio && (
            <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">{action.ratio}</span>
          )}
        </div>
        {/* The exchange's own wording, kept verbatim. It is the primary record, and a paraphrase
            of a corporate action is how a reader ends up acting on the wrong one. */}
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{action.subject}</p>

        {action.adjusted && (
          <p className="mt-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
            Your {action.quantity} shares become <span className="font-bold">{action.adjusted.quantity}</span> at{" "}
            <span className="font-bold">{formatMoney(action.adjusted.avgPrice)}</span> average. Update the holding after the
            ex-date so your cost basis stays right.
          </p>
        )}
      </div>

      <div className="w-32 shrink-0 text-right">
        <p className="text-[11px] font-bold text-slate-900 dark:text-white">{whenLabel(action)}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {action.exDate ? `Ex ${action.exDate}` : "No ex-date"}
        </p>
        {action.recordDate && <p className="text-[10px] text-slate-400 dark:text-slate-500">Rec {action.recordDate}</p>}
      </div>

      <div className="w-24 shrink-0 text-right">
        {action.kind === "Dividend" ? (
          <>
            <p className="font-mono text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {action.payout === null ? "—" : formatMoney(action.payout)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {action.amount === null ? "amount unclear" : `${formatMoney(action.amount)}/share`}
            </p>
          </>
        ) : (
          <p className="text-[10px] text-slate-400 dark:text-slate-500">No cash</p>
        )}
      </div>
    </li>
  );
}

export function PortfolioCorporateActions({ marketValue, hasHoldings }: { marketValue: number; hasHoldings: boolean }) {
  const [payload, setPayload] = useState<ActionsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Seeded from whether there is anything to fetch, so the "no holdings" case never has to switch
  // it off from inside an effect.
  const [loading, setLoading] = useState(hasHoldings);

  // Rounded before it becomes a dependency: the market value re-derives on every price tick, and
  // an unrounded float would refetch the calendar for a change of a few paise.
  const denominator = Math.round(marketValue);

  const load = useCallback(async (value: number, signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/portfolio/actions?marketValue=${value}`, { headers: authHeaders(), signal });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't load your corporate actions.");
        return;
      }
      setPayload(data);
      setError(null);
    } catch {
      if (!signal?.aborted) setError("Couldn't reach the exchange calendar.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasHoldings) return;

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every setState runs after the await, not synchronously in this callback.
    load(denominator, controller.signal);
    return () => controller.abort();
  }, [denominator, hasHoldings, load]);

  const view = payload?.view ?? null;
  const brief = useMemo(() => (view ? actionsBrief(view) : null), [view]);

  if (!hasHoldings) {
    return <EmptyPanel>Add a holding and every dividend, bonus and split declared against it shows up here.</EmptyPanel>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="Corporate actions on what you hold"
          blurb="Declared dividends, bonuses, splits and rights from the exchange's own calendar, priced against your positions."
        />

        {loading ? (
          <p className={`mt-4 ${LABEL}`}>Reading the exchange calendar…</p>
        ) : view === null ? null : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile
                label="Expected income"
                value={formatMoney(view.expectedIncome)}
                hint="From declared dividends ahead"
                tone="text-emerald-600 dark:text-emerald-400"
              />
              <Tile
                label="Forward yield"
                value={view.expectedYieldPercent === null ? "—" : `${view.expectedYieldPercent.toFixed(2)}%`}
                hint="Of current market value"
              />
              <Tile label="Deadlines ahead" value={String(view.upcoming.length)} hint="Ex-dates still to come" />
              <Tile
                label="Share-count changes"
                value={String(view.structural.length)}
                hint="Bonuses, splits and rights"
                tone={view.structural.length > 0 ? "text-violet-600 dark:text-violet-400" : ""}
              />
            </div>

            {view.unpricedDividends > 0 && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {view.unpricedDividends} declared dividend(s) were worded without a per-share figure the parser could read,
                so the income above understates what is actually coming.
              </p>
            )}

            {view.upcoming.length === 0 ? (
              <div className="mt-4">
                <EmptyPanel>
                  Nothing is declared against your holdings in the next six months. The exchange publishes these as
                  companies announce them, so this fills in over a quarter rather than all at once.
                </EmptyPanel>
              </div>
            ) : (
              <div className="mt-5">
                <p className={LABEL}>Coming up — soonest first</p>
                <ul className="mt-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                  {view.upcoming.map((action) => (
                    <ActionRow key={`${action.symbol}-${action.subject}-${action.exDate}`} action={action} />
                  ))}
                </ul>
              </div>
            )}

            {view.recent.length > 0 && (
              <div className="mt-5">
                <p className={LABEL}>Recently passed — you should already have received these</p>
                <ul className="mt-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                  {view.recent.map((action) => (
                    <ActionRow key={`${action.symbol}-${action.subject}-${action.exDate}`} action={action} past />
                  ))}
                </ul>
              </div>
            )}

            {view.quiet.length > 0 && (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Nothing declared for {view.quiet.join(", ")}. The exchange calendar covers companies listed on NSE under the
                same ticker; a BSE-only scrip will not appear here even when it has declared something.
              </p>
            )}

            <AiGate feature="portfolio" label="AI portfolio review">
              <AiBoardRead feature="portfolio" brief={brief} />
            </AiGate>
          </>
        )}
      </section>
    </div>
  );
}
