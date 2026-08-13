"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import type { Holding } from "../lib/portfolio";
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  portfolioBrief,
  splitByPerformance,
  summarisePortfolio,
  toneFor,
  type HoldingMetrics,
  type PortfolioSummary,
  type PriceSnapshot,
} from "../lib/portfolio-metrics";
import { track } from "../lib/track";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CompanyLogo } from "./company-logo";
// The tokens the whole section is drawn from, shared with every tab so they cannot drift apart.
import { CARD, FIELD, LABEL } from "./portfolio-chrome";
import { PortfolioComparison } from "./portfolio-comparison";
import { PortfolioCorporateActions } from "./portfolio-corporate-actions";
import { PortfolioLive } from "./portfolio-live";
import { PortfolioMoversBoard } from "./portfolio-movers-board";
import { PortfolioReview } from "./portfolio-review";
import { PortfolioScreener } from "./portfolio-screener";
import { StockDetailTrigger } from "./stock-detail-provider";
import { StockExplorer } from "./stock-explorer";
import { authHeaders } from "./subscription-provider";

/**
 * The reader's own portfolio: what they hold, what it is worth, and what the AI desk makes of it.
 *
 * Three things separate this from the watchlist card in the sidebar. It belongs to the account
 * rather than to the browser, so it survives a new phone. It carries cost — quantity and average
 * price — so it can answer "am I up?", which a list of tickers cannot. And it is customisable in
 * the way a portfolio actually needs: a position, a target, and a line of the reader's own
 * reasoning, kept next to the numbers that will later prove them right or wrong.
 *
 * The holdings themselves are never paywalled. They are the reader's own record and locking them
 * behind a plan would hold their data hostage. What a plan buys is the AI layer over them, and
 * that is gated where it belongs — on the panels inside each tab, and again on the server.
 *
 * ---------------------------------------------------------------------------
 * Seven tabs, one book
 * ---------------------------------------------------------------------------
 *
 * Everything under this section is about the same set of positions, asked a different question:
 * what do I hold, what is moving, what is it worth right now, what should I buy next, what are
 * these companies about to do, which of these is pulling its weight, and is the book built well.
 * Stacking all seven down one page would be a scroll nobody finishes, so they are tabs — and only
 * the open one is mounted, because each fetches its own feed and mounting all seven would fire
 * every market endpoint the moment the section opens.
 *
 * The holdings and their prices are fetched once here and handed down. The tabs that need the book
 * measured get the same `summary` the cards above are drawn from, which is what guarantees the AI
 * read in one tab can never disagree with the figures in another.
 */

type FormValues = { symbol: string; quantity: string; avgPrice: string; targetPrice: string; note: string };

const EMPTY_FORM: FormValues = { symbol: "", quantity: "", avgPrice: "", targetPrice: "", note: "" };


/** A number the reader typed, or "" — kept as text so a half-typed "1." does not jump to 1. */
function valueOf(value: number | null): string {
  return value === null || value === 0 ? "" : String(value);
}

/**
 * The stored position, as fields.
 *
 * Typed on the shape rather than on `Holding` so a card can hand back the row it is already
 * rendering — the alternative is looking the symbol up in the list again, which needs a
 * "what if it isn't there" branch for a row that could only have come from that list.
 */
export function formFor(holding: Pick<Holding, "symbol" | "quantity" | "avgPrice" | "targetPrice" | "note">): FormValues {
  return {
    symbol: holding.symbol,
    quantity: valueOf(holding.quantity),
    avgPrice: valueOf(holding.avgPrice),
    targetPrice: valueOf(holding.targetPrice),
    note: holding.note ?? "",
  };
}

function Tile({ label, value, hint, tone = "" }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <p className={`text-xl font-bold tabular-nums ${tone || "text-slate-900 dark:text-white"}`}>{value}</p>
      <p className={`mt-1 ${LABEL}`}>{label}</p>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>
    </div>
  );
}

/** The headline figures: cost, worth, the gap between them, and today's move on the whole book. */
export function PortfolioTotals({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Market value" value={formatMoney(summary.value)} hint={`${summary.owned} owned positions`} />
      <Tile label="Invested" value={formatMoney(summary.invested)} hint="What the positions cost" />
      <Tile
        label="Unrealised P&L"
        value={formatSignedMoney(summary.pnl)}
        hint={formatPercent(summary.pnlPercent)}
        tone={toneFor(summary.pnl)}
      />
      <Tile
        label="Today"
        value={formatSignedMoney(summary.dayChange)}
        hint={formatPercent(summary.dayChangePercent)}
        tone={toneFor(summary.dayChange)}
      />
    </div>
  );
}

/**
 * How the money is spread.
 *
 * One bar per market-cap tier, one hue, anchored at zero — this encodes magnitude, not identity,
 * so the tier's name sits on the row rather than in a legend nobody reads. The concentration line
 * underneath is the number that actually matters: a book can look diversified across three tiers
 * and still be one stock.
 */
export function AllocationBars({ summary }: { summary: PortfolioSummary }) {
  if (summary.mix.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Add a position with a quantity to see how the money is spread.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {summary.mix.map((slice) => (
        <div key={slice.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-900 dark:text-white">{slice.label} cap</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {formatMoney(slice.value)} · {Math.round(slice.weight * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-r-[4px] bg-emerald-500 dark:bg-emerald-400" style={{ width: `${slice.weight * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Largest single position is <span className="font-semibold text-slate-900 dark:text-white">{Math.round(summary.concentration * 100)}%</span> of
        market value. Above about a third, the book moves with one company rather than with the market.
      </p>
    </div>
  );
}

/** One holding, as a card: what it is, what it cost, what it is worth, and how far it has to run. */
export function HoldingCard({
  holding,
  busy,
  onEdit,
  onRemove,
}: {
  holding: HoldingMetrics;
  busy: boolean;
  onEdit: (holding: HoldingMetrics) => void;
  onRemove: (symbol: string) => void;
}) {
  const returns = [
    ["1M", holding.oneMonth],
    ["6M", holding.sixMonth],
    ["1Y", holding.oneYear],
  ] as const;

  return (
    <li className={`${CARD} overflow-hidden`}>
      {/* A hairline in the direction of the position, so a glance down the grid reads before any
          of the numbers do. Slate while the price is still unknown — not green. */}
      <div
        aria-hidden="true"
        className={`h-1 w-full ${
          holding.pnl === null
            ? "bg-slate-200 dark:bg-slate-700"
            : holding.pnl >= 0
              ? "bg-gradient-to-r from-emerald-500 to-teal-400"
              : "bg-gradient-to-r from-rose-500 to-orange-400"
        }`}
      />

      <div className="p-5">
        <div className="flex items-start gap-3">
          <CompanyLogo symbol={holding.symbol} size={38} />
          <div className="min-w-0 flex-1">
            <StockDetailTrigger symbol={holding.symbol}>
              <span className="text-base font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">{holding.symbol}</span>
            </StockDetailTrigger>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{holding.name ?? "Live price unavailable"}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(holding.price)}</p>
            <p className={`font-mono text-xs font-bold tabular-nums ${toneFor(holding.oneDay)}`}>{formatPercent(holding.oneDay)}</p>
          </div>
        </div>

        {holding.tracked ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-3 text-center text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Tracked, not owned — add a quantity to count it in your totals.
          </p>
        ) : (
          <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50">
            <div className="flex items-baseline justify-between gap-2">
              <span className={LABEL}>Unrealised</span>
              <span className={`font-mono text-lg font-bold tabular-nums ${toneFor(holding.pnl)}`}>{formatSignedMoney(holding.pnl)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{formatMoney(holding.invested)} invested</span>
              <span className={`font-mono text-xs font-bold tabular-nums ${toneFor(holding.pnlPercent)}`}>{formatPercent(holding.pnlPercent)}</span>
            </div>
          </div>
        )}

        <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-slate-200 pt-3 text-center dark:border-slate-800">
          <div>
            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Qty</dt>
            <dd className="font-mono text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">{holding.quantity}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Avg</dt>
            <dd className="font-mono text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(holding.avgPrice)}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Value</dt>
            <dd className="font-mono text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(holding.value)}</dd>
          </div>
          <div>
            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Weight</dt>
            <dd className="font-mono text-[11px] font-bold tabular-nums text-slate-900 dark:text-white">{Math.round(holding.weight * 100)}%</dd>
          </div>
        </dl>

        <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-center dark:border-slate-800">
          {returns.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
              <dd className={`font-mono text-[11px] font-bold tabular-nums ${toneFor(value)}`}>{formatPercent(value)}</dd>
            </div>
          ))}
        </dl>

        {holding.targetPrice !== null && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className={LABEL}>Target {formatMoney(holding.targetPrice)}</span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                {holding.targetProgress === null ? "—" : `${Math.round(holding.targetProgress * 100)}% there`}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-r-[4px] bg-violet-500 dark:bg-violet-400"
                style={{ width: `${(holding.targetProgress ?? 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {holding.note && (
          <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
            {holding.note}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onEdit(holding)}
            className="h-9 flex-1 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(holding.symbol)}
            aria-label={`Remove ${holding.symbol} from portfolio`}
            className="h-9 flex-1 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * One band of the portfolio — performing, not performing, or merely tracked.
 *
 * A heading, a running total for the band, and its cards. Splitting the grid this way is the whole
 * point of the section: a reader scanning twenty cards for the red ones is doing work the page
 * should have done for them.
 */
export function HoldingGroup({
  title,
  blurb,
  accent,
  total,
  holdings,
  empty,
  busy,
  onEdit,
  onRemove,
}: {
  title: string;
  blurb: string;
  accent: string;
  total: string;
  holdings: HoldingMetrics[];
  empty: string;
  busy: boolean;
  onEdit: (holding: HoldingMetrics) => void;
  onRemove: (symbol: string) => void;
}) {
  return (
    <section>
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 ${accent}`}>
        <div>
          <h3 className="text-base font-semibold">
            {title} <span className="tabular-nums opacity-70">({holdings.length})</span>
          </h3>
          <p className="text-xs opacity-80">{blurb}</p>
        </div>
        <p className="font-mono text-sm font-bold tabular-nums">{total}</p>
      </div>

      {holdings.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {empty}
        </p>
      ) : (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {holdings.map((holding) => (
            <HoldingCard key={holding.symbol} holding={holding} busy={busy} onEdit={onEdit} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Adding a position, or editing one.
 *
 * The symbol is picked from the explorer when adding and fixed when editing: changing which stock
 * a row is about is not an edit, it is a different holding, and doing it by retyping the ticker
 * would silently strand the cost basis on the wrong company.
 */
export function HoldingForm({
  values,
  editing,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  values: FormValues;
  editing: boolean;
  busy: boolean;
  onChange: (values: FormValues) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = (field: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [field]: event.target.value });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={`${CARD} p-5`}
    >
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
        {editing ? `Edit ${values.symbol}` : "Add a stock to your portfolio"}
      </h3>

      {editing ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Update the position, your target, or the note you left yourself.
        </p>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            Search any BSE-listed company by name, ticker, scrip code or ISIN.
          </p>
          <StockExplorer selected={values.symbol} onSelect={(symbol) => onChange({ ...values, symbol })} />
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className={LABEL}>
          Quantity
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={values.quantity}
            onChange={set("quantity")}
            placeholder="0 to track only"
            className={`mt-1 ${FIELD} normal-case tracking-normal`}
          />
        </label>
        <label className={LABEL}>
          Average buy price
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={values.avgPrice}
            onChange={set("avgPrice")}
            placeholder="₹ per share"
            className={`mt-1 ${FIELD} normal-case tracking-normal`}
          />
        </label>
        <label className={LABEL}>
          Target price
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={values.targetPrice}
            onChange={set("targetPrice")}
            placeholder="Optional"
            className={`mt-1 ${FIELD} normal-case tracking-normal`}
          />
        </label>
      </div>

      <label className={`mt-3 block ${LABEL}`}>
        Why you hold it
        <textarea
          value={values.note}
          onChange={set("note")}
          rows={2}
          maxLength={280}
          placeholder="Optional — the reasoning you will want to reread in six months."
          className={`mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm normal-case tracking-normal text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white`}
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !values.symbol}
          className="h-11 rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Saving..." : editing ? "Save changes" : "Add to portfolio"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-full border border-slate-200 px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The seven questions this section answers, in the order a reader tends to ask them. */
export const PORTFOLIO_TABS = [
  { id: "holdings", label: "Holdings", blurb: "What you own and what it is worth" },
  { id: "movers", label: "Top movers", blurb: "Gainers and losers across your holdings and watchlist" },
  { id: "live", label: "Live feed", blurb: "Prices as the exchange prints them" },
  { id: "screener", label: "Screener", blurb: "Find the next one, ranked against this book" },
  { id: "actions", label: "Corporate actions", blurb: "Dividends, bonuses and splits ahead" },
  { id: "compare", label: "Compare", blurb: "Your positions head to head" },
  { id: "review", label: "Review", blurb: "How well the book is built" },
] as const;

export type PortfolioTabId = (typeof PORTFOLIO_TABS)[number]["id"];

export function PortfolioWorkspace() {
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [prices, setPrices] = useState<Map<string, PriceSnapshot>>(() => new Map());
  const [form, setForm] = useState<FormValues | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when the failure is a store that has not been created yet — a different message entirely. */
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PortfolioTabId>("holdings");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/portfolio", { headers: authHeaders() });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Couldn't load your portfolio.");
        setSetupNeeded(data?.setup === true);
        return;
      }
      setHoldings(data.holdings ?? []);
      setError(null);
      setSetupNeeded(false);
    } catch {
      setError("Couldn't reach your portfolio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; every setState runs after the await, not synchronously in this callback.
    load();
  }, [load]);

  // Joined by symbol rather than held on the holding, so a price that arrives late updates the
  // card without the portfolio itself having to be refetched.
  const symbols = (holdings ?? []).map((holding) => holding.symbol).join(",");

  useEffect(() => {
    if (!symbols) return;

    // Abandoned on unmount by aborting the request itself rather than by setting a flag the
    // handler has to remember to check: an aborted fetch rejects, and the same `catch` that
    // already covers a feed that will not answer covers a reader who has moved on.
    const controller = new AbortController();

    fetch(`/api/market/performance?symbols=${encodeURIComponent(symbols)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("prices"))))
      .then((data: { results?: PriceSnapshot[] }) => {
        setPrices(new Map((data.results ?? []).map((result) => [result.symbol, result])));
      })
      // A price feed that will not answer leaves the cards showing dashes, which is the honest
      // outcome — the holdings themselves are still theirs to manage.
      .catch(() => undefined);

    return () => controller.abort();
  }, [symbols]);

  const summary = useMemo(() => summarisePortfolio(holdings ?? [], prices), [holdings, prices]);
  const split = useMemo(() => splitByPerformance(summary.holdings), [summary]);
  const brief = useMemo(() => portfolioBrief(summary), [summary]);

  const submit = async (values: FormValues) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          symbol: values.symbol,
          // Sent as empty-string-for-absent rather than 0: the store treats "not supplied" as
          // "leave it alone", which is what lets an edit change only the note.
          quantity: values.quantity,
          avgPrice: values.avgPrice,
          targetPrice: values.targetPrice,
          note: values.note,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "That holding was refused.");
        return;
      }
      setHoldings(data.holdings ?? []);
      track("portfolio.add", values.symbol);
      setNotice(`${values.symbol} saved.`);
      setForm(null);
    } catch {
      setError("Couldn't save that holding.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (symbol: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/portfolio?symbol=${encodeURIComponent(symbol)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "That stock could not be removed.");
        return;
      }
      setHoldings(data.holdings ?? []);
      track("portfolio.remove", symbol);
      setNotice(`${symbol} removed.`);
    } catch {
      setError("Couldn't reach your portfolio.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (holding: HoldingMetrics) => {
    setEditing(true);
    // Editing a position is done on the Holdings tab, so a click from anywhere else brings the
    // reader to the form rather than opening one they cannot see.
    setTab("holdings");
    setForm(formFor(holding));
  };

  /** Adds a stock with no position — how the screener files a name the reader wants to follow. */
  const track_ = async (symbol: string) => {
    await submit({ ...EMPTY_FORM, symbol });
  };

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading your portfolio...</p>;

  const holdingsTab = (
    <div className="flex flex-col gap-6">
      <PortfolioTotals summary={summary} />

      {summary.unpriced > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {summary.unpriced} owned position(s) could not be priced just now and are left out of the totals above.
        </p>
      )}

      {form ? (
        <HoldingForm
          values={form}
          editing={editing}
          busy={busy}
          onChange={setForm}
          // `form` is narrowed to a value by the branch this sits in, so the handler needs no
          // "what if there is no form" case of its own.
          onSubmit={() => submit(form)}
          onCancel={() => setForm(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setForm(EMPTY_FORM);
          }}
          className="w-full rounded-full border border-dashed border-emerald-300 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
        >
          + Add a stock to your portfolio
        </button>
      )}

      {(holdings ?? []).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Nothing here yet. Add any BSE-listed stock with the quantity and price you paid — or with no quantity at
          all, just to track it — and this page follows it against the live market every time you open it.
        </p>
      ) : (
        <>
          <HoldingGroup
            title="Performing"
            blurb="Worth at least what you paid. Best first."
            accent="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            total={formatSignedMoney(split.performingPnl)}
            holdings={split.performing}
            empty="Nothing in the book is ahead of its cost right now."
            busy={busy}
            onEdit={edit}
            onRemove={remove}
          />
          <HoldingGroup
            title="Not performing"
            blurb="Below what you paid. Worst first — these are the ones to look at."
            accent="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            total={formatSignedMoney(split.laggingPnl)}
            holdings={split.lagging}
            empty="Nothing is behind its cost. Every owned position is at or above what you paid."
            busy={busy}
            onEdit={edit}
            onRemove={remove}
          />
          <HoldingGroup
            title="Tracked only"
            blurb="Watched rather than owned, or waiting on a price — no verdict either way."
            accent="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300"
            total={`${split.watching.length} stock${split.watching.length === 1 ? "" : "s"}`}
            holdings={split.watching}
            empty="Nothing is being tracked without a position."
            busy={busy}
            onEdit={edit}
            onRemove={remove}
          />
        </>
      )}

      <section className={`${CARD} p-5`}>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">How the money is spread</h3>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Market value by company size, measured from the positions you own.
        </p>
        <AllocationBars summary={summary} />
      </section>

      {brief && (
        <section className={`${CARD} p-5`}>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">AI portfolio review</h3>
          <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
            Written over your own figures — the desk is handed the numbers on this page and nothing else.
          </p>
          <AiGate feature="portfolio" label="AI portfolio review">
            <AiBoardRead feature="portfolio" brief={brief} />
          </AiGate>
        </section>
      )}
    </div>
  );

  // Only the open tab is built: each of the others fetches its own feed on mount, and rendering
  // all seven would fire every market endpoint the moment the section opens.
  const panels: Record<PortfolioTabId, () => ReactElement> = {
    holdings: () => holdingsTab,
    movers: () => <PortfolioMoversBoard />,
    live: () => <PortfolioLive hasHoldings={(holdings ?? []).length > 0} />,
    screener: () => <PortfolioScreener onAdd={track_} busy={busy} />,
    actions: () => <PortfolioCorporateActions marketValue={summary.value} hasHoldings={(holdings ?? []).length > 0} />,
    compare: () => <PortfolioComparison holdings={summary.holdings} />,
    review: () => <PortfolioReview summary={summary} />,
  };

  const active = PORTFOLIO_TABS.find((entry) => entry.id === tab) ?? PORTFOLIO_TABS[0];

  return (
    <div className="flex flex-col gap-6">
      {/* A store that has not been created yet is not an error the reader can retry their way out
          of, so it gets an instruction rather than a red box. */}
      {setupNeeded ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">Your portfolio store is not set up yet.</p>
          <p className="mt-1 leading-relaxed">{error}</p>
        </div>
      ) : (
        error && (
          <p className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )
      )}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}

      {holdings !== null && (
        <>
          {/* Scrolls rather than wraps: seven tabs wrapping to a second line on a phone pushes the
              content below the fold before the reader has chosen anything. */}
          <div
            role="tablist"
            aria-label="Portfolio views"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          >
            {PORTFOLIO_TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                title={entry.blurb}
                onClick={() => {
                  // Which of these people actually open is the argument for what the section
                  // should look like next, and a tab change is not a page view.
                  track("portfolio.tab", entry.id);
                  setTab(entry.id);
                }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  tab === entry.id
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <p className="-mt-3 text-xs text-slate-400 dark:text-slate-500">{active.blurb}</p>

          {panels[tab]()}
        </>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Saved to your account, not this browser · prices are measured from exchange closes · AI insights, not investment advice.
      </p>
    </div>
  );
}
