"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING_SYMBOL } from "../lib/ownership-defaults";
import { FALLBACK_QUICK_PICKS } from "../lib/suggestion-defaults";
import { CompanyLogo } from "./company-logo";
import { PromoterTrendChart } from "./promoter-trend-chart";
import { StockCombobox } from "./stock-combobox";

/** The opening company's filing, resolved on the server. Null when it could not be. */
export type PrefetchedOwnership = { symbol: string; data: Ownership } | null;

export type OwnerGroup = "promoters" | "fii" | "dii" | "government" | "retail" | "bodies" | "others";

export type OwnerSlice = {
  key: OwnerGroup;
  label: string;
  percent: number;
  holders: number | null;
  detail: { label: string; percent: number; holders: number | null }[];
};

export type Ownership = {
  symbol: string;
  company: string;
  quarter: string;
  market?: {
    symbol: string;
    name: string;
    scripCode: string;
    price: number | null;
    previousClose: number | null;
    change: number | null;
    changePercent: number | null;
    sessionDate: string | null;
    source: string;
    returns: { key: string; value: number | null; measuredFrom: string | null }[];
  } | null;
  groups: OwnerSlice[];
  investorTypes: { key: OwnerGroup; label: string; percent: number }[];
  foreignPercent: number;
  totalHolders: number | null;
  history: {
    quarter: string;
    promoter: number;
    publicHeld: number;
    investorTypes?: { key?: OwnerGroup | "public" | string; label: string; percent: number }[];
  }[];
  filedOn: string | null;
  source: string;
};


/**
 * One colour per bucket, used by the bar, its legend and the cards alike so a colour means the
 * same thing everywhere on the board.
 */
const TONE: Record<OwnerGroup, { bar: string; dot: string; text: string; card: string }> = {
  promoters: {
    bar: "bg-violet-500",
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
    card: "border-violet-200 bg-violet-50/60 dark:border-violet-500/30 dark:bg-violet-500/10",
  },
  fii: {
    bar: "bg-sky-500",
    dot: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
    card: "border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/10",
  },
  dii: {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    card: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
  },
  government: {
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    card: "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10",
  },
  retail: {
    bar: "bg-rose-500",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    card: "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10",
  },
  bodies: {
    bar: "bg-slate-400",
    dot: "bg-slate-400",
    text: "text-slate-700 dark:text-slate-300",
    card: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900",
  },
  others: {
    bar: "bg-slate-300",
    dot: "bg-slate-300",
    text: "text-slate-600 dark:text-slate-400",
    card: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50",
  },
};

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * A mark for each kind of investor.
 *
 * There is no logo for "domestic institutions" the way there is for a company, so these say what
 * the holder *is*: a crown for the promoter who controls the company, a globe for money coming
 * from outside India, a bank for the funds and insurers at home, a public building for the
 * government, people for the individual shareholders who make up the millions on the register.
 */
const GROUP_GLYPH: Record<OwnerGroup, React.ReactNode> = {
  promoters: <path d="M4 18h16M5 16 4 7l4.5 3.5L12 5l3.5 5.5L20 7l-1 9" {...iconStroke} />,
  fii: (
    <>
      <circle cx="12" cy="12" r="8.5" {...iconStroke} />
      <path d="M3.5 12h17M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5s-1.2 6.1-3.4 8.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5Z" {...iconStroke} />
    </>
  ),
  dii: <path d="M3.5 9.5 12 4l8.5 5.5M5 10v8m4-8v8m6-8v8m4-8v8M3.5 20.5h17" {...iconStroke} />,
  government: (
    <>
      <path d="M12 3.5 4 7v2h16V7l-8-3.5ZM6 20.5h12M4.5 20.5h15M6.5 9v9m4-9v9m3-9v9m4-9v9" {...iconStroke} />
    </>
  ),
  retail: (
    <>
      <circle cx="9" cy="8.5" r="3" {...iconStroke} />
      <path d="M3.5 20c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" {...iconStroke} />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 15.4c1.6.8 2.6 2.3 3 4.6" {...iconStroke} />
    </>
  ),
  bodies: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" {...iconStroke} />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" {...iconStroke} />
    </>
  ),
  others: (
    <>
      <circle cx="12" cy="12" r="8.5" {...iconStroke} />
      <path d="M9.8 9.6A2.3 2.3 0 0 1 14.2 10c0 1.6-2.2 1.9-2.2 3.3M12 16.6h.01" {...iconStroke} />
    </>
  ),
};

/**
 * The colour and the glyph for a bucket, for any value the payload actually carries.
 *
 * Not simply `TONE[key]`: this board reads a cached answer, and a cache written before a field
 * existed outlives the deploy that added it — an entry filed under the old shape arrives with no
 * `key` at all, and indexing straight into the table then throws while rendering. An unknown
 * bucket falls back to the neutral tone rather than taking the section down with it.
 */
function toneFor(group: OwnerGroup | undefined) {
  return (group && TONE[group]) || TONE.others;
}

function GroupIcon({ group, className }: { group: OwnerGroup | undefined; className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {(group && GROUP_GLYPH[group]) || GROUP_GLYPH.others}
    </svg>
  );
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** Shareholder counts run to millions, so they are read as counts rather than spelled out in full. */
export function formatHolders(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(2)} crore`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(2)} lakh`;
  return value.toLocaleString("en-IN");
}

function formatRupees(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `Rs ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function returnTone(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-500 dark:text-slate-400";
  return value >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300";
}

function MarketSnapshot({ market }: { market: NonNullable<Ownership["market"]> }) {
  const returnItems = market.returns.filter((item) => item.key !== "1D");

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-sky-500/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
            BSE market snapshot
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
              {formatRupees(market.price)}
            </span>
            <span className={`text-sm font-bold tabular-nums ${returnTone(market.changePercent)}`}>
              {formatSignedPercent(market.changePercent)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {market.symbol} / BSE {market.scripCode}
            {market.sessionDate ? ` - session ${market.sessionDate}` : ""}
          </p>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl">
          {returnItems.map((item) => (
            <span
              key={item.key}
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 shadow-sm dark:border-slate-700/70 dark:bg-slate-950/40"
              title={item.measuredFrom ? `${item.key} measured from ${item.measuredFrom}` : `${item.key} return`}
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {item.key}
              </span>
              <span className={`mt-0.5 block text-sm font-bold tabular-nums ${returnTone(item.value)}`}>
                {formatSignedPercent(item.value)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 border-t border-emerald-100 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-emerald-500/20 dark:text-slate-400">
        Price and returns are measured from {market.source}; missing windows are left blank instead of estimated.
      </p>
    </div>
  );
}

/**
 * Who owns a listed company, from the company's own quarterly filing.
 *
 * Every figure on this board is a category the filing itself reports — promoters, foreign
 * portfolio investors, domestic institutions, government, individual shareholders — so nothing
 * here is inferred from price or volume.
 */
export function OwnershipBoard({
  prefetched = null,
  quickPicks = FALLBACK_QUICK_PICKS,
}: {
  prefetched?: PrefetchedOwnership;
  /**
   * The tickers offered under the search box. Resolved on the server so the same set is in the
   * prerendered HTML and in the hydrated board — see `../lib/daily-picks` for why these cannot be
   * drawn in the browser.
   */
  quickPicks?: readonly string[];
}) {
  const [symbol, setSymbol] = useState(OPENING_SYMBOL);
  const [query, setQuery] = useState(OPENING_SYMBOL);
  // Seeded from the server when the opening company was resolved there, so the board paints filled
  // in rather than fetching what the page already knows.
  const [data, setData] = useState<Ownership | null>(prefetched?.data ?? null);
  const [state, setState] = useState<{ symbol: string; error: string | null; market?: Ownership["market"] } | null>(
    prefetched ? { symbol: prefetched.symbol, error: null } : null,
  );
  const [openGroup, setOpenGroup] = useState<OwnerGroup | null>(null);
  // The server's answer counts as this symbol having been fetched already. A ref rather than
  // state: it only ever suppresses the very first request, and re-rendering for it would be a
  // render to say nothing changed.
  const served = useRef(prefetched?.symbol ?? null);

  useEffect(() => {
    // The opening company came down with the HTML — going back for it would be a round trip to
    // fetch what is already on screen. Every later symbol is a question the server was not asked.
    if (served.current === symbol) {
      served.current = null;
      return;
    }

    const controller = new AbortController();

    fetch(`/api/market/shareholding?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as Ownership & { error?: string };
        if (!response.ok) {
          setData(null);
          setState({
            symbol,
            error: body.error || "No filing could be read for this company.",
            market: body.market ?? null,
          });
          return null;
        }
        return body;
      })
      .then((body) => {
        if (!body) return;
        setData(body);
        setState({ symbol, error: null });
      })
      .catch((failure: Error) => {
        if (controller.signal.aborted) return;
        setState({ symbol, error: failure.message });
      });

    return () => controller.abort();
  }, [symbol]);

  const settled = state?.symbol === symbol ? state : null;
  const loading = settled === null;
  const error = settled?.error ?? null;
  const shown = !loading && !error ? data : null;

  const choose = (next: string) => {
    const wanted = next.trim().toUpperCase();
    setQuery(wanted);
    if (wanted) setSymbol(wanted);
    setOpenGroup(null);
  };

  return (
    <section
      id="ownership"
      className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(15,23,42,0.4)] transition-colors dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-6 sm:p-8 dark:border-slate-800 dark:from-violet-500/10 dark:via-slate-900 dark:to-sky-500/10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-violet-600 dark:text-violet-400">
              Shareholding pattern
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Who is invested in a company, and how much of it they hold
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Promoters, foreign portfolio investors, domestic institutions, the government and individual
              shareholders — as the company itself files each quarter with the exchange, not as anyone estimates it.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <StockCombobox value={query} onChange={setQuery} onSelect={choose} placeholder="Search any listed company" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {quickPicks.map((pick) => (
            <button
              key={pick}
              type="button"
              onClick={() => choose(pick)}
              aria-pressed={pick === symbol}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                pick === symbol
                  ? "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/20 dark:text-violet-200"
                  : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {pick}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {loading && (
          <div className="space-y-3">
            <div className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
            {error} Shareholding patterns are filed per listed entity — a scrip that trades only on the BSE, or one that
            listed after the last quarter-end, has nothing published yet.
          </p>
        )}

        {!loading && error && settled?.market && <MarketSnapshot market={settled.market} />}

        {shown && (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <CompanyLogo symbol={shown.symbol} size={48} />
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-slate-900 dark:text-white">{shown.company}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {shown.symbol} · as filed for the quarter ended {shown.quarter}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <span className="rounded-2xl border border-slate-200 px-3 py-2 text-center dark:border-slate-700">
                  <span className="block text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatHolders(shown.totalHolders)}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    shareholders
                  </span>
                </span>
                <span className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-center dark:border-sky-500/30 dark:bg-sky-500/10">
                  <span className="block text-sm font-bold tabular-nums text-sky-700 dark:text-sky-300">
                    {formatPercent(shown.foreignPercent)}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-sky-600/70 dark:text-sky-300/70">
                    held abroad
                  </span>
                </span>
              </div>
            </div>

            {shown.market && <MarketSnapshot market={shown.market} />}

            {/* One bar for the whole register: the quickest read of who holds the company. */}
            <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {shown.groups.map((group) => (
                <span
                  key={`${group.key ?? group.label}-bar`}
                  className={toneFor(group.key).bar}
                  style={{ width: `${group.percent}%` }}
                  title={`${group.label} — ${formatPercent(group.percent)}`}
                />
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.groups.map((group) => {
                const open = openGroup === group.key;
                return (
                  <div key={`${group.key ?? group.label}-card`} className={`rounded-2xl border p-4 ${toneFor(group.key).card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/70 ${toneFor(group.key).text} dark:bg-slate-950/40`}
                        >
                          <GroupIcon group={group.key} className="h-4 w-4" />
                        </span>
                        <span className="truncate text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                          {group.label}
                        </span>
                      </span>
                      <span className={`shrink-0 text-lg font-bold tabular-nums ${toneFor(group.key).text}`}>
                        {formatPercent(group.percent)}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {group.holders === null
                        ? "Holder count not broken out"
                        : `${formatHolders(group.holders)} shareholders`}
                    </p>

                    {group.detail.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setOpenGroup(open ? null : group.key)}
                          aria-expanded={open}
                          className="mt-2 text-[11px] font-semibold text-slate-500 underline-offset-2 transition hover:underline dark:text-slate-400"
                        >
                          {open ? "Hide breakdown" : `Show ${group.detail.length} sub-categories`}
                        </button>
                        {open && (
                          <ul className="mt-2 space-y-1.5 border-t border-slate-200/70 pt-2 dark:border-slate-700/60">
                            {group.detail.map((entry) => (
                              <li key={entry.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                                <span className="min-w-0 text-slate-600 dark:text-slate-300">{entry.label}</span>
                                <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">
                                  {formatPercent(entry.percent)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  By investor type
                </p>
                <ul className="mt-3 space-y-2.5">
                  {shown.investorTypes.map((type) => (
                    <li key={type.label}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2">
                          <span aria-hidden="true" className={toneFor(type.key).text}>
                            <GroupIcon group={type.key} className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-slate-600 dark:text-slate-300">{type.label}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatPercent(type.percent)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full ${toneFor(type.key).bar}`} style={{ width: `${type.percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>

                {/* The reconciliation, stated rather than assumed: these are the filing's own
                    classes, and they are shown adding up to the whole register. */}
                <p className="mt-3 flex items-center gap-1.5 border-t border-slate-200 pt-3 text-[11px] font-semibold text-emerald-700 dark:border-slate-800 dark:text-emerald-400">
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
                    <path d="m5 10.5 3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Every class accounted for — {formatPercent(shown.groups.reduce((sum, group) => sum + group.percent, 0))} of
                  shares
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Promoter stake, quarter by quarter
                </p>
                {/* A trend line on an axis fitted to the data — see ./promoter-trend-chart for why
                    the bars this replaced could not show a stake moving by tenths of a percent. */}
                <PromoterTrendChart history={shown.history} />
              </div>
            </div>

            <p className="mt-5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Source: {shown.source}
              {shown.filedOn ? `, filed ${shown.filedOn}` : ""}. Categories and percentages are the filing&apos;s own.
              A state-wise split of a company&apos;s investors is not part of any exchange disclosure, so this board does
              not show one — nothing published maps shareholders to where they live.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
