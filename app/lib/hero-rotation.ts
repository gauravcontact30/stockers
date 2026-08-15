// What the landing page slider shows today.
//
// ---------------------------------------------------------------------------
// The problem this solves
// ---------------------------------------------------------------------------
//
// The hero carousel was four hard-coded scenes. Whatever day you arrived, whatever the app had
// grown since, you saw the same four: top performers, two stock trios and the dip board. Meanwhile
// the product had grown to eighteen AI features, fourteen of which the landing page never mentioned
// at all — so the slider was advertising about a fifth of what somebody would be paying for.
//
// This module is the answer to "what goes in the slider today". It is a pure function of the date:
// no clock, no randomness, no state. That matters more than it sounds, because the carousel is
// rendered on the server and hydrated in the browser, and *anything* that could disagree between
// the two — `Math.random`, `new Date()` read in two places either side of midnight — produces a
// hydration mismatch that React resolves by throwing the server's markup away.
//
// ---------------------------------------------------------------------------
// Why the day is passed in rather than read here
// ---------------------------------------------------------------------------
//
// The IST day is computed once, on the server, and handed to the carousel as a prop. If the browser
// worked it out for itself, a reader in another timezone would get a different answer than the
// server did and the hero would re-render on hydration. Passing it down means the server decides
// and the browser agrees by construction.
//
// ---------------------------------------------------------------------------
// The shape of a day's rotation
// ---------------------------------------------------------------------------
//
// Every day gets one live scene and three feature showcases.
//
// The split is deliberate. The four live scenes are the only slides carrying real exchange figures
// — a reader who never scrolls has still seen this session's actual prices — and drawing four slides
// blindly from a pool of eighteen would give a lot of days no real data at all. So one live scene is
// always present and rotates through the four, and the other three slots rotate through the fourteen
// features that have no bespoke scene. Nothing repeats within a day, everything appears over time,
// and the whole set changes at IST midnight.

import { AI_FEATURES, type FeatureKey, type PlanTier } from "./plan-tiers";

/** Which bespoke scene a showcase renders, when it has one. */
export type LiveSceneKey = "top-gainers" | "defence" | "data-centre" | "dip-buys";

/** The four palettes the scenes are drawn in. Named rather than imported: this module is pure. */
export type PaletteKey = "mint" | "sky" | "lilac" | "sand";

/** One row of the little mock panel a feature showcase draws. */
export type ShowcaseRow = {
  left: string;
  middle: string;
  right: string;
  /**
   * The company or fund this row is about, when it is about one.
   *
   * Drives the real mark drawn at the start of the row — the same `CompanyLogo` the boards use, so
   * the ticker store's own image is fetched and a company with no logo falls back to the drawn
   * monogram rather than to a broken image. Rows that name an index, a sector or a filing type
   * leave it unset, because there is no company there to put a face to.
   *
   * Note this is a property of the *row*, not of a cell: on the news showcase the stock sits in the
   * middle column and the headline on the left, and the mark still belongs at the front, where it
   * says whose row this is.
   */
  symbol?: string;
  /**
   * Colours the right-hand cell green or red. Left undefined for a cell that is not a direction —
   * a payout or an ISIN is neither up nor down, and colouring it would imply it was.
   */
  up?: boolean;
};

export type HeroShowcase = {
  key: FeatureKey;
  /** The feature's own name and one-liner, taken from `AI_FEATURES` so they cannot drift. */
  label: string;
  blurb: string;
  tier: PlanTier;
  /** The headline on the card — a claim about the feature, not the feature's name again. */
  title: string;
  /** The lamp's label. */
  badge: string;
  palette: PaletteKey;
  /** Where the slide sends a reader who wants it. */
  href: string;
  /** Set on the four features that have a bespoke, live-data scene of their own. */
  scene?: LiveSceneKey;
  /** The mock panel's headers and rows. Only read for showcases with no `scene`. */
  columns?: readonly [string, string, string];
  rows?: readonly ShowcaseRow[];
  /** Three things the feature actually does. */
  points?: readonly string[];
};

const FEATURE = Object.fromEntries(AI_FEATURES.map((feature) => [feature.key, feature])) as Record<
  FeatureKey,
  (typeof AI_FEATURES)[number]
>;

/** Fills in the half of a showcase that is already stated in `AI_FEATURES`. */
function showcase(key: FeatureKey, rest: Omit<HeroShowcase, "key" | "label" | "blurb" | "tier">): HeroShowcase {
  const feature = FEATURE[key];
  return { key, label: feature.label, blurb: feature.blurb, tier: feature.tier, ...rest };
}

// ---------------------------------------------------------------------------
// The four live scenes
// ---------------------------------------------------------------------------
//
// Each is pinned to the AI feature it actually demonstrates, so a reader who likes what a slide
// does can click straight through to it rather than being shown an unattributed illustration.

export const LIVE_SHOWCASES: HeroShowcase[] = [
  showcase("top-picks", {
    title: "Three themes the BSE board is bidding up",
    badge: "RANKED TODAY",
    palette: "mint",
    href: "/dashboard/top-picks",
    scene: "top-gainers",
  }),
  showcase("compare", {
    title: "HAL, Mazagon Dock and Paras Defence, side by side",
    badge: "LIVE FIGURES",
    palette: "sky",
    href: "/dashboard/compare-stocks",
    scene: "defence",
  }),
  showcase("research", {
    title: "Who is actually building the data centres",
    badge: "LIVE FIGURES",
    palette: "lilac",
    href: "/dashboard/stock-research",
    scene: "data-centre",
  }),
  showcase("dip-winners", {
    title: "What the AI likes cheap today, and why",
    badge: "SCREENED TODAY",
    palette: "sand",
    href: "/dashboard/dip-winners",
    scene: "dip-buys",
  }),
];

// ---------------------------------------------------------------------------
// The fourteen feature showcases
// ---------------------------------------------------------------------------
//
// The rows below depict each feature's own output. Company names, tickers, BSE scrip codes and
// ISINs are real; the figures beside them illustrate the layout, exactly as the live scenes'
// footnotes already say of theirs. Every card repeats that on its own footnote — a landing page
// that showed invented numbers without saying so would be the one dishonest surface on a site whose
// whole argument is that its figures are measured.

export const FEATURE_SHOWCASES: HeroShowcase[] = [
  showcase("market-pulse", {
    title: "The session's mood, read off the whole tape",
    badge: "LIVE BREADTH",
    palette: "sky",
    href: "/dashboard/market-pulse",
    columns: ["Index", "Level", "Today"],
    rows: [
      { left: "S&P BSE SENSEX", middle: "81,204", right: "+0.62%", up: true },
      { left: "BSE BANKEX", middle: "62,340", right: "+1.14%", up: true },
      { left: "BSE MIDCAP", middle: "46,918", right: "−0.21%", up: false },
    ],
    points: [
      "Advancers against decliners across the whole exchange, not a sample.",
      "Sector leadership re-ranked as the session moves.",
      "An AI read written over those measured figures — never in place of them.",
    ],
  }),
  showcase("sectors", {
    title: "Where the money moved, sector by sector",
    badge: "RANKED TODAY",
    palette: "mint",
    href: "/dashboard/sector-trends",
    columns: ["Sector", "Index", "Today"],
    rows: [
      { left: "Information technology", middle: "BSE IT", right: "+1.84%", up: true },
      { left: "Banking", middle: "BSE BANKEX", right: "+1.14%", up: true },
      { left: "Metal", middle: "BSE METAL", right: "−0.63%", up: false },
    ],
    points: [
      "Every sectoral index ranked by today's move.",
      "The leaders and laggards named, with the constituents behind them.",
      "Rotation read across the week, not just the session.",
    ],
  }),
  showcase("dividends", {
    title: "Every payout still ahead of you",
    badge: "EX-DATES AHEAD",
    palette: "sand",
    href: "/dashboard/dividends",
    columns: ["Company", "Ex-date", "Payout"],
    rows: [
      { left: "ITC", middle: "12 Sep", right: "₹6.25", symbol: "ITC" },
      { left: "Coal India", middle: "19 Sep", right: "₹5.50", symbol: "COALINDIA" },
      { left: "Hindustan Zinc", middle: "26 Sep", right: "₹10.00", symbol: "HINDZINC" },
    ],
    points: [
      "Declared payouts with the ex-date you have to hold by.",
      "Sorted by what is closest, so nothing is missed by a day.",
      "Yield against the current price, not the price when it was declared.",
    ],
  }),
  showcase("ipos", {
    title: "What is open, and how well it is going",
    badge: "LIVE SUBSCRIPTION",
    palette: "lilac",
    href: "/dashboard/ipos",
    columns: ["Issue", "Band", "Subscribed"],
    rows: [
      { left: "Mainboard · Auto ancillary", middle: "₹210–221", right: "42.8×", up: true },
      { left: "Mainboard · Speciality chemicals", middle: "₹648–682", right: "11.4×", up: true },
      { left: "SME · Logistics", middle: "₹96–102", right: "3.2×", up: true },
    ],
    points: [
      "Open and upcoming issues, mainboard and SME alike.",
      "Live subscription figures by category as the book builds.",
      "Listing dates and allotment, so the calendar is one page.",
    ],
  }),
  showcase("etf-board", {
    title: "Every NSE ETF, by the money actually traded",
    badge: "BY TURNOVER",
    palette: "sky",
    href: "/dashboard/etf-board",
    columns: ["ETF", "Asset class", "Turnover"],
    rows: [
      { left: "NIFTYBEES", middle: "Equity · NIFTY 50", right: "₹412 Cr", symbol: "NIFTYBEES" },
      { left: "GOLDBEES", middle: "Gold", right: "₹286 Cr", symbol: "GOLDBEES" },
      { left: "LIQUIDBEES", middle: "Liquid", right: "₹198 Cr", symbol: "LIQUIDBEES" },
    ],
    points: [
      "Grouped by asset class, so like is compared with like.",
      "Ranked by turnover rather than by size — what is liquid today.",
      "Tracking error and expense beside the return, not buried.",
    ],
  }),
  showcase("news", {
    title: "The day's headlines, scored for what they mean",
    badge: "SENTIMENT SCORED",
    palette: "mint",
    href: "/news",
    columns: ["Headline", "Stock", "Read"],
    rows: [
      { left: "Order win lifts the order book", middle: "RVNL", right: "Positive", up: true, symbol: "RVNL" },
      { left: "Margin guidance trimmed for H2", middle: "TECHM", right: "Negative", up: false, symbol: "TECHM" },
      { left: "Capacity expansion cleared", middle: "JSWSTEEL", right: "Positive", up: true, symbol: "JSWSTEEL" },
    ],
    points: [
      "Headlines from the publishers themselves, never rewritten.",
      "Each one tied to the company it is about, with a live price.",
      "Scored for sentiment so a long list can be read at a glance.",
    ],
  }),
  showcase("buy-tomorrow", {
    title: "Names set up for tomorrow, scored overnight",
    badge: "SCORED OVERNIGHT",
    palette: "lilac",
    href: "/dashboard/outperform-tomorrow",
    columns: ["Stock", "Setup", "Score"],
    rows: [
      { left: "SBIN", middle: "Breakout retest", right: "82", up: true, symbol: "SBIN" },
      { left: "LT", middle: "Trend continuation", right: "78", up: true, symbol: "LT" },
      { left: "TATAMOTORS", middle: "Reversal forming", right: "71", up: true, symbol: "TATAMOTORS" },
    ],
    points: [
      "Run after the close, over the session that just finished.",
      "Every score explained by the returns it was computed from.",
      "The setup named, so you can disagree with the reasoning.",
    ],
  }),
  showcase("portfolio", {
    title: "Your own holdings, with a call on each",
    badge: "TRACKED LIVE",
    palette: "sand",
    href: "/dashboard/portfolio",
    columns: ["Holding", "Weight", "Call"],
    rows: [
      { left: "RELIANCE", middle: "22%", right: "Hold", symbol: "RELIANCE" },
      { left: "HDFCBANK", middle: "18%", right: "Outperform", up: true, symbol: "HDFCBANK" },
      { left: "ITC", middle: "9%", right: "Trim", up: false, symbol: "ITC" },
    ],
    points: [
      "Positions tracked against the live tape, not last week's close.",
      "Concentration and sector mix read as a whole, not name by name.",
      "A call on every holding, with the figures behind it.",
    ],
  }),
  showcase("intel", {
    title: "Ask anything about a BSE stock",
    badge: "WITH SOURCES",
    palette: "sky",
    href: "/dashboard/intelligence-search",
    columns: ["Point", "Source", "Impact"],
    rows: [
      { left: "₹2,000 Cr defence order booked", middle: "Mint", right: "Positive", up: true },
      { left: "Margins guided lower for H2", middle: "Economic Times", right: "Negative", up: false },
      { left: "New plant commissioned ahead of time", middle: "Business Standard", right: "Positive", up: true },
    ],
    points: [
      "Answers in points, each one citing the headline it came from.",
      "A citation that names an article it was not given is dropped, not believed.",
      "Measured returns sit beside the answer, so prose never stands alone.",
    ],
  }),
  showcase("etf-research", {
    title: "Every major Indian ETF, decoded",
    badge: "DECODED",
    palette: "lilac",
    href: "/dashboard/etf-research",
    columns: ["ETF", "Tracks", "1Y"],
    rows: [
      { left: "NIFTYBEES", middle: "NIFTY 50", right: "+14.2%", up: true, symbol: "NIFTYBEES" },
      { left: "JUNIORBEES", middle: "NIFTY Next 50", right: "+21.6%", up: true, symbol: "JUNIORBEES" },
      { left: "GOLDBEES", middle: "Domestic gold", right: "+18.9%", up: true, symbol: "GOLDBEES" },
    ],
    points: [
      "What each fund actually holds, in plain words.",
      "Trailing returns over every window, from the same price history.",
      "What it costs to hold, next to what it returned.",
    ],
  }),
  showcase("directory", {
    title: "All 4,900+ listed companies, searchable",
    badge: "FULL EXCHANGE",
    palette: "mint",
    href: "/dashboard/company-directory",
    columns: ["Company", "Scrip code", "ISIN"],
    rows: [
      { left: "Reliance Industries", middle: "500325", right: "INE002A01018", symbol: "RELIANCE" },
      { left: "Tata Consultancy Services", middle: "532540", right: "INE467B01029", symbol: "TCS" },
      { left: "HDFC Bank", middle: "500180", right: "INE040A01034", symbol: "HDFCBANK" },
    ],
    points: [
      "Search by name, ticker, BSE scrip code or ISIN.",
      "The whole exchange, not the two hundred names everyone covers.",
      "Straight through to the AI read on any of them.",
    ],
  }),
  showcase("most-traded", {
    title: "Where the day's money actually went",
    badge: "BY TURNOVER",
    palette: "sand",
    href: "/dashboard/most-traded",
    columns: ["Stock", "Turnover", "Share"],
    rows: [
      { left: "RELIANCE", middle: "₹1,284 Cr", right: "6.2%", symbol: "RELIANCE" },
      { left: "HDFCBANK", middle: "₹982 Cr", right: "4.7%", symbol: "HDFCBANK" },
      { left: "ICICIBANK", middle: "₹864 Cr", right: "4.1%", symbol: "ICICIBANK" },
    ],
    points: [
      "Ranked by rupees traded, not by how far the price moved.",
      "Share of the day's total, so size is in proportion.",
      "The read on why the money went there.",
    ],
  }),
  showcase("mtf", {
    title: "What you can hold on margin, and the cost",
    badge: "MARGIN ELIGIBLE",
    palette: "sky",
    href: "/dashboard/mtf-watch",
    columns: ["Stock", "Margin", "Funding cost"],
    rows: [
      { left: "SBIN", middle: "4×", right: "14.9% p.a.", symbol: "SBIN" },
      { left: "TATASTEEL", middle: "4×", right: "14.9% p.a.", symbol: "TATASTEEL" },
      { left: "AXISBANK", middle: "3×", right: "15.4% p.a.", symbol: "AXISBANK" },
    ],
    points: [
      "Only the names that are actually MTF-eligible.",
      "The funding cost stated up front, beside the leverage.",
      "Cross-referenced with turnover, so leverage meets liquidity.",
    ],
  }),
  showcase("stock-news", {
    title: "Today's corporate filings, grouped and read",
    badge: "FILED TODAY",
    palette: "lilac",
    href: "/dashboard/stocks-in-news",
    columns: ["Filing", "Sector", "Filed"],
    rows: [
      { left: "Board meeting outcome", middle: "Banking", right: "09:12" },
      { left: "Order received", middle: "Capital goods", right: "10:40" },
      { left: "Buyback approved", middle: "Information technology", right: "14:05" },
    ],
    points: [
      "Every filing the exchange published today, grouped by sector.",
      "The ones that move a price separated from the ones that do not.",
      "Timestamped, so you can see what landed while the market was open.",
    ],
  }),
];

/** Everything the slider can show, for tests and for anything that wants the full catalogue. */
export const ALL_SHOWCASES: HeroShowcase[] = [...LIVE_SHOWCASES, ...FEATURE_SHOWCASES];

// ---------------------------------------------------------------------------
// Choosing today's set
// ---------------------------------------------------------------------------

/** Milliseconds in a day. */
const DAY_MS = 86_400_000;

/**
 * Whole days from 1970-01-01 to an IST date string, as a non-negative integer.
 *
 * The rotation index, and the only thing about the slider that changes on its own. A date this
 * cannot parse falls back to zero rather than producing `NaN`, which would index the pool with
 * `undefined` and empty the hero — a malformed date must cost the *rotation*, never the slider.
 */
export function dayNumber(day: string): number {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor(parsed / DAY_MS));
}

/**
 * `count` entries from `pool`, starting at a point that advances by `count` each day.
 *
 * Advancing by the window size rather than by one means consecutive days share no slides at all,
 * which is what "it changes every day" has to mean to be visible to somebody who comes back
 * tomorrow. Wrapping keeps every entry in circulation.
 */
export function windowFrom<T>(pool: readonly T[], day: number, count: number): T[] {
  if (pool.length === 0) return [];

  const take = Math.min(count, pool.length);
  const start = (day * take) % pool.length;

  return Array.from({ length: take }, (_, offset) => pool[(start + offset) % pool.length]);
}

/** How many slides the hero shows at once. */
export const SLIDE_COUNT = 4;

/**
 * Today's slides: one live scene, then three feature showcases.
 *
 * The live scene leads because it is the one carrying real figures, and a reader who looks at
 * exactly one slide should be looking at that one.
 */
export function rotationFor(day: string, count: number = SLIDE_COUNT): HeroShowcase[] {
  const index = dayNumber(day);
  const live = windowFrom(LIVE_SHOWCASES, index, 1);
  const features = windowFrom(FEATURE_SHOWCASES, index, Math.max(0, count - live.length));

  return [...live, ...features];
}
