"use client";

import { useEffect, useRef, useState } from "react";
import { OPENING_SYMBOL } from "../lib/ownership-defaults";
import { FALLBACK_QUICK_PICKS, type OwnershipQuickPick } from "../lib/suggestion-defaults";
import { CompanyLogo } from "./company-logo";
import { PromoterTrendChart } from "./promoter-trend-chart";
import { StockCombobox, type Suggestion } from "./stock-combobox";

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
 * What each class of shareholder actually is, in one line.
 *
 * The filing's own category names are the ones this board shows, and they have to be: they are what
 * the company wrote. But "Promoters & insiders" and "Domestic institutional investors" are terms of
 * art, and a reader who does not already know them learns nothing from a card that pairs one with a
 * percentage. These sit under the figure and say who is actually behind it - the founding family,
 * the mutual funds, the people. Nothing here is inferred; each line describes the class the filing
 * defines.
 */
const GROUP_MEANING: Record<OwnerGroup, string> = {
  promoters: "The founders, and the family or group that runs the company.",
  fii: "Funds and investors based outside India that have bought into it.",
  dii: "Indian mutual funds, insurers, banks and pension funds.",
  government: "Central and state government holdings outside the promoter group.",
  retail: "Ordinary individual investors, from a handful of shares upwards.",
  bodies: "Other companies, trusts and corporate bodies on the register.",
  others: "Shares the filing does not place in any of the classes above.",
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

function sectorGlyph(sector: string): React.ReactNode {
  const key = sector.toLowerCase();
  if (/bank|financial|nbfc|insurance/.test(key)) return <path d="M3.5 9.5 12 4l8.5 5.5M5 10v8m4-8v8m6-8v8m4-8v8M3.5 20.5h17" {...iconStroke} />;
  if (/technology|software|data/.test(key)) {
    return (
      <>
        <rect x="5" y="5" width="14" height="14" rx="2.5" {...iconStroke} />
        <path d="M9 9h6v6H9zM9 2.8v2.2M15 2.8v2.2M9 19v2.2M15 19v2.2M2.8 9H5M2.8 15H5M19 9h2.2M19 15h2.2" {...iconStroke} />
      </>
    );
  }
  if (/energy|petro|power|utilities/.test(key)) return <path d="M12.5 3.5 6 12h5l-1 8.5 7-10h-5l.5-7Z" {...iconStroke} />;
  if (/fmcg|consumer|retail|durables/.test(key)) {
    return (
      <>
        <path d="M6.5 8.5h11l-1.2 10h-8.6l-1.2-10Z" {...iconStroke} />
        <path d="M9 8.5a3 3 0 0 1 6 0" {...iconStroke} />
      </>
    );
  }
  if (/auto|aviation|ports|logistics/.test(key)) return <path d="M4 15.5h16M6 15.5l2-6h8l2 6M7 18.5h.01M17 18.5h.01M9 9.5V6h6v3.5" {...iconStroke} />;
  if (/pharma|healthcare/.test(key)) return <path d="M12 5v14M5 12h14M7.5 7.5l9 9M16.5 7.5l-9 9" {...iconStroke} />;
  if (/metal|mining|cement|construction|infra|capital/.test(key)) return <path d="M4 19h16M6 19V9l6-4 6 4v10M9 19v-6h6v6" {...iconStroke} />;
  return (
    <>
      <circle cx="12" cy="12" r="8.5" {...iconStroke} />
      <path d="M8 13.2 10.6 16 16 8" {...iconStroke} />
    </>
  );
}

function SectorIcon({ sector, className }: { sector: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {sectorGlyph(sector)}
    </svg>
  );
}

function pickSuggestion(pick: OwnershipQuickPick): Suggestion {
  return {
    symbol: pick.symbol,
    name: pick.name,
    sector: pick.sector,
    capTier: pick.capTier,
    scripCode: "",
    price: null,
    changePercent: null,
  };
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

/** A figure inside a sentence, weighted so the sentence can be skimmed for its numbers alone. */
function Figure({ children }: { children: React.ReactNode }) {
  return <strong className="font-bold text-slate-900 dark:text-white">{children}</strong>;
}

/** Percentage *points* moved, which is not the same thing as a percentage and is not written like one. */
export function formatPoints(value: number): string {
  return `${Math.abs(value).toFixed(2)} points`;
}

/** One sentence of the read, tied to the class it is about so it carries that class's colour. */
type ReadPoint = { key: OwnerGroup; title: string; body: React.ReactNode };

/**
 * The filing, read back in sentences.
 *
 * Everything else on this board is the filing's own numbers, laid out - which is the right default,
 * and the reason the footnote can say nothing here is inferred. But a table of percentages answers
 * "how much" and never answers "so what", and "so what" is the entire reason somebody opens a
 * shareholding pattern in the first place. A card reading PROMOTERS & INSIDERS 50.48% tells a
 * reader who does not already know the term precisely nothing.
 *
 * So these are structural readings: who can outvote whom, how much professional money is in, how
 * many people are on the register, and which way the promoter stake has moved across the quarters
 * that have been filed. Every one is arithmetic on figures already on this screen.
 *
 * What they deliberately are not is a view on the share price. This board has never had one - it
 * reads a filing, not a chart - and a sentence like "insiders buying is a sign of confidence" would
 * be exactly the kind of inference the source note at the bottom promises is absent. The stake
 * moved; by how much and in which direction is the whole of what is said about it.
 */
function filingRead(shown: Ownership): ReadPoint[] {
  const percentOf = (key: OwnerGroup) => shown.groups.find((group) => group.key === key)?.percent ?? 0;
  const holdersOf = (key: OwnerGroup) => shown.groups.find((group) => group.key === key)?.holders ?? null;

  const promoters = percentOf("promoters");
  const fii = percentOf("fii");
  const dii = percentOf("dii");
  const institutions = Math.round((fii + dii) * 100) / 100;
  const retail = percentOf("retail");
  const retailHolders = holdersOf("retail");

  const points: ReadPoint[] = [];

  // Half the register is the line that matters, because it is the line a vote is decided on.
  points.push({
    key: "promoters",
    title: "Who controls it",
    body:
      promoters >= 50 ? (
        <>
          Promoters hold <Figure>{formatPercent(promoters)}</Figure> — more than half the company. Control sits with the
          founding group, and the rest of the register cannot outvote them.
        </>
      ) : promoters > 0 ? (
        <>
          Promoters hold <Figure>{formatPercent(promoters)}</Figure>, short of the half that decides a vote. Everybody
          else on the register — institutions, individuals and other bodies — together holds more.
        </>
      ) : (
        <>
          No promoter stake is filed. Nobody is registered as this company&apos;s founding or controlling group, so it is
          owned outright by its public shareholders.
        </>
      ),
  });

  points.push({
    key: "dii",
    title: "Professional money",
    body:
      institutions > 0 ? (
        <>
          Funds and institutions hold <Figure>{formatPercent(institutions)}</Figure> between them —{" "}
          <Figure>{formatPercent(dii)}</Figure> Indian mutual funds, insurers and pension money, and{" "}
          <Figure>{formatPercent(fii)}</Figure> from institutions outside India.
        </>
      ) : (
        <>
          No fund or institution has filed a holding this quarter. Everything outside the promoter group is held by
          individuals and other bodies.
        </>
      ),
  });

  points.push({
    key: "retail",
    title: "The public",
    body:
      retailHolders === null ? (
        <>
          Individual investors hold <Figure>{formatPercent(retail)}</Figure> of the company. The filing does not break
          out how many of them there are.
        </>
      ) : (
        <>
          <Figure>{formatHolders(retailHolders)}</Figure> individual investors hold{" "}
          <Figure>{formatPercent(retail)}</Figure> between them.
        </>
      ),
  });

  // One quarter is a photograph rather than a direction, so this is only said when there are two.
  const first = shown.history[0];
  const last = shown.history[shown.history.length - 1];
  if (shown.history.length > 1 && first && last) {
    const move = Math.round((last.promoter - first.promoter) * 100) / 100;
    const quarters = <Figure>{shown.history.length}</Figure>;

    points.push({
      key: "promoters",
      title: "Which way it is moving",
      body:
        move === 0 ? (
          <>
            Across the {quarters} quarters filed here the promoter stake has not moved from{" "}
            <Figure>{formatPercent(last.promoter)}</Figure>.
          </>
        ) : move > 0 ? (
          <>
            Across the {quarters} quarters filed here promoters have added <Figure>{formatPoints(move)}</Figure>, from{" "}
            {formatPercent(first.promoter)} to {formatPercent(last.promoter)}.
          </>
        ) : (
          <>
            Across the {quarters} quarters filed here promoters have given up <Figure>{formatPoints(move)}</Figure>,
            from {formatPercent(first.promoter)} to {formatPercent(last.promoter)}.
          </>
        ),
    });
  }

  return points;
}

/** The read, above the figures it is drawn from. */
function FilingRead({ shown }: { shown: Ownership }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        What this filing tells you
      </p>
      <ul className="mt-3 grid gap-3.5 sm:grid-cols-2">
        {filingRead(shown).map((point) => (
          <li key={point.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${toneFor(point.key).card} ${
                toneFor(point.key).text
              }`}
            >
              <GroupIcon group={point.key} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {point.title}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-slate-600 dark:text-slate-300">{point.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
  quickPicks?: readonly OwnershipQuickPick[];
}) {
  const [symbol, setSymbol] = useState(OPENING_SYMBOL);
  const [query, setQuery] = useState(OPENING_SYMBOL);
  const [selectedPick, setSelectedPick] = useState<Suggestion | null>(
    pickSuggestion(quickPicks.find((pick) => pick.symbol === OPENING_SYMBOL) ?? FALLBACK_QUICK_PICKS[0]),
  );
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

  const choose = (next: string, pick?: OwnershipQuickPick) => {
    const wanted = next.trim().toUpperCase();
    setQuery(wanted);
    setSelectedPick(pick ? pickSuggestion(pick) : null);
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
          <StockCombobox
            value={query}
            onChange={(next) => {
              setQuery(next);
              setSelectedPick(null);
            }}
            onSelect={choose}
            selectedSuggestion={selectedPick}
            placeholder="Search any listed company"
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {quickPicks.map((pick) => (
            <button
              key={pick.symbol}
              type="button"
              onClick={() => choose(pick.symbol, pick)}
              aria-label={pick.symbol}
              aria-pressed={pick.symbol === symbol}
              className={`group flex min-h-[68px] items-center gap-3 rounded-2xl border p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                pick.symbol === symbol
                  ? "border-violet-300 bg-white text-violet-800 ring-2 ring-violet-500/15 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-100"
                  : "border-slate-200 bg-white/85 text-slate-700 hover:border-violet-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-300 dark:hover:border-violet-500/40"
              }`}
            >
              <CompanyLogo symbol={pick.symbol} size={38} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{pick.name}</span>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-400">{pick.symbol}</span>
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 transition group-hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    <SectorIcon sector={pick.sector} className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{pick.sector}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {pick.capTier}
                  </span>
                </span>
              </span>
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

            <FilingRead shown={shown} />

            {/* One bar for the whole register: the quickest read of who holds the company. */}
            <div
              role="img"
              aria-label={`The whole register: ${shown.groups
                .map((group) => `${group.label} ${formatPercent(group.percent)}`)
                .join(", ")}`}
              className="mt-5 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            >
              {shown.groups.map((group) => (
                <span
                  key={`${group.key ?? group.label}-bar`}
                  className={toneFor(group.key).bar}
                  style={{ width: `${group.percent}%` }}
                  title={`${group.label} — ${formatPercent(group.percent)}`}
                />
              ))}
            </div>

            {/* What the colours mean, on the page rather than in a tooltip.
                The bar was decodable only by hovering each band, which is a gesture a phone does not
                have - so on the device most of this page is read on, it was six colours and no key.
                The cards below carry the same colours and say far more, but they are a scroll away;
                this row is the one line that makes the bar above it readable where it stands. */}
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {shown.groups.map((group) => (
                <li key={`${group.key ?? group.label}-key`} className="flex items-center gap-1.5 text-[11px]">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${toneFor(group.key).dot}`} />
                  <span className="text-slate-600 dark:text-slate-300">{group.label}</span>
                  <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatPercent(group.percent)}
                  </span>
                </li>
              ))}
            </ul>

            {/* The reconciliation, beside the bar it reconciles rather than in a panel further down:
                it is the claim that the band above is the whole company and not a selection from it. */}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
                <path d="m5 10.5 3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Every class accounted for — {formatPercent(shown.groups.reduce((sum, group) => sum + group.percent, 0))} of
              shares
            </p>

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
                        {/* Wrapped rather than truncated: "Domestic institutional investors" is a
                            filing category, not a company name, and clipping it to "Domestic
                            institutional investo…" loses the only word that says whose money it is. */}
                        <span className="text-xs font-bold uppercase leading-snug tracking-wide text-slate-600 dark:text-slate-300">
                          {group.label}
                        </span>
                      </span>
                      <span className={`shrink-0 text-lg font-bold tabular-nums ${toneFor(group.key).text}`}>
                        {formatPercent(group.percent)}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {(group.key && GROUP_MEANING[group.key]) || GROUP_MEANING.others}
                    </p>

                    <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
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

            {/* The register, over time. It used to sit in the right half of a two-column row, with a
                "By investor type" panel beside it - the same split a fourth time, after the bar, the
                legend and the six cards, differing only in that it merged FII with DII and bodies
                with others. The one figure that made it worth keeping, institutions as a single
                number, is now a sentence in the read at the top of this board, which says it in
                words rather than making the reader add two bars together. Dropping it takes a
                repetition off a board whose whole difficulty was repetition, and gives the chart the
                width it was always drawn for - the panel it left behind was two-thirds empty space
                next to a chart this tall. */}
            <div className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Promoter stake, quarter by quarter
              </p>
              {/* A trend line on an axis fitted to the data — see ./promoter-trend-chart for why
                  the bars this replaced could not show a stake moving by tenths of a percent. */}
              <PromoterTrendChart history={shown.history} />
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
