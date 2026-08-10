"use client";

/**
 * The four full-width scenes behind the landing hero.
 *
 * They are drawn in CSS and DOM rather than shipped as exported images: the hero is full-bleed, so
 * a raster export is either enormous or visibly soft on a wide display, and at 4:3 crops it reflows
 * badly. Drawn scenes stay sharp at any width and cost nothing to download.
 *
 * Three of the four carry **live figures**, and each says so on its own footnote:
 *
 *   * The two sector trios — banking, and the data-centre build-out — name three companies each and
 *     ask the same performance endpoint the watchlist and the dashboard boards use.
 *   * The last scene is a live screen: the year's strongest performers that are trading below their
 *     own recent range today, with their headlines counted beside them.
 *
 * Only the first scene is a *depiction* — a themed gainers board whose company names and BSE scrip
 * codes are real but whose prices are illustrative. Its footnote says as much.
 *
 * Every scene is laid out inside one padded card (`SceneCard`) in normal flow — nothing is
 * absolutely positioned against the frame edge, so no content can ever sit flush against it or
 * overlap a neighbour at an unplanned width.
 */

import { useEffect, useState } from "react";
import { CompanyLogo } from "./company-logo";
import { useStockPerformance, type StockPerformance } from "./use-stock-performance";

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/**
 * Each slide wears its own light palette, so the carousel reads as four distinct frames rather
 * than one background that keeps redrawing itself. The chrome below is shared and takes the
 * palette as a parameter, which is what keeps four different-looking scenes consistent in
 * spacing, type scale and structure.
 */
export type ScenePalette = {
  key: string;
  /** Full-bleed background behind the card. */
  bg: string;
  /** Grid rule colour, as an rgba string. */
  grid: string;
  /** The scene card itself. */
  shell: string;
  /** An inner card surface and its border. */
  panel: string;
  /** A divider. */
  rule: string;
  /** Small-caps kicker. */
  eyebrow: string;
  /** Headings. */
  title: string;
  /** Captions, scrip codes, footnotes. */
  muted: string;
  /** Soft accent fill for badges. */
  chip: string;
  /** The index rail across the top of the card. */
  rail: string;
  /** The ticker tape along the foot of the card. */
  tape: string;
};

export const MINT: ScenePalette = {
  key: "mint",
  bg: "bg-gradient-to-br from-emerald-100 via-emerald-50 to-teal-100",
  grid: "rgba(16,185,129,0.6)",
  shell: "border-emerald-200 bg-white/70",
  panel: "border-emerald-200/80 bg-white",
  rule: "border-emerald-100",
  eyebrow: "text-emerald-700",
  title: "text-slate-900",
  muted: "text-slate-500",
  chip: "bg-emerald-100 text-emerald-800",
  rail: "border-emerald-200 bg-emerald-50/80",
  tape: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export const SKY: ScenePalette = {
  key: "sky",
  bg: "bg-gradient-to-br from-sky-100 via-sky-50 to-indigo-100",
  grid: "rgba(59,130,246,0.6)",
  shell: "border-sky-200 bg-white/70",
  panel: "border-sky-200/80 bg-white",
  rule: "border-sky-100",
  eyebrow: "text-sky-700",
  title: "text-slate-900",
  muted: "text-slate-500",
  chip: "bg-sky-100 text-sky-800",
  rail: "border-sky-200 bg-sky-50/80",
  tape: "border-sky-200 bg-sky-50 text-sky-800",
};

export const LILAC: ScenePalette = {
  key: "lilac",
  bg: "bg-gradient-to-br from-violet-100 via-violet-50 to-fuchsia-100",
  grid: "rgba(139,92,246,0.6)",
  shell: "border-violet-200 bg-white/70",
  panel: "border-violet-200/80 bg-white",
  rule: "border-violet-100",
  eyebrow: "text-violet-700",
  title: "text-slate-900",
  muted: "text-slate-500",
  chip: "bg-violet-100 text-violet-800",
  rail: "border-violet-200 bg-violet-50/80",
  tape: "border-violet-200 bg-violet-50 text-violet-800",
};

export const SAND: ScenePalette = {
  key: "sand",
  bg: "bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100",
  grid: "rgba(245,158,11,0.6)",
  shell: "border-amber-200 bg-white/70",
  panel: "border-amber-200/80 bg-white",
  rule: "border-amber-100",
  eyebrow: "text-amber-700",
  title: "text-slate-900",
  muted: "text-slate-500",
  chip: "bg-amber-100 text-amber-800",
  rail: "border-amber-200 bg-amber-50/80",
  tape: "border-amber-200 bg-amber-50 text-amber-800",
};

/** Gains and losses keep one colour across all four palettes: green up, red down, always. */
const UP_TEXT = "text-emerald-600";
const DOWN_TEXT = "text-rose-600";

function tone(value: number): string {
  return value >= 0 ? UP_TEXT : DOWN_TEXT;
}

/** A signed percentage, always carrying its sign so a gain never reads as a bare number. */
export function signed(value: number, places = 2): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(places)}%`;
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

function GridOverlay({ palette }: { palette: ScenePalette }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        backgroundImage: `linear-gradient(to right, ${palette.grid} 1px, transparent 1px), linear-gradient(to bottom, ${palette.grid} 1px, transparent 1px)`,
        backgroundSize: "56px 56px",
        opacity: 0.08,
      }}
    />
  );
}

const TICKERS = [
  "S&P BSE SENSEX  ▲ 0.98%",
  "BSE BANKEX  ▲ 1.14%",
  "RELIANCE 500325  ▲ 2.1%",
  "TCS 532540  ▼ 0.6%",
  "HDFCBANK 500180  ▲ 1.4%",
  "INFY 500209  ▲ 0.9%",
  "BSE MIDCAP  ▲ 1.1%",
  "ITC 500875  ▼ 0.3%",
];

/** The scrolling tape along the foot of the card. */
export function TickerTape({ palette }: { palette: ScenePalette }) {
  const tickerRow = [...TICKERS, ...TICKERS];
  return (
    <div className={`overflow-hidden rounded-xl border px-3 py-1.5 ${palette.tape}`}>
      <div className="flex w-max animate-marquee gap-10 text-[12px] font-semibold whitespace-nowrap">
        {tickerRow.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
    </div>
  );
}

// BSE's own index family rather than NSE's — every scene in the carousel is a BSE surface.
const INDEX_STRIP: { label: string; value: string; up: boolean }[] = [
  { label: "S&P BSE SENSEX", value: "81,204 ▲0.6%", up: true },
  { label: "BSE BANKEX", value: "62,340 ▲1.1%", up: true },
  { label: "BSE MIDCAP", value: "46,918 ▲0.9%", up: true },
  { label: "BSE SMALLCAP", value: "54,072 ▼0.2%", up: false },
  { label: "BSE 500", value: "36,415 ▲0.5%", up: true },
];

/**
 * The index rail across the top of every card — one consistent thread from slide to slide, so
 * four differently-coloured frames still read as one product.
 */
function TopStatStrip({ palette }: { palette: ScenePalette }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 ${palette.rail}`}>
      {INDEX_STRIP.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap shadow-sm"
        >
          <span className="text-slate-500">{item.label}</span>
          <span className={item.up ? UP_TEXT : DOWN_TEXT}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

/** A small lamp — the one animated element a working board actually has. */
function LiveBadge({ palette, label }: { palette: ScenePalette; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${palette.chip}`}>
      <span className="animate-live-blink h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {label}
    </span>
  );
}

/** The shared inner-card chrome. Same structure on every slide, recoloured by palette. */
function Panel({ palette, className, children }: { palette: ScenePalette; className: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.4)] ${palette.panel} ${className}`}>{children}</div>
  );
}

/**
 * The one card every scene lives inside.
 *
 * The frame gets padding, the card gets padding, and the scene's own content is a flex column
 * within it — so nothing ever touches the edge of the slide and every slide is inset by the same
 * amount whatever its layout.
 */
function SceneCard({
  palette,
  eyebrow,
  title,
  badge,
  footnote,
  /**
   * The gap between the card and the edge of the slide. Every slide shares one frame height, so
   * this is how an airier scene gets a shorter card and a denser one gets a taller card.
   *
   * Required rather than defaulted: every scene has an opinion about its own density, and a
   * default only ever meant one of them had not been given the thought.
   */
  inset,
  children,
}: {
  palette: ScenePalette;
  eyebrow: string;
  title: string;
  badge: string;
  footnote: string;
  inset: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${inset} ${palette.bg}`}>
      <GridOverlay palette={palette} />

      <div
        className={`relative flex h-full flex-col gap-2.5 overflow-hidden rounded-3xl border p-3 shadow-[0_30px_70px_-35px_rgba(15,23,42,0.5)] backdrop-blur-sm sm:gap-3 sm:p-4 ${palette.shell}`}
      >
        <TopStatStrip palette={palette} />

        <div className={`flex flex-wrap items-end justify-between gap-3 border-b pb-2 ${palette.rule}`}>
          <div className="min-w-0">
            <p className={`text-[11px] font-bold tracking-[0.3em] uppercase ${palette.eyebrow}`}>{eyebrow}</p>
            <p className={`mt-0.5 text-base font-black sm:text-xl ${palette.title}`}>{title}</p>
          </div>
          <LiveBadge palette={palette} label={badge} />
        </div>

        {/* `min-h-0` lets this shrink inside the flex column, and `overflow-hidden` guarantees a
            tall layout clips at the card's own rounded edge rather than spilling past it. */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

        <p className={`text-[10px] ${palette.muted}`}>{footnote}</p>

        <TickerTape palette={palette} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scene 1 — today's top performers, by theme
// ---------------------------------------------------------------------------

export type ThemeStock = {
  code: string;
  symbol: string;
  company: string;
  price: string;
  pct: number;
};

export type MarketTheme = {
  name: string;
  blurb: string;
  /** Accent for this theme's panel, so three columns don't read as one long list. */
  accent: string;
  chip: string;
  bar: string;
  stocks: ThemeStock[];
};

/**
 * Three themes the board is bidding up, with the three strongest scrips in each.
 *
 * The companies and their BSE scrip codes are real; the prices and percentages are an
 * illustration of the layout, and the scene says so on its own footnote. The live version of
 * exactly this ranking is the gainers pager on the BSE board further down the page.
 */
export const MARKET_THEMES: MarketTheme[] = [
  {
    name: "Data centres",
    blurb: "Capacity build-out and the network behind it",
    accent: "border-cyan-300",
    chip: "bg-cyan-100 text-cyan-800",
    bar: "bg-cyan-500",
    stocks: [
      { code: "515055", symbol: "ANANTRAJ", company: "Anant Raj", price: "612.40", pct: 6.82 },
      { code: "543960", symbol: "NETWEB", company: "Netweb Technologies", price: "2,184.60", pct: 5.14 },
      { code: "500483", symbol: "TATACOMM", company: "Tata Communications", price: "1,742.90", pct: 3.48 },
    ],
  },
  {
    name: "Banking",
    blurb: "Private and public lenders on the Bankex",
    accent: "border-emerald-300",
    chip: "bg-emerald-100 text-emerald-800",
    bar: "bg-emerald-500",
    stocks: [
      { code: "500112", symbol: "SBIN", company: "State Bank of India", price: "812.40", pct: 4.26 },
      { code: "532174", symbol: "ICICIBANK", company: "ICICI Bank", price: "1,284.60", pct: 2.91 },
      { code: "500180", symbol: "HDFCBANK", company: "HDFC Bank", price: "1,678.90", pct: 2.14 },
    ],
  },
  {
    name: "Development & infra",
    blurb: "Order books from roads, rail and construction",
    accent: "border-amber-300",
    chip: "bg-amber-100 text-amber-800",
    bar: "bg-amber-500",
    stocks: [
      { code: "542649", symbol: "RVNL", company: "Rail Vikas Nigam", price: "428.75", pct: 7.35 },
      { code: "534309", symbol: "NBCC", company: "NBCC (India)", price: "142.30", pct: 4.68 },
      { code: "500510", symbol: "LT", company: "Larsen & Toubro", price: "3,624.40", pct: 2.57 },
    ],
  },
];

/** The strongest single move across all three themes — every bar is drawn against it. */
export function strongestMove(themes: MarketTheme[]): number {
  return themes.reduce((max, theme) => theme.stocks.reduce((inner, stock) => Math.max(inner, stock.pct), max), 0);
}

/** A theme's average gain, so the panel header says how broad the move was, not just how big. */
export function themeAverage(theme: MarketTheme): number {
  return theme.stocks.reduce((sum, stock) => sum + stock.pct, 0) / theme.stocks.length;
}

function ThemeRow({ stock, rank, theme, largest }: { stock: ThemeStock; rank: number; theme: MarketTheme; largest: number }) {
  return (
    <li className="border-b border-slate-100 px-4 py-2.5 last:border-0">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-black ${theme.chip}`}>
          {rank}
        </span>
        {/* The company's own mark, at the size the trio slides use, so the three themed panels
            read as nine companies rather than nine codes. */}
        <CompanyLogo symbol={stock.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-mono text-[12px] font-bold text-slate-800">{stock.symbol}</span>
            <span className={`font-mono text-[12px] font-black ${UP_TEXT}`}>{signed(stock.pct)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[10px] text-slate-500">
              {stock.company} · {stock.code}
            </span>
            <span className="font-mono text-[10px] text-slate-500">₹{stock.price}</span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-slate-200">
            <div className={`h-1 rounded-full ${theme.bar}`} style={{ width: `${(stock.pct / largest) * 100}%` }} />
          </div>
        </div>
      </div>
    </li>
  );
}

export function TopGainersScene() {
  const largest = strongestMove(MARKET_THEMES);

  return (
    <SceneCard
      palette={MINT}
      eyebrow="Today's top performers"
      title="Three themes the BSE board is bidding up"
      badge="RANKED TODAY"
      inset="p-3 sm:p-10 lg:p-14"
      footnote="Companies and BSE scrip codes are real; the figures illustrate the layout. The live ranking is on the BSE board."
    >
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MARKET_THEMES.map((theme) => (
          <Panel key={theme.name} palette={MINT} className={`overflow-hidden ${theme.accent}`}>
            <div className={`border-b px-4 py-2.5 ${MINT.rule}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold tracking-wide text-slate-700 uppercase">{theme.name}</p>
                <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${theme.chip}`}>
                  avg {signed(themeAverage(theme))}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">{theme.blurb}</p>
            </div>
            <ul>
              {theme.stocks.map((stock, index) => (
                <ThemeRow key={stock.code} stock={stock} rank={index + 1} theme={theme} largest={largest} />
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </SceneCard>
  );
}

// ---------------------------------------------------------------------------
// Scenes 2 and 3 — a sector's leaders, one card each, on live figures
// ---------------------------------------------------------------------------
//
// These two differ from the scenes either side of them in one important way: the numbers are real.
// The others depict the product with illustrative figures and say so on their footnotes, which is
// honest but means the hero opens on nothing a reader can act on. These two ask the same
// performance endpoint the watchlist and the dashboard boards use, so what a visitor sees in the
// carousel is the same session's exchange data they would find by scrolling down.
//
// That costs one request between them. The hook batches every symbol raised in the same tick into
// a single call and memoises the answer for the session, so all six names resolve together and
// cycling back to a slide re-fetches nothing.

/** One company on a trio slide, with the accent its card wears. */
export type TrioStock = {
  symbol: string;
  company: string;
  /** What this company does, in a few words. A reader may not know the smaller names. */
  blurb: string;
  /** Card border tint, so three cards in a row read as three companies rather than one block. */
  accent: string;
  /**
   * The card's pale wash.
   *
   * Light rather than saturated on purpose: these cards carry a dozen figures each, and a strong
   * fill behind small tabular numbers costs more legibility than the separation it buys.
   */
  wash: string;
  /**
   * Cap tier, carried here rather than read from the quote feed.
   *
   * The feed only knows the tier for companies in the curated catalogue, and one of these — Paras
   * Defence — is outside it, so relying on the feed would print a blank against a real company.
   * Taken from BSE's own classification.
   */
  tier: "Large" | "Mid" | "Small";
};

/** A trio is exactly three. Stated as a tuple so a slide cannot be built with two or four. */
export type Trio = readonly [TrioStock, TrioStock, TrioStock];

/** The windows each card reports, shortest first — a single day says almost nothing on its own. */
const TRIO_PERIODS = [
  { label: "1W", key: "oneWeek" },
  { label: "1M", key: "oneMonth" },
  { label: "6M", key: "sixMonth" },
  { label: "1Y", key: "oneYear" },
  { label: "3Y", key: "threeYear" },
] as const;

/** A price in rupees, or a dash when the feed has none. Never a zero standing in for "unknown". */
export function trioPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A measured return, or a dash. A company younger than the window genuinely has no figure. */
export function trioReturn(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? signed(value, 1) : "—";
}

/**
 * One company's card.
 *
 * Pure — it is handed its figures rather than fetching them — and deliberately spare. A card in a
 * hero has a couple of seconds of a reader's attention, so it carries one line of identity, one
 * line of what the company does, the price, today's move, and the returns. Everything that was
 * competing with those has gone: a per-card progress bar, and a comparison table underneath that
 * repeated the same five windows a second time in a denser form.
 */
export function TrioCard({
  stock,
  performance,
  loading,
}: {
  stock: TrioStock;
  performance: StockPerformance | null;
  loading: boolean;
}) {
  const day = performance?.oneDay ?? null;

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border shadow-[0_12px_32px_-20px_rgba(15,23,42,0.5)] ${stock.accent} ${stock.wash}`}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <CompanyLogo symbol={stock.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black leading-tight text-slate-900">{stock.symbol}</p>
          <p className="truncate text-xs font-medium text-slate-600">{stock.company}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          {stock.tier}
        </span>
      </div>

      {/* Two lines at most. A third pushes three stacked cards past the frame on a narrow screen. */}
      <p className="mt-2.5 line-clamp-2 px-4 text-[11px] leading-relaxed text-slate-500">{stock.blurb}</p>

      <div className="mt-3.5 flex items-end justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Last price</p>
          <p className="text-xl font-black leading-tight tabular-nums text-slate-900">
            {loading ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-white/80" /> : trioPrice(performance?.price)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${
            day === null ? "bg-white/90 text-slate-400" : day >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          }`}
        >
          {loading ? "…" : trioReturn(day)}
        </span>
      </div>

      {/* The returns, as one quiet strip along the foot rather than a second table of their own. */}
      <dl className="mt-4 flex divide-x divide-white/80 border-t border-white/80 bg-white/70">
        {TRIO_PERIODS.map((period) => {
          const value = performance?.[period.key] ?? null;
          return (
            <div key={period.label} className="flex-1 px-1 py-2.5 text-center">
              <dt className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">{period.label}</dt>
              <dd className={`mt-1 text-[11px] font-black tabular-nums ${value === null ? "text-slate-300" : tone(value)}`}>
                {loading ? "…" : trioReturn(value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * Three companies from one sector, side by side on live figures.
 *
 * One sector on purpose: three banks can be read against each other, whereas a bank beside a
 * software firm cannot. Both trio slides share this component, so they differ only in their
 * companies and their colour — never in how a figure is drawn or in what a blank means.
 */
function StockTrioScene({
  palette,
  eyebrow,
  title,
  badge,
  footnote,
  stocks,
}: {
  palette: ScenePalette;
  eyebrow: string;
  title: string;
  badge: string;
  footnote: string;
  stocks: Trio;
}) {
  // Written out rather than looped: hooks cannot be called in a loop, and a trio is always three.
  // All three symbols are raised in the same tick, so the batching hook sends one request for them.
  const first = useStockPerformance(stocks[0].symbol);
  const second = useStockPerformance(stocks[1].symbol);
  const third = useStockPerformance(stocks[2].symbol);
  const rows = [first, second, third];

  return (
    <SceneCard palette={palette} eyebrow={eyebrow} title={title} badge={badge} footnote={footnote} inset="p-3 sm:p-8 lg:p-12">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stocks.map((stock, index) => (
          <TrioCard key={stock.symbol} stock={stock} performance={rows[index].performance} loading={rows[index].loading} />
        ))}
      </div>
    </SceneCard>
  );
}

/**
 * The three listed defence names a reader is most likely to be weighing against each other.
 *
 * One theme, three different businesses and three different sizes — aircraft, warships and
 * components, at large, mid and small cap. That spread is the point rather than a flaw in the
 * comparison: it is why the same order book can produce very different returns, and the cards say
 * which tier each one is so a small cap's move is never read as a large cap's.
 */
export const DEFENCE_TRIO: Trio = [
  {
    symbol: "HAL",
    company: "Hindustan Aeronautics",
    blurb: "Builds and services India's military aircraft and helicopters. The largest of the three by far.",
    accent: "border-emerald-300",
    wash: "bg-emerald-50/70",
    tier: "Large",
  },
  {
    symbol: "MAZDOCK",
    company: "Mazagon Dock Shipbuilders",
    blurb: "The navy's shipyard: destroyers and submarines, on long fixed-price programmes.",
    accent: "border-teal-300",
    wash: "bg-teal-50/70",
    tier: "Mid",
  },
  {
    symbol: "PARAS",
    company: "Paras Defence and Space Technologies",
    blurb: "Optics, electronics and drone systems that go inside other people's platforms.",
    accent: "border-cyan-300",
    wash: "bg-cyan-50/70",
    tier: "Small",
  },
];

export function DefenceStocksScene() {
  return (
    <StockTrioScene
      palette={MINT}
      eyebrow="Defence"
      title="Aircraft, warships and optics, compared"
      badge="LIVE FIGURES"
      footnote="Live prices and returns from the same exchange feed as the boards below · three different cap tiers, so compare the tier as well as the move · measured, not modelled · not investment advice"
      stocks={DEFENCE_TRIO}
    />
  );
}

/** The three listed names that actually build, power and house an Indian data centre. */
export const DATA_CENTRE_TRIO: Trio = [
  {
    symbol: "NETWEB",
    company: "Netweb Technologies India",
    blurb: "Builds the high-performance compute and AI servers that fill the racks.",
    accent: "border-violet-300",
    wash: "bg-violet-50/70",
    tier: "Small",
  },
  {
    symbol: "POWERINDIA",
    company: "Hitachi Energy India",
    blurb: "Supplies the grid connection, transformers and switchgear that feed them.",
    accent: "border-fuchsia-300",
    wash: "bg-fuchsia-50/70",
    tier: "Large",
  },
  {
    symbol: "LT",
    company: "Larsen & Toubro",
    blurb: "Engineers and constructs the buildings themselves, campus by campus.",
    accent: "border-purple-300",
    wash: "bg-purple-50/70",
    tier: "Large",
  },
];

export function DataCentreScene() {
  return (
    <StockTrioScene
      palette={LILAC}
      eyebrow="Data centres"
      title="Three ways to own the build-out"
      badge="LIVE FIGURES"
      footnote="The servers, the power and the building — one listed company each · live exchange figures · not investment advice"
      stocks={DATA_CENTRE_TRIO}
    />
  );
}


// ---------------------------------------------------------------------------
// Scene 4 — the year's winners that are on sale today
// ---------------------------------------------------------------------------
//
// Two conditions at once, and neither is interesting alone: a company that has compounded over the
// last year, trading today below its own recent range and down on the session. A winner at its high
// is not cheap; a stock at its low that went nowhere all year is not a winner, it is a faller.
//
// Every figure is measured. The year's return is read from BSE's Bhavcopy archive, and the discount
// is today's price against this company's own recent published closes — not against a peer group
// and not against an estimate. The headline count beside each card is exactly that: a count of
// classified headlines. It colours the card and never decides who is on it, because a screen that
// moved on sentiment would stop being a measurement.

export type DipNewsTilt = {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  score: number;
  headline: string | null;
  headlineUrl: string | null;
  classifier: "ai" | "heuristic" | null;
};

export type DipLeader = {
  code: string;
  ticker: string;
  name: string;
  sector: string | null;
  capTier: string | null;
  price: number | null;
  changePercent: number | null;
  yearReturn: number | null;
  referenceHigh: number | null;
  offRecentHigh: number | null;
  news: DipNewsTilt;
};

export type DipLeaderBoard = {
  leaders: DipLeader[];
  sessionDate: string | null;
  examined: number;
  fetchedAt: string;
};

/** How the headline count reads, so a card never shows a bare number with no meaning. */
export function tiltLabel(tilt: DipNewsTilt): string {
  if (tilt.total === 0) return "No coverage this week";
  if (tilt.score > 55) return `${tilt.positive} of ${tilt.total} headlines positive`;
  if (tilt.score < 45) return `${tilt.negative} of ${tilt.total} headlines negative`;
  return `${tilt.total} headlines, balanced`;
}

/** The tint the news chip wears — green when the week reads well, red when it does not. */
export function tiltTone(tilt: DipNewsTilt): string {
  if (tilt.total === 0) return "bg-slate-100 text-slate-500";
  if (tilt.score > 55) return "bg-emerald-100 text-emerald-700";
  if (tilt.score < 45) return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

/**
 * Where today's price sits inside the band between the recent high and the discount's depth, 0-100.
 *
 * Drawn as a marker on a rail rather than as a bar, because the reader's question here is "how far
 * down the range is it", which a position answers and a length does not.
 */
export function dipRailPosition(offRecentHigh: number | null): number {
  if (typeof offRecentHigh !== "number" || !Number.isFinite(offRecentHigh)) return 100;
  // A 30% discount pins the marker to the cheap end; anything deeper is still just "cheapest".
  const depth = Math.min(Math.abs(offRecentHigh), 30);
  return Math.max(0, Math.min(100, 100 - (depth / 30) * 100));
}

/** A rupee price from the board, or a dash. */
export function dipPrice(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DipLeaderCard({ leader, rank }: { leader: DipLeader; rank: number }) {
  return (
    <div className="flex flex-col rounded-2xl border-2 border-amber-300 bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)]">
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-black tabular-nums text-amber-700">
          {rank}
        </span>
        <CompanyLogo symbol={leader.ticker} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900">{leader.ticker}</p>
          <p className="truncate text-[11px] font-medium text-slate-600">{leader.name}</p>
          <p className="truncate text-[10px] text-slate-400">
            BSE {leader.code}
            {leader.sector ? ` · ${leader.sector}` : ""}
          </p>
        </div>
      </div>

      {/* The two halves of the screen, side by side, because neither means anything alone. */}
      <div className="mt-3 grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100">
        <div className="bg-white px-2 py-2 text-center">
          <p className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Last year</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-emerald-600">
            {leader.yearReturn === null ? "—" : signed(leader.yearReturn, 0)}
          </p>
        </div>
        <div className="bg-white px-2 py-2 text-center">
          <p className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Off recent high</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-rose-600">
            {leader.offRecentHigh === null ? "—" : signed(leader.offRecentHigh, 1)}
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 px-3 pt-2.5">
        <div className="min-w-0">
          <p className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">Today</p>
          <p className="text-lg font-black tabular-nums text-slate-900">{dipPrice(leader.price)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-black tabular-nums text-rose-700">
          {leader.changePercent === null ? "—" : signed(leader.changePercent, 2)}
        </span>
      </div>

      {/* Where it sits between its recent high and the deep-discount end of the rail. */}
      <div className="px-3 pt-2.5">
        <div className="flex items-center justify-between text-[9px] font-semibold text-slate-400">
          <span>CHEAPEST</span>
          <span className="tabular-nums">RECENT HIGH {dipPrice(leader.referenceHigh)}</span>
        </div>
        <div className="relative mt-1 h-1.5 rounded-full bg-gradient-to-r from-emerald-200 to-slate-100">
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900"
            style={{ left: `${dipRailPosition(leader.offRecentHigh)}%` }}
          />
        </div>
      </div>

      {/*
        The news read, as a count and nothing more.
        The card used to quote the single most recent headline underneath. In practice that was
        usually a routine regulatory filing — "reports no requests under SEBI special window" and
        the like — which told a reader nothing, crowded the card, and risked reading as a reason the
        stock is on the list when the screen is decided entirely by arithmetic. The count is the
        part that carries information; the headline itself is a scroll away on the news page.
      */}
      <div className="px-3 pt-2.5 pb-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${tiltTone(leader.news)}`}>
          {tiltLabel(leader.news)}
        </span>
      </div>
    </div>
  );
}

/** The card's own shape, drawn while the board is still loading. */
function DipLeaderSkeleton() {
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-white p-3">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-slate-100" />
        <div className="flex-1 space-y-1.5">
          <span className="block h-3 w-20 animate-pulse rounded bg-slate-100" />
          <span className="block h-2.5 w-28 animate-pulse rounded bg-slate-50" />
        </div>
      </div>
      <div className="mt-3 h-12 animate-pulse rounded bg-slate-50" />
      <div className="mt-3 h-6 animate-pulse rounded bg-slate-50" />
    </div>
  );
}

export function DipBuysScene() {
  const [board, setBoard] = useState<DipLeaderBoard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;

    fetch("/api/market/dip-leaders")
      .then((response) => {
        if (!response.ok) throw new Error("Dip leaders unavailable");
        return response.json();
      })
      .then((data: DipLeaderBoard) => {
        if (live) setBoard(data);
      })
      .catch(() => {
        if (live) setFailed(true);
      });

    return () => {
      live = false;
    };
  }, []);

  const leaders = board?.leaders ?? [];

  return (
    <SceneCard
      palette={SAND}
      eyebrow="Winners on sale"
      title="Best of the year, cheapest today"
      badge="SCREENED LIVE"
      inset="p-3 sm:p-8 lg:p-12"
      footnote="Among the year's strongest performers worth ₹1,000 crore or more that traded at least ₹1 crore today, ranked by the discount to their own recent closes · returns from BSE's published sessions, headlines counted separately and never part of the screen · not investment advice"
    >
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {leaders.map((leader, index) => (
          <DipLeaderCard key={leader.code} leader={leader} rank={index + 1} />
        ))}

        {/* Placeholders only while nothing has arrived — never mixed in beside real cards. */}
        {leaders.length === 0 &&
          !failed &&
          [0, 1, 2].map((slot) => <DipLeaderSkeleton key={slot} />)}
      </div>

      {/* Both empty states are real outcomes and say which one happened, rather than one vague
          message covering an unreachable feed and a market with nothing on sale. */}
      {failed && (
        <p className="mt-3 text-xs font-medium text-amber-800">
          The screen couldn&apos;t reach the exchange feed just now. The live boards below have the same data.
        </p>
      )}
      {!failed && board !== null && leaders.length === 0 && (
        <p className="mt-3 text-xs font-medium text-amber-800">
          None of the year&apos;s leaders is trading below its recent range today — nothing is on sale.
        </p>
      )}
    </SceneCard>
  );
}
