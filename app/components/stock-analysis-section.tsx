"use client";

import { useCallback, useEffect, useState } from "react";
import type { AlternativePick, BuyCall, ScoredStock, StockBuyReport } from "../lib/stock-buy-analysis";
import { CompanyLogo } from "./company-logo";
import { formatCrore, formatQuantity, formatRupee, formatSignedPercent, sectorTone, toneFor } from "./market-format";
import { MarketSection, Pager, SectionError, SectionFootnote, usePaged } from "./market-section";
import { StockCombobox, type Suggestion } from "./stock-combobox";

const ENDPOINT = "/api/ai/stock-analysis";

/** One row, the session's biggest move: enough to name the leader and nothing more. */
const LEADER_ENDPOINT = "/api/market/bse/movers?direction=gainers&period=1d&pageSize=1";

/**
 * What the box holds until the exchange says who is actually leading today.
 *
 * The box opens on the session's top performer - see `fetchLeader` - so this is only what stands in
 * for the moment before that answer arrives, and for a session the movers feed cannot report on.
 */
const DEFAULT_SYMBOL = "RELIANCE";

/** The session's biggest gainer, as the search box advertises it. */
type Leader = Suggestion;

/**
 * Today's top performer on the BSE, or null when the movers feed cannot say.
 *
 * One page of one row off the board the landing page already publishes, cached for a minute at the
 * edge - so pre-filling the box costs a request that most readers' browsers answer from cache and
 * no model call at all. Never throws: a box holding RELIANCE is a working box, and an outage in a
 * feed this section does not otherwise depend on should not be visible here.
 */
async function fetchLeader(): Promise<Leader | null> {
  try {
    const response = await fetch(LEADER_ENDPOINT);
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      rows?: {
        ticker?: string;
        name?: string;
        sector?: string | null;
        capTier?: string | null;
        code?: string | null;
        price?: number | null;
        changePercent?: number | null;
      }[];
    };
    const row = payload.rows?.[0];
    return row?.ticker
      ? {
          symbol: row.ticker,
          name: row.name ?? row.ticker,
          sector: row.sector ?? "Unclassified",
          capTier: row.capTier ?? "Unclassified",
          scripCode: row.code ?? "",
          price: row.price ?? null,
          changePercent: row.changePercent ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * The verdict palette.
 *
 * These are status colours, not series colours: they say what state the stock is in, so they are
 * reserved for that and never reused to tell two things apart. Every one of them ships beside the
 * word it means — "Buy", "Hold", "Avoid" — because a reader who cannot separate green from red
 * must still be able to read the call.
 *
 * `track` is a lighter step of the same ramp as `fill`, so the score meter reads as one bar in one
 * state rather than as a coloured piece sitting on unrelated grey.
 */
const CALL_STYLES: Record<BuyCall, { badge: string; fill: string; track: string; caption: string }> = {
  Buy: {
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    fill: "bg-emerald-500",
    track: "bg-emerald-100 dark:bg-emerald-500/15",
    caption: "Worth buying on the measured trend",
  },
  Hold: {
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
    fill: "bg-amber-500",
    track: "bg-amber-100 dark:bg-amber-500/15",
    caption: "Not a buy yet - wait for the trend to turn",
  },
  Avoid: {
    badge: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
    fill: "bg-rose-500",
    track: "bg-rose-100 dark:bg-rose-500/15",
    caption: "The measured trend argues against buying",
  },
};

/** What the section is doing right now. One value, so the panels cannot disagree about it. */
type Status =
  | { kind: "idle" }
  | { kind: "loading"; symbol: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: StockBuyReport };

function CallBadge({ call, size }: { call: BuyCall; size: "lg" | "sm" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wide ${CALL_STYLES[call].badge} ${
        size === "lg" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {/* A shape as well as a colour, so the three calls are distinguishable without hue. */}
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3" fill="currentColor">
        {call === "Buy" && <path d="M8 2.5 14 12H2L8 2.5Z" />}
        {call === "Hold" && <path d="M2 6h12v4H2V6Z" />}
        {call === "Avoid" && <path d="M8 13.5 2 4h12L8 13.5Z" />}
      </svg>
      {call}
    </span>
  );
}

/**
 * The momentum score, as a meter rather than as a chart.
 *
 * It is one ratio against a fixed limit, which is the case a meter exists for; a one-bar bar chart
 * with an axis would be more furniture for the same single number. The figure itself is the hero of
 * the left panel and carries proportional digits - `tabular-nums` widens every digit to the width
 * of a zero, which at this size leaves a two-digit number visibly loose.
 */
function ScoreMeter({ score, call }: { score: number; call: BuyCall }) {
  const width = Math.max(0, Math.min(100, score));

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Momentum score
          </p>
          <p className="mt-1 text-4xl font-semibold leading-none text-slate-900 dark:text-white">
            {score}
            <span className="ml-1 text-base font-medium text-slate-400 dark:text-slate-500">/100</span>
          </p>
        </div>
        <p className="max-w-[11rem] text-right text-xs leading-snug text-slate-500 dark:text-slate-400">
          {CALL_STYLES[call].caption}
        </p>
      </div>

      <div
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Momentum score out of 100"
        className={`mt-3 h-2 w-full overflow-hidden rounded-full ${CALL_STYLES[call].track}`}
      >
        <div className={`h-full rounded-full ${CALL_STYLES[call].fill}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
        50 is a stock that went nowhere, weighted from its one-week to one-year returns.
      </p>
    </div>
  );
}

/** One headline number. Label, value, and the tone the value earns - nothing else. */
function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[13px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/** The measured windows every panel shows, in the order they are weighted. */
function ReturnsRow({ stock }: { stock: ScoredStock }) {
  const windows: { label: string; value: number | null }[] = [
    { label: "1W", value: stock.oneWeek },
    { label: "1M", value: stock.oneMonth },
    { label: "6M", value: stock.sixMonth },
    { label: "1Y", value: stock.oneYear },
    { label: "3Y", value: stock.threeYear },
  ];

  return (
    <dl className="grid grid-cols-5 gap-1.5">
      {windows.map((window) => (
        <div key={window.label} className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-center dark:bg-slate-950/40">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {window.label}
          </dt>
          <dd className={`mt-0.5 text-[11px] font-bold tabular-nums ${toneFor(window.value)}`}>
            {formatSignedPercent(window.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PointList({ title, points, marker }: { title: string; points: string[]; marker: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <span aria-hidden="true" className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${marker}`} />
            <span className="text-justify">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The left half: everything about the company the reader actually asked about. */
function VerdictPanel({ report }: { report: StockBuyReport }) {
  const { stock } = report;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex items-start gap-2.5">
        <CompanyLogo symbol={stock.symbol} size={36} preferReal />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">{stock.symbol}</h4>
            <CallBadge call={stock.call} size="lg" />
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">{stock.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sectorTone(stock.sector)}`}>
              {stock.sector}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {stock.capTier ?? "Unclassified"} cap
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-justify text-sm font-semibold leading-snug text-slate-900 dark:text-white">{stock.headline}</p>

      <div className="mt-3">
        <ScoreMeter score={stock.score} call={stock.call} />
      </div>

      {/* The measurements, before the words about them. This is the panel a reader came for: what
          the stock is worth, what it did today, how big it is and how much of it changes hands. */}
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        <StatTile label="Market value" value={formatRupee(stock.price)} tone="text-slate-900 dark:text-white" />
        <StatTile label="Today" value={formatSignedPercent(stock.changePercent)} tone={toneFor(stock.changePercent)} />
        <StatTile label="Previous close" value={formatRupee(stock.previousClose)} tone="text-slate-900 dark:text-white" />
        <StatTile
          label="Day range"
          value={`${formatRupee(stock.dayLow, 0)} – ${formatRupee(stock.dayHigh, 0)}`}
          tone="text-slate-900 dark:text-white"
        />
        <StatTile
          label="Market cap"
          value={stock.marketCapCr === null ? "—" : formatCrore(stock.marketCapCr * 1e7)}
          tone="text-slate-900 dark:text-white"
        />
        <StatTile label="Volume" value={formatQuantity(stock.volume)} tone="text-slate-900 dark:text-white" />
      </div>

      <div className="mt-3">
        <ReturnsRow stock={stock} />
      </div>

      <p className="mt-4 text-justify text-xs leading-relaxed text-slate-600 dark:text-slate-300">{stock.summary}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PointList title="In its favour" points={stock.strengths} marker="bg-emerald-500" />
        <PointList title="Against it" points={stock.risks} marker="bg-rose-500" />
      </div>
    </div>
  );
}

/**
 * One of the right half's ten, at a glance.
 *
 * Deliberately one screenful of figures and a single line of prose. A reader on this side of the
 * section is scanning for a name worth opening, not reading five research notes — so the card
 * carries the rank, the call, the score, the price and the return windows that decided the ranking,
 * and exactly one sentence saying what this name does better than the one they typed.
 */
function AlternativeCard({ pick, searchedSymbol }: { pick: AlternativePick; searchedSymbol: string }) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3.5 transition hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-emerald-500/40">
      <div className="flex items-center gap-2.5">
        <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-slate-400 dark:text-slate-500">
          #{pick.rank}
        </span>
        <CompanyLogo symbol={pick.symbol} size={32} preferReal />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{pick.symbol}</p>
            <CallBadge call={pick.call} size="sm" />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Score {pick.score}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {pick.name} · {pick.capTier ?? "Unclassified"} cap
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatRupee(pick.price)}</p>
          <p className={`text-[11px] font-semibold tabular-nums ${toneFor(pick.changePercent)}`}>
            {formatSignedPercent(pick.changePercent)}
          </p>
        </div>
      </div>

      <div className="mt-2.5">
        <ReturnsRow stock={pick} />
      </div>

      <p className="mt-2 text-justify text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <span className="font-bold text-emerald-700 dark:text-emerald-400">Better than {searchedSymbol}: </span>
        {pick.edge}
      </p>
    </li>
  );
}

/** Three at a time: the whole ten down one column would run far past the verdict it answers. */
const ALTERNATIVES_PER_PAGE = 3;

/** The right half: the ten names that scored above the one that was searched for. */
function AlternativesPanel({ report }: { report: StockBuyReport }) {
  const symbol = report.stock.symbol;
  // Reset by symbol: a reader who analyses another company lands on page one of its alternatives
  // rather than on page three of the list they just left.
  const paged = usePaged(report.alternatives, ALTERNATIVES_PER_PAGE, symbol);

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
          {report.alternatives.length} to consider instead of {symbol}
        </h4>
        <p className="mt-0.5 text-justify text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          From {report.drawnFrom}, ranked by the same weighted returns {symbol} was scored on.
        </p>
      </div>

      <ul className="mt-3 space-y-3">
        {paged.slice.map((pick) => (
          <AlternativeCard key={pick.symbol} pick={pick} searchedSymbol={symbol} />
        ))}
      </ul>

      <Pager paged={paged} unit="stocks" />
    </div>
  );
}

/** The two panels' shape while the report is being written, so nothing on the page jumps. */
function AnalysisSkeleton() {
  return (
    <div className="mt-4 grid gap-3 xl:grid-cols-2">
      <div className="h-[26rem] animate-pulse rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40" />
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * "Should I buy this one, and what else should I be looking at?" - asked of any BSE-listed company.
 *
 * The section is two answers to one question. On the left, the company the reader searched for:
 * its market value, the Buy / Hold / Avoid call the measured returns produce, and the case for and
 * against it. On the right, the five names in the same sector that scored higher on those same
 * measurements, each with what it does better than the stock that was typed in.
 *
 * Nothing is fetched until somebody asks. This sits on the landing page, where most readers scroll
 * past it, and the report behind it costs fifteen quote lookups and a model call - so it opens as
 * a search box and stays inert until that box is used.
 */
export function StockAnalysisSection() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [leader, setLeader] = useState<Leader | null>(null);

  // Only the untouched placeholder is replaced. The answer usually lands in the same breath as the
  // first paint, but a reader who has already started typing owns the box from that moment on.
  useEffect(() => {
    void fetchLeader().then((today) => {
      if (!today) return;
      setLeader(today);
      setSymbol((current) => (current === DEFAULT_SYMBOL ? today.symbol : current));
    });
  }, []);

  const analyse = useCallback(async (wanted: string) => {
    const ticker = wanted.trim().toUpperCase();
    if (!ticker) {
      setStatus({ kind: "error", message: "Search for a BSE-listed stock to analyse." });
      return;
    }

    setStatus({ kind: "loading", symbol: ticker });

    try {
      const response = await fetch(`${ENDPOINT}?symbol=${encodeURIComponent(ticker)}`);
      const payload = (await response.json()) as StockBuyReport & { error?: string };

      // The route says what went wrong in its own words - an unlisted ticker reads very differently
      // from a feed that is down, and both are more useful than one generic line.
      if (!response.ok) {
        setStatus({ kind: "error", message: payload.error ?? "Couldn't analyse that stock right now." });
        return;
      }

      setStatus({ kind: "ready", report: payload });
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach the analysis service. Please try again shortly." });
    }
  }, []);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void analyse(symbol);
  };

  /**
   * Emptying the box empties the panels with it.
   *
   * A verdict and ten alternatives left standing under a cleared search field are an answer to a
   * question that is no longer on screen — and the moment the reader starts typing the next ticker,
   * they read as the answer to *that* one. Clearing puts the section back to how it opened.
   */
  const onQueryChange = (next: string) => {
    setSymbol(next);
    if (!next.trim()) setStatus({ kind: "idle" });
  };

  // Picking a company from the dropdown is already the whole request; making the reader then press
  // a button is a second decision about something they have finished deciding.
  const onSelect = (picked: string) => {
    setSymbol(picked);
    void analyse(picked);
  };

  /**
   * The company the box is about, for the mark drawn inside it.
   *
   * Nobody picks the ticker this section opens on - it is pre-filled with today's leader, or with
   * RELIANCE until the movers feed answers - so the combobox has no chosen row to take a logo from
   * and the field opened on a magnifying glass over a company we can name. Handing it the symbol
   * puts the real mark there from the first paint, and keeps it there through the analysis and the
   * report that follows. The combobox ignores it the moment the text stops naming that ticker.
   */
  const subject =
    status.kind === "ready"
      ? status.report.stock.symbol
      : status.kind === "loading"
        ? status.symbol
        : (leader?.symbol ?? DEFAULT_SYMBOL);

  return (
    <MarketSection
      id="stock-analysis"
      eyebrow="Stock Analysis"
      eyebrowClass="text-sky-600 dark:text-sky-400"
      title="Search any BSE stock and ask whether it is worth buying"
      blurb="Type a company or a ticker. The left panel is the verdict on it - its market value, its measured returns, and the case for and against buying it. The right panel is the ten stocks that scored better on those same measurements, so you can see what else the same money could buy."
      aside={
        <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300">
          {status.kind === "ready" ? `${comparedCount(status.report)} names compared` : "Every listed BSE company"}
        </div>
      }
    >
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-start">
        {/* browseAll: this box is the whole point of the section, so an empty one offers all ~4,950
            listed companies rather than the popular shortlist every other box on the site opens on. */}
        <StockCombobox
          value={symbol}
          onChange={onQueryChange}
          onSelect={onSelect}
          selectedSuggestion={
            status.kind === "ready"
              ? {
                  symbol: status.report.stock.symbol,
                  name: status.report.stock.name,
                  sector: status.report.stock.sector,
                  capTier: status.report.stock.capTier ?? "Unclassified",
                  scripCode: "",
                  price: status.report.stock.price,
                  changePercent: status.report.stock.changePercent,
                }
              : leader && leader.symbol === symbol
                ? leader
                : null
          }
          logoSymbol={subject}
          showSelectedNameInField
          browseAll
          className="flex-1"
          placeholder="Search any of the ~4,950 BSE listed stocks - try TCS, HDFC BANK or 500325"
        />
        <button
          type="submit"
          disabled={status.kind === "loading"}
          className="shrink-0 rounded-full bg-gradient-to-r from-sky-600 to-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(2,132,199,0.8)] transition hover:from-sky-500 hover:to-emerald-500 disabled:opacity-60"
        >
          {status.kind === "loading" ? "Analysing…" : "Analyse stock"}
        </button>
      </form>

      {leader && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Starting on <span className="font-semibold text-slate-900 dark:text-white">{leader.symbol}</span>, today&apos;s
          top performer on the BSE at{" "}
          <span className={`font-semibold tabular-nums ${toneFor(leader.changePercent)}`}>
            {formatSignedPercent(leader.changePercent)}
          </span>
          .
        </p>
      )}

      {status.kind === "idle" && (
        <p className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
          Search a company above to get its buy verdict and the ten alternatives ranked against it.
        </p>
      )}

      {status.kind === "loading" && (
        <>
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
            Reading {status.symbol}&apos;s market value and scoring its sector against it…
          </p>
          <AnalysisSkeleton />
        </>
      )}

      {status.kind === "error" && <SectionError message={status.message} />}

      {status.kind === "ready" && (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <VerdictPanel report={status.report} />
          <AlternativesPanel report={status.report} />
        </div>
      )}

      <SectionFootnote>
        Not financial advice. Every price, return and market capitalisation comes from the app&apos;s BSE and quote
        feeds, never from the AI; the Buy, Hold and Avoid calls are computed from those measured returns, and the AI
        only writes them up.
      </SectionFootnote>
    </MarketSection>
  );
}

/** The searched company plus the alternatives it was ranked against. */
function comparedCount(report: StockBuyReport): number {
  return report.alternatives.length + 1;
}
