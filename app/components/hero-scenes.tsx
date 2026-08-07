/**
 * The four full-width scenes behind the landing hero.
 *
 * They are drawn live in SVG and CSS rather than shipped as exported images: the hero is
 * full-bleed, so a raster export is either enormous or visibly soft on a wide display, and at
 * 4:3 crops it reflows badly. Vector scenes stay sharp at any width and cost nothing to download.
 *
 * Every scene is a *depiction* of the product — a themed gainers board, a two-stock contest, a
 * three-stock report, the analysis pipeline — not a screenshot. Company names and BSE scrip codes
 * are real; the prices and percentages are illustrative and each scene says so on its own
 * footnote. The real numbers are a scroll down the page, wired to the exchange feeds.
 *
 * Every scene is laid out inside one padded card (`SceneCard`) in normal flow — nothing is
 * absolutely positioned against the frame edge, so no content can ever sit flush against it or
 * overlap a neighbour at an unplanned width.
 */

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
function Panel({ palette, className = "", children }: { palette: ScenePalette; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.4)] ${palette.panel} ${className}`}>{children}</div>
  );
}

function PanelHead({ palette, title, right }: { palette: ScenePalette; title: string; right?: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-2 border-b px-4 py-2.5 ${palette.rule}`}>
      <p className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">{title}</p>
      {right}
    </div>
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
   */
  inset = "p-5 sm:p-7 lg:p-10",
  children,
}: {
  palette: ScenePalette;
  eyebrow: string;
  title: string;
  badge: string;
  footnote: string;
  inset?: string;
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
      inset="p-7 sm:p-10 lg:p-14"
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
// Scene 2 — two stocks, compared by AI
// ---------------------------------------------------------------------------

export type CompareSide = {
  code: string;
  symbol: string;
  company: string;
  price: string;
  today: number;
  verdict: string;
  score: number;
  pros: string[];
  cons: string[];
};

/** One measured row of the contest: the same figure for both sides, and who it favours. */
export type CompareMetric = {
  label: string;
  /** What the row measures, in words a reader does not need the jargon to follow. */
  plain: string;
  left: string;
  right: string;
  /** Which side the number itself favours. Nothing here is a matter of opinion. */
  winner: "left" | "right";
};

const LEFT: CompareSide = {
  code: "500180",
  symbol: "HDFCBANK",
  company: "HDFC Bank",
  price: "1,678.90",
  today: 2.14,
  verdict: "Buy",
  score: 78,
  pros: ["Best one-year return of the pair", "Deepest delivery volume"],
  cons: ["Trades at the richer multiple"],
};

const RIGHT: CompareSide = {
  code: "532174",
  symbol: "ICICIBANK",
  company: "ICICI Bank",
  price: "1,284.60",
  today: 2.91,
  verdict: "Hold",
  score: 64,
  pros: ["Cheaper on earnings", "Stronger move today"],
  cons: ["Trails over six months and a year"],
};

/**
 * Each row says what it measures in words, not in jargon.
 *
 * "P/E 21.4x vs 17.9x" only helps a reader who already knows that lower wins; "Cheaper on
 * earnings" tells them what the comparison decided and why.
 */
const METRICS: CompareMetric[] = [
  { label: "Return over 1 month", plain: "Which one rose more in the last month", left: "+4.82%", right: "+3.10%", winner: "left" },
  { label: "Return over 6 months", plain: "Which one rose more since February", left: "+18.40%", right: "+11.75%", winner: "left" },
  { label: "Return over 1 year", plain: "Which one rose more over the full year", left: "+27.16%", right: "+22.08%", winner: "left" },
  { label: "Price vs earnings", plain: "How many years of profit the price costs — lower is cheaper", left: "21.4x", right: "17.9x", winner: "right" },
  { label: "Shares actually delivered", plain: "How much of the trading was real buying, not intraday churn", left: "62.1%", right: "54.8%", winner: "left" },
];

/**
 * Which side the measured rows favour, and by how many of them.
 *
 * This is the whole honesty contract of the compare feature in one function: the arithmetic
 * counts the rows and picks the winner, and the AI is only ever handed that result to write up.
 */
export function tallyCompare(metrics: CompareMetric[]): { left: number; right: number; leader: "left" | "right" } {
  const left = metrics.filter((metric) => metric.winner === "left").length;
  const right = metrics.length - left;
  return { left, right, leader: left >= right ? "left" : "right" };
}

/**
 * One competitor's full card: who it is, what it costs, what the desk calls it, and the two or
 * three points that carried the call.
 */
function ContenderCard({ side, leading }: { side: CompareSide; leading: boolean }) {
  return (
    <Panel palette={SKY} className={`flex flex-col gap-2.5 overflow-hidden p-3 ${leading ? "border-emerald-300 ring-1 ring-emerald-200" : ""}`}>
      {/* Identity */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-black text-slate-900">{side.symbol}</p>
          <p className="truncate text-[10px] text-slate-500">
            {side.company} · {side.code}
          </p>
        </div>
        {leading && (
          <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black tracking-wide text-white uppercase">
            Stronger
          </span>
        )}
      </div>

      {/* Price and verdict, each its own tile so neither reads as a caption on the other. */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[9px] font-semibold tracking-wide text-slate-400 uppercase">Last price</p>
          <p className="font-mono text-lg font-black text-slate-900">₹{side.price}</p>
          <p className={`font-mono text-[10px] font-bold ${UP_TEXT}`}>{signed(side.today)} today</p>
        </div>
        <div className={`rounded-xl border px-3 py-2 ${leading ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <p className="text-[9px] font-semibold tracking-wide text-slate-400 uppercase">AI verdict</p>
          <p className="text-lg font-black text-slate-900">{side.verdict}</p>
          <p className={`font-mono text-[10px] font-bold ${leading ? UP_TEXT : "text-slate-500"}`}>score {side.score}</p>
        </div>
      </div>

      {/* Pros and cons, split into their own boxes rather than one mixed list. */}
      <div className="grid grid-cols-1 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2">
          <p className="text-[9px] font-black tracking-widest text-emerald-700 uppercase">For</p>
          {side.pros.map((point) => (
            <p key={point} className={`mt-1 flex gap-1.5 text-[10px] leading-snug ${UP_TEXT}`}>
              <span aria-hidden="true">▲</span>
              <span className="min-w-0 flex-1">{point}</span>
            </p>
          ))}
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2">
          <p className="text-[9px] font-black tracking-widest text-rose-700 uppercase">Against</p>
          {side.cons.map((point) => (
            <p key={point} className={`mt-1 flex gap-1.5 text-[10px] leading-snug ${DOWN_TEXT}`}>
              <span aria-hidden="true">▼</span>
              <span className="min-w-0 flex-1">{point}</span>
            </p>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/**
 * The measure ladder down the middle of the contest.
 *
 * Each rung is one measured row with the figure on each side and an arrow pointing at whichever
 * one it favours — so the reader can see the contest being decided rather than be handed a total.
 */
function MeasureLadder({ tally }: { tally: ReturnType<typeof tallyCompare> }) {
  return (
    <Panel palette={SKY} className="overflow-hidden">
      <div className={`border-b px-3 py-2 text-center ${SKY.rule}`}>
        <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Five things we measured</p>
        <p className="font-mono text-sm font-black text-slate-900">
          {tally.left} – {tally.right}
        </p>
        <p className="text-[9px] text-slate-500">
          {tally.leader === "left" ? "HDFCBANK" : "ICICIBANK"} wins more of them
        </p>
      </div>

      <ul className="divide-y divide-slate-100">
        {METRICS.map((metric) => (
          <li key={metric.label} className="px-2.5 py-1.5">
            <p className="text-[9px] font-bold text-slate-600">{metric.label}</p>
            <p className="text-[9px] leading-tight text-slate-400">{metric.plain}</p>
            <div className="mt-0.5 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
              <span
                className={`text-right font-mono text-[11px] ${metric.winner === "left" ? `font-black ${UP_TEXT}` : "text-slate-400"}`}
              >
                {metric.left}
              </span>
              <span className={`px-1 text-center text-[10px] ${UP_TEXT}`} aria-label={`favours ${metric.winner}`}>
                {metric.winner === "left" ? "◀ wins" : "wins ▶"}
              </span>
              <span className={`font-mono text-[11px] ${metric.winner === "right" ? `font-black ${UP_TEXT}` : "text-slate-400"}`}>
                {metric.right}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CompareScene() {
  const tally = tallyCompare(METRICS);

  return (
    <SceneCard
      palette={SKY}
      eyebrow="Compare with AI"
      title="Any two stocks, scored on the same five measures"
      badge="AI DESK"
      footnote="The five rows decide the winner; the AI only writes up what they say · illustration · not investment advice"
    >
      {/* A versus layout rather than a table: contender, ladder, contender. */}
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_0.7fr_1fr]">
        <ContenderCard side={LEFT} leading={tally.leader === "left"} />
        <MeasureLadder tally={tally} />
        <ContenderCard side={RIGHT} leading={tally.leader === "right"} />
      </div>
    </SceneCard>
  );
}

// ---------------------------------------------------------------------------
// Scene 3 — a three-stock report: buy, hold or sell
// ---------------------------------------------------------------------------

export type Verdict = "Buy" | "Hold" | "Sell";

export type ReportCard = {
  code: string;
  symbol: string;
  company: string;
  price: string;
  verdict: Verdict;
  score: number;
  returns: { label: string; value: number }[];
  because: string;
};

/** Verdict colours. One palette per stance, so the three cards are legible at a glance. */
export function verdictStyle(verdict: Verdict): { card: string; badge: string; ring: string } {
  if (verdict === "Buy") {
    return { card: "border-emerald-300", badge: "bg-emerald-600 text-white", ring: "#059669" };
  }
  if (verdict === "Hold") {
    return { card: "border-amber-300", badge: "bg-amber-500 text-white", ring: "#d97706" };
  }
  return { card: "border-rose-300", badge: "bg-rose-600 text-white", ring: "#e11d48" };
}

/**
 * Three scrips, scored the same way and landing on three different stances.
 *
 * Deliberately one of each: a report where everything is a buy tells a reader nothing about how
 * the scoring works, and the point of this scene is that the same measures can say sell.
 */
export const REPORT_CARDS: ReportCard[] = [
  {
    code: "500325",
    symbol: "RELIANCE",
    company: "Reliance Industries",
    price: "2,847.50",
    verdict: "Buy",
    score: 81,
    returns: [
      { label: "1M", value: 6.4 },
      { label: "6M", value: 19.2 },
      { label: "1Y", value: 31.7 },
    ],
    because: "Positive over every window measured, and the six-month leg is the strongest of the three.",
  },
  {
    code: "532540",
    symbol: "TCS",
    company: "Tata Consultancy Services",
    price: "3,912.20",
    verdict: "Hold",
    score: 57,
    returns: [
      { label: "1M", value: 1.8 },
      { label: "6M", value: -2.4 },
      { label: "1Y", value: 8.9 },
    ],
    because: "Up on the year but down over six months — the windows disagree, so the score sits in the middle.",
  },
  {
    code: "500820",
    symbol: "ASIANPAINT",
    company: "Asian Paints",
    price: "2,298.50",
    verdict: "Sell",
    score: 28,
    returns: [
      { label: "1M", value: -3.1 },
      { label: "6M", value: -11.6 },
      { label: "1Y", value: -18.4 },
    ],
    because: "Negative over every window measured, and the decline has widened as the window lengthens.",
  },
];

function ScoreRing({ value, colour }: { value: number; colour: string }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 68 68" className="h-14 w-14 shrink-0">
      <circle cx="34" cy="34" r={radius} fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth="6" />
      <circle
        cx="34"
        cy="34"
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="33" textAnchor="middle" fontSize="16" fontWeight="800" fill="#0f172a">
        {value}
      </text>
      <text x="34" y="45" textAnchor="middle" fontSize="7" fill="#94a3b8" letterSpacing="1">
        SCORE
      </text>
    </svg>
  );
}

function ReportPanel({ card }: { card: ReportCard }) {
  const style = verdictStyle(card.verdict);

  return (
    <Panel palette={LILAC} className={`overflow-hidden ${style.card}`}>
      <div className={`flex items-start justify-between gap-3 border-b px-3 py-2 ${LILAC.rule}`}>
        <div className="min-w-0">
          <p className="truncate font-mono text-[13px] font-black text-slate-900">{card.symbol}</p>
          <p className="truncate text-[10px] text-slate-500">
            {card.company} · {card.code}
          </p>
          <p className="font-mono text-[12px] font-bold text-slate-700">₹{card.price}</p>
        </div>
        <ScoreRing value={card.score} colour={style.ring} />
      </div>

      <div className="px-3 py-2">
        <span className={`inline-block rounded-full px-3 py-0.5 text-[13px] font-black tracking-wide uppercase ${style.badge}`}>
          {card.verdict}
        </span>

        <dl className="mt-2 grid grid-cols-3 gap-1.5">
          {card.returns.map((window) => (
            <div key={window.label} className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-center">
              <dt className="text-[9px] font-semibold tracking-wide text-slate-400 uppercase">{window.label}</dt>
              <dd className={`mt-0.5 font-mono text-[11px] font-bold ${tone(window.value)}`}>{signed(window.value, 1)}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-2 line-clamp-3 text-[10px] leading-snug text-slate-600">{card.because}</p>
      </div>
    </Panel>
  );
}

export function TripleReportScene() {
  return (
    <SceneCard
      palette={LILAC}
      eyebrow="AI comparison report"
      title="Three stocks. Buy, hold or sell."
      badge="SCORED TODAY"
      inset="p-7 sm:p-10 lg:p-14"
      footnote="The stance comes from the measured returns, never from the model · illustration · not investment advice"
    >
      {/* `items-start` so a card is as tall as its own copy — stretching all three to the row
          left most of each one empty. */}
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_CARDS.map((card) => (
          <ReportPanel key={card.code} card={card} />
        ))}
      </div>
    </SceneCard>
  );
}

// ---------------------------------------------------------------------------
// Scene 4 — how the analysis works, and what it likes at today's price
// ---------------------------------------------------------------------------

/** The four stages every board in this product runs through, in order. */
export const PIPELINE: { step: string; detail: string }[] = [
  { step: "Read the exchange", detail: "BSE Bhavcopy and the live quote feed. No sampling, no estimates." },
  { step: "Measure the returns", detail: "One week, one month, six months and one year, per scrip." },
  { step: "Score the stance", detail: "Arithmetic picks buy, hold or sell. The model never touches this." },
  { step: "Write it up", detail: "The AI explains the score it was handed, and may not contradict it." },
];

export type DipPick = {
  code: string;
  symbol: string;
  company: string;
  price: string;
  /** Return over the last year — the reason it is on the list at all. */
  year: number;
  /** How far below its own 52-week high it trades today — the reason it is on the list now. */
  offHigh: number;
  yearHigh: string;
  when: "Today" | "Tomorrow";
};

/**
 * Companies that have delivered over a year but are not at their high right now.
 *
 * Both halves matter and neither is enough on its own: a year of gains with no pullback is not a
 * cheaper entry, and a pullback with no year behind it is just a stock going down.
 */
export const DIP_PICKS: DipPick[] = [
  {
    code: "500034",
    symbol: "BAJFINANCE",
    company: "Bajaj Finance",
    price: "1,141.20",
    year: 31.2,
    offHigh: 15.8,
    yearHigh: "1,355.40",
    when: "Today",
  },
  {
    code: "500114",
    symbol: "TITAN",
    company: "Titan Company",
    price: "3,214.80",
    year: 24.6,
    offHigh: 12.4,
    yearHigh: "3,669.60",
    when: "Today",
  },
  {
    code: "500570",
    symbol: "TATAMOTORS",
    company: "Tata Motors",
    price: "684.35",
    year: 19.4,
    offHigh: 9.7,
    yearHigh: "757.90",
    when: "Tomorrow",
  },
];

/**
 * How far along its own 52-week band the price sits, as a percentage.
 *
 * A pick 15.8% off its high is at 84.2% of it — the bar reads as "how much of the high is left in
 * the price", which is the way round a reader thinks about a pullback.
 */
export function bandPosition(offHigh: number): number {
  return Math.max(0, Math.min(100, 100 - offHigh));
}

/**
 * The pipeline as a numbered column down the left.
 *
 * The other three scenes are card grids read left to right; this one puts the method beside the
 * result, so the last slide answers "how" and "what" in one glance instead of stacking two grids.
 */
function PipelineColumn() {
  return (
    <Panel palette={SAND} className="overflow-hidden p-4">
      <p className="text-[10px] font-bold tracking-widest text-amber-700 uppercase">Four steps, every scrip</p>

      <ol className="mt-3 space-y-3">
        {PIPELINE.map((stage, index) => (
          <li key={stage.step} className="relative flex gap-2.5">
            <div className="flex flex-col items-center">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 font-mono text-[10px] font-black text-white">
                {index + 1}
              </span>
              {/* The rail joining one step to the next; the last step has nothing to join to. */}
              {index < PIPELINE.length - 1 && <span className="mt-0.5 w-px flex-1 bg-amber-300" aria-hidden="true" />}
            </div>
            <div className="min-w-0 pb-1">
              <p className="text-[11px] font-bold text-slate-800">{stage.step}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/**
 * One pick as a price ladder: what it costs today against what it cost at its high, with the gap
 * between them called out. It is the same two facts as before, drawn as the distance the price
 * has to travel rather than as two separate tiles.
 */
function DipLadder({ pick }: { pick: DipPick }) {
  return (
    <li className="rounded-xl border border-amber-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[13px] font-black text-slate-900">{pick.symbol}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black tracking-wide uppercase ${
                pick.when === "Today" ? "bg-emerald-600 text-white" : "bg-sky-600 text-white"
              }`}
            >
              Buy {pick.when}
            </span>
          </div>
          <p className="truncate text-[10px] text-slate-500">
            {pick.company} · {pick.code}
          </p>
        </div>

        <div className="flex shrink-0 items-baseline gap-3">
          <span className={`font-mono text-[11px] font-black ${UP_TEXT}`}>{signed(pick.year, 1)} over a year</span>
          <span className="font-mono text-[11px] font-black text-amber-700">{signed(-pick.offHigh, 1)} off its high</span>
        </div>
      </div>

      {/* The ladder: green is the price you pay today, amber is the distance back to the high. */}
      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] font-bold text-slate-900">₹{pick.price}</span>
        <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <span className="h-2 bg-emerald-500" style={{ width: `${bandPosition(pick.offHigh)}%` }} />
          <span className="h-2 bg-amber-400" style={{ width: `${pick.offHigh}%` }} />
        </span>
        <span className="shrink-0 font-mono text-[11px] text-slate-500">₹{pick.yearHigh}</span>
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] font-semibold tracking-wide text-slate-400 uppercase">
        <span>Today</span>
        <span>52-week high</span>
      </div>
    </li>
  );
}

export function DipBuysScene() {
  return (
    <SceneCard
      palette={SAND}
      eyebrow="How the analysis works"
      title="A strong year, on offer at today's price"
      badge="RESCORED DAILY"
      inset="p-4 sm:p-6 lg:p-8"
      footnote="A pullback is not a discount on its own — these are measurements, illustrated · not investment advice"
    >
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[0.8fr_1.4fr]">
        <PipelineColumn />

        <Panel palette={SAND} className="overflow-hidden">
          <PanelHead
            palette={SAND}
            title="Up over a year, below its own high today"
            right={<span className="text-[10px] text-slate-500">{DIP_PICKS.length} picks</span>}
          />
          <ul className="space-y-2.5 p-3">
            {DIP_PICKS.map((pick) => (
              <DipLadder key={pick.code} pick={pick} />
            ))}
          </ul>
        </Panel>
      </div>
    </SceneCard>
  );
}
