// The intelligence search: an open question about a BSE-listed company, answered from the web.
//
// Every other AI surface in this app narrates figures the app itself measured. This one answers
// the question those boards can't — "what is actually going on with this company, and should I
// hold it" — and the material for that lives outside the exchange feeds, in what publishers wrote
// this week.
//
// The honesty contract is unchanged, and is the reason this is worth shipping at all:
//
//   * the company is resolved against the listed universe, so the profile beside an answer is a
//     real scrip with the exchange's own name, ticker and price on it — never a name the model
//     produced;
//   * the material is real articles from real publishers, fetched the same way the news board
//     fetches them, each keeping its own link;
//   * the model is given those headlines and asked to compress them into categorised points. It
//     is told, in as many words, to add nothing — and every point carries the index of the article
//     it came from, so a reader can check any line against its source;
//   * the outperform/hold/underperform call and every holding-period outlook are arithmetic over measured
//     returns and the tone of the fetched coverage (see ./stock-outlook). The model is shown the
//     call and forbidden from contradicting it; it never decides one;
//   * with no model configured the answer is the headlines themselves, categorised by keyword,
//     and the panel says so.
//
// A point the model can't attribute is still shown, marked as unsourced. That is deliberate: it
// is more honest than silently dropping it, and it lets a reader discount it.

import { HISTORY_PERIODS, getBaseline, overallReturn, periodReturn, type Baseline } from "./bse-history";
import { CACHE_TAGS, revalidatingBy } from "./cache";
import { getBseDirectory, getBseMovers } from "./bse-market";
import { categoryOf } from "./bse-sectors";
import { fetchNewsQuery, matchCompany, type NewsItem } from "./market-news";
import { findStock, searchStocks } from "./stock-search";
import { buildOutlook, type StockOutlook, type TrailingReturns } from "./stock-outlook";

// ---------------------------------------------------------------------------
// The query, and the filters over it
// ---------------------------------------------------------------------------

/** What the reader wants to know about the company, which decides what is searched for. */
export type IntelTopic =
  | "all"
  | "results"
  | "orders"
  | "brokerage"
  | "corporate-actions"
  | "regulatory"
  | "ownership";

/** How far back the search reaches. */
export type IntelWindow = "1d" | "3d" | "1w" | "1m" | "3m" | "1y";

/** Whether the newest coverage leads, or the coverage the search ranked highest. */
export type IntelSort = "relevance" | "recent";

export type IntelQuery = {
  query: string;
  topic: IntelTopic;
  window: IntelWindow;
  sort: IntelSort;
};

type TopicSpec = { label: string; terms: string; question: string; follow: string };

/**
 * Each filter as a search of its own.
 *
 * The terms are the words Indian business publishers actually print — "order win", "block deal",
 * "record date" — rather than the category name, which almost never appears in a headline. The
 * question is what the model is asked to answer under that filter, so the same company searched
 * two ways comes back with two genuinely different reads rather than the same paragraph retitled.
 * `follow` is that question phrased for the reader, and is what the follow-up chips offer.
 */
export const TOPIC_SPECS: Record<IntelTopic, TopicSpec> = {
  all: {
    label: "Everything",
    terms: "(share OR stock OR results OR company OR NSE OR BSE)",
    question: "What does an investor need to know about this company right now?",
    follow: "Everything on %s",
  },
  results: {
    label: "Results & earnings",
    terms: '(results OR earnings OR "net profit" OR revenue OR margin OR guidance OR quarterly)',
    question: "What do the latest results and earnings say about this company?",
    follow: "How were %s's latest results?",
  },
  orders: {
    label: "Orders & deals",
    terms: '("order win" OR contract OR deal OR acquisition OR merger OR capex OR expansion OR "new plant")',
    question: "What new business, orders or deals has this company won?",
    follow: "What has %s won lately?",
  },
  brokerage: {
    label: "Brokerage & targets",
    terms: '(brokerage OR analyst OR "target price" OR upgrade OR downgrade OR rating OR "buy call")',
    question: "What are brokerages and analysts saying about this stock?",
    follow: "What are brokerages saying on %s?",
  },
  "corporate-actions": {
    label: "Dividends & actions",
    terms: '(dividend OR bonus OR "stock split" OR buyback OR "record date" OR "rights issue")',
    question: "What corporate actions — dividends, bonuses, splits, buybacks — are pending or declared?",
    follow: "Any dividend or bonus from %s?",
  },
  regulatory: {
    label: "Regulatory & legal",
    terms: "(SEBI OR RBI OR regulator OR probe OR penalty OR court OR tribunal OR tax OR notice)",
    question: "What regulatory or legal developments affect this company?",
    follow: "Any regulatory action on %s?",
  },
  ownership: {
    label: "Promoters & holdings",
    terms: '(promoter OR stake OR "block deal" OR "bulk deal" OR shareholding OR pledge OR FII OR DII)',
    question: "Who is adding or selling this company, and what has changed in its shareholding?",
    follow: "Who is adding or selling %s?",
  },
};

/** Google News reads the window off the query itself, as `when:`. */
const WINDOW_SPECS: Record<IntelWindow, { label: string; when: string }> = {
  "1d": { label: "last 24 hours", when: "1d" },
  "3d": { label: "last 3 days", when: "3d" },
  "1w": { label: "last week", when: "7d" },
  "1m": { label: "last month", when: "1m" },
  "3m": { label: "last 3 months", when: "3m" },
  "1y": { label: "last year", when: "1y" },
};

export const DEFAULT_TOPIC: IntelTopic = "all";
export const DEFAULT_WINDOW: IntelWindow = "1w";
export const DEFAULT_SORT: IntelSort = "relevance";

// A search term arrives from the browser and is used to build a query against a public feed and,
// through that, a prompt. It is clamped rather than trusted: this is a stock lookup, not an open
// channel to a model.
const MAX_QUERY = 80;
const MAX_POINTS = 8;
const MIN_POINTS = 3;
const MAX_POINT_TEXT = 220;
const MAX_BADGE = 28;
const SOURCE_LIMIT = 12;

const isTopic = (value: unknown): value is IntelTopic => typeof value === "string" && value in TOPIC_SPECS;
const isWindow = (value: unknown): value is IntelWindow => typeof value === "string" && value in WINDOW_SPECS;
const isSort = (value: unknown): value is IntelSort => value === "relevance" || value === "recent";

/**
 * A search we are willing to run, or null when the payload isn't one.
 *
 * An unknown filter value falls back to that filter's default rather than rejecting the search —
 * a stale browser tab sending last week's topic key should still get an answer.
 */
export function parseIntelQuery(value: unknown): IntelQuery | null {
  const raw = value as Partial<IntelQuery> | null | undefined;
  const query = typeof raw?.query === "string" ? raw.query.trim().slice(0, MAX_QUERY) : "";
  if (!query) return null;

  return {
    query,
    topic: isTopic(raw?.topic) ? raw.topic : DEFAULT_TOPIC,
    window: isWindow(raw?.window) ? raw.window : DEFAULT_WINDOW,
    sort: isSort(raw?.sort) ? raw.sort : DEFAULT_SORT,
  };
}

// ---------------------------------------------------------------------------
// Which company the reader means
// ---------------------------------------------------------------------------

/**
 * The listed company an answer is about, as the exchange has it.
 *
 * Everything the Bhavcopy and the scrip master publish about one company is carried through rather
 * than a headline price alone: a reader checking whether the panel really is looking at their
 * scrip checks the ISIN and the code, and a reader sizing a position wants the session's range and
 * turnover, not a rounded figure. Every field here is the exchange's own, to its own precision.
 */
export type IntelStock = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string | null;
  /** BSE scrip code, when the exchange board could be reached. */
  code: string | null;
  /** The ISIN, which is the identifier that survives a ticker change. */
  isin: string | null;
  /** BSE's trading group — "A" is the most liquid, "T"/"Z" are surveillance buckets. */
  group: string | null;
  /** Rank by market capitalisation across the whole exchange, 1 = largest. */
  rank: number | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
  trades: number | null;
  marketCapCr: number | null;
  /** The session every price above is from. Stated so no figure is undated. */
  sessionDate: string | null;
};

type ResolvedStock = { symbol: string; name: string; sector: string; capTier: string };

/**
 * The company a free-text search is about.
 *
 * Three passes, narrowest first. An exact ticker is unambiguous and wins outright. Otherwise the
 * headline matcher is asked — it already knows how to find a company name inside a sentence, which
 * is what "latest news on tata motors ev plans" is. Only then does the catalogue search run, whose
 * best hit is a guess at what was meant rather than a certainty.
 */
export function resolveStock(query: string): ResolvedStock | null {
  const exact = findStock(query);
  if (exact) return exact;

  const matched = matchCompany(query);
  if (matched.symbol) {
    const hit = findStock(matched.symbol);
    if (hit) return hit;
  }

  const best = searchStocks(query).groups[0]?.stocks[0];
  return best ?? null;
}

/**
 * The exchange's own figures for a resolved company.
 *
 * Wrapped in a catch on purpose: the answer to the reader's question is the web coverage, and a
 * BSE feed that is slow or down should cost the price chip on the profile card, not the search.
 */
async function stockProfile(hit: ResolvedStock): Promise<IntelStock> {
  const base: IntelStock = {
    symbol: hit.symbol,
    name: hit.name,
    sector: hit.sector,
    capTier: hit.capTier,
    code: null,
    isin: null,
    group: null,
    rank: null,
    price: null,
    previousClose: null,
    change: null,
    changePercent: null,
    open: null,
    dayHigh: null,
    dayLow: null,
    volume: null,
    turnoverCr: null,
    trades: null,
    marketCapCr: null,
    sessionDate: null,
  };

  try {
    // The directory search matches name, ticker, code and ISIN, and sorts by market cap — so the
    // ticker is looked for by hand in the page rather than assuming the first row is the one.
    const directory = await getBseDirectory({ q: hit.symbol, pageSize: 10 });
    const row = directory.rows.find((entry) => entry.ticker.toUpperCase() === hit.symbol.toUpperCase());
    if (!row) return base;

    return {
      ...base,
      // The exchange's own classification wins over the catalogue's where it has one.
      sector: row.sector ?? base.sector,
      capTier: row.capTier ?? base.capTier,
      code: row.code,
      isin: row.isin || null,
      group: row.group || null,
      rank: row.rank,
      price: row.price,
      previousClose: row.previousClose,
      change: row.change,
      changePercent: row.changePercent,
      open: row.open,
      dayHigh: row.dayHigh,
      dayLow: row.dayLow,
      volume: row.volume,
      turnoverCr: row.turnoverCr,
      trades: row.trades,
      marketCapCr: row.marketCapCr,
      sessionDate: directory.sessionDate,
    };
  } catch {
    return base;
  }
}

/**
 * Every window the exchange archive can measure this scrip over.
 *
 * One Bhavcopy per period answers the whole exchange and is cached for half a day, so this costs
 * a map lookup per window once any board has warmed them. A period whose file can't be reached is
 * left null rather than filled in — the outlook then says it has no reading for that window.
 */
async function measuredReturns(
  code: string | null,
  price: number | null,
): Promise<{ returns: TrailingReturns; from: Record<string, string | null> }> {
  if (!code || price === null) return { returns: {}, from: {} };

  try {
    const baselines = await Promise.all(HISTORY_PERIODS.map((period) => getBaseline(period)));

    // Which session each window is measured against. A return with no baseline date behind it is
    // a number a reader cannot check, and this panel does not print those.
    const from: Record<string, string | null> = {};
    HISTORY_PERIODS.forEach((period, index) => {
      from[period] = baselines[index].date;
    });

    return { returns: returnsFrom(code, price, baselines), from };
  } catch {
    return { returns: {}, from: {} };
  }
}

/** Every window at once for one scrip, from baselines already in hand. */
function returnsFrom(code: string, price: number, baselines: Baseline[]): TrailingReturns {
  const returns: TrailingReturns = {};
  HISTORY_PERIODS.forEach((period, index) => {
    returns[period] = periodReturn(code, price, baselines[index]);
  });
  return returns;
}

// ---------------------------------------------------------------------------
// The company's own category, ranked
// ---------------------------------------------------------------------------

/** One peer of the searched company, measured over every window the archive reaches. */
export type PeerRow = {
  symbol: string;
  name: string;
  code: string;
  capTier: string | null;
  category: string;
  price: number | null;
  changePercent: number | null;
  /** Keyed by period — 1w, 1m, 3m, 6m, 1y, 3y, 5y — plus `overall`. Null where history runs out. */
  returns: Record<string, number | null>;
};

export type IntelPeers = {
  /** The BSE category the ranking was run inside. */
  category: string;
  /** Ranked by one-year return: the twenty that compounded hardest. */
  leaders: PeerRow[];
  /** The same ranking from the other end — the twenty that destroyed the most value. */
  laggards: PeerRow[];
};

/** Twenty a side: enough for a reader to page through a category rather than glance at a top five. */
const PEER_COUNT = 20;
/** One extra of each, so dropping the searched company itself still leaves a full twenty. */
const PEER_FETCH = PEER_COUNT + 1;
/** The window the two lists are ranked by; a year is long enough to mean something, short enough
 *  to still describe the company as it is now. */
const PEER_PERIOD = "1y";

/**
 * The best and worst of the searched company's own category.
 *
 * "Is this a good stock" is half a question — the other half is "compared to what", and the honest
 * comparison is the rest of its category rather than the whole exchange, where a pharma name is
 * being ranked against a shipyard.
 *
 * Both lists are measured, not judged: the exchange's closes a year ago against the closes now.
 * Naming one set "to buy" and the other "to avoid" is the app's framing of that ranking, and the
 * panel says as much underneath them.
 */
async function peersFor(stock: IntelStock): Promise<IntelPeers | null> {
  if (!stock.code) return null;

  const category = categoryOf(stock.code);
  if (!category) return null;

  try {
    const [gainers, losers, baselines] = await Promise.all([
      getBseMovers({ category, direction: "gainers", period: PEER_PERIOD, pageSize: PEER_FETCH }),
      getBseMovers({ category, direction: "losers", period: PEER_PERIOD, pageSize: PEER_FETCH }),
      Promise.all(HISTORY_PERIODS.map((period) => getBaseline(period))),
    ]);

    const toPeer = (row: (typeof gainers.rows)[number]): PeerRow => ({
      symbol: row.ticker,
      name: row.name,
      code: row.code,
      capTier: row.capTier,
      category: row.sector ?? category,
      price: row.price,
      changePercent: row.changePercent,
      returns: {
        ...(row.price === null ? {} : returnsFrom(row.code, row.price, baselines)),
        overall: row.price === null ? null : overallReturn(row.code, row.price, baselines),
      },
    });

    // The searched company is not a peer of itself, and would otherwise take one of the five
    // places on whichever end of its own category it sits.
    const without = (rows: typeof gainers.rows) =>
      rows.filter((row) => row.code !== stock.code).slice(0, PEER_COUNT).map(toPeer);

    const leaders = without(gainers.rows);
    const laggards = without(losers.rows);
    if (leaders.length === 0 && laggards.length === 0) return null;

    return { category, leaders, laggards };
  } catch {
    // Peers are context around the answer, never the answer — a slow exchange feed costs the two
    // boards and nothing else.
    return null;
  }
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/** What a point is about, which is what the cards on screen are grouped and tinted by. */
export type IntelCategory =
  | "results"
  | "orders"
  | "brokerage"
  | "actions"
  | "regulatory"
  | "ownership"
  | "price"
  | "other";

export type IntelImpact = "positive" | "negative" | "neutral";

export type IntelPoint = {
  text: string;
  /** 1-based index into `sources`, or null when the point isn't traceable to one article. */
  source: number | null;
  category: IntelCategory;
  impact: IntelImpact;
  /** Two or three words for the badge on the point — "₹2,000 Cr order", "target raised". */
  badge: string;
};

/** One card on screen: everything the search found about one aspect of the company. */
export type IntelGroup = {
  category: IntelCategory;
  label: string;
  points: IntelPoint[];
  /** True for the card holding the single most important finding — it gets the star ribbon. */
  star: boolean;
};

export type IntelSource = {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
};

/** A question worth asking next, already wired to the filters that would answer it. */
export type IntelFollowUp = { label: string; topic: IntelTopic; window: IntelWindow };

export type IntelAnswer = {
  query: IntelQuery;
  /** Null when nothing in the query names a listed company. */
  stock: IntelStock | null;
  /** What the search was read as, in words — shown above the points. */
  subject: string;
  headline: string;
  points: IntelPoint[];
  groups: IntelGroup[];
  sources: IntelSource[];
  /** Null when the company couldn't be priced, so nothing could be measured. */
  outlook: StockOutlook | null;
  /** The session each measured window is counted from, keyed by period. */
  measuredFrom: Record<string, string | null>;
  /** The best and worst of the same BSE category. Null when the company isn't classified yet. */
  peers: IntelPeers | null;
  followUps: IntelFollowUp[];
  writer: "ai" | "extractive";
  fetchedAt: string;
};

export const CATEGORY_LABELS: Record<IntelCategory, string> = {
  results: "Results & earnings",
  orders: "Orders & deals",
  brokerage: "Brokerage & targets",
  actions: "Dividends & actions",
  regulatory: "Regulatory & legal",
  ownership: "Promoters & holdings",
  price: "Price & market action",
  other: "Other developments",
};

/** The feed query behind one search: the company (or the raw words), the topic, and the window. */
export function buildFeedQuery(intel: IntelQuery, companyName: string | null): string {
  const subject = companyName ? `"${companyName}"` : intel.query;
  const { terms } = TOPIC_SPECS[intel.topic];
  const { when } = WINDOW_SPECS[intel.window];

  // Unresolved searches carry "India" so a generic phrase can't drift onto another market.
  const scope = companyName ? "" : " India";
  return `${subject}${scope} ${terms} when:${when}`;
}

function toSource(item: NewsItem): IntelSource {
  return { title: item.title, publisher: item.source, url: item.url, publishedAt: item.publishedAt };
}

// The words that put a headline in a category, checked in this order — a headline about a dividend
// declared alongside results belongs under results, which is the bigger news of the two.
const CATEGORY_TERMS: { category: IntelCategory; terms: string[] }[] = [
  { category: "results", terms: ["result", "earning", "profit", "revenue", "margin", "quarter", "guidance", "ebitda"] },
  { category: "orders", terms: ["order", "contract", "deal", "acquisition", "merger", "capex", "expansion", "plant", "launch"] },
  { category: "brokerage", terms: ["brokerage", "analyst", "target", "upgrade", "downgrade", "rating", "buy call", "outperform"] },
  { category: "actions", terms: ["dividend", "bonus", "split", "buyback", "record date", "rights issue"] },
  { category: "regulatory", terms: ["sebi", "rbi", "regulat", "probe", "penalty", "court", "tribunal", "tax", "notice", "fine"] },
  { category: "ownership", terms: ["promoter", "stake", "block deal", "bulk deal", "shareholding", "pledge", "fii", "dii"] },
  { category: "price", terms: ["share price", "stock rall", "shares surge", "shares fall", "hits", "high", "low", "%"] },
];

/** Which card a headline belongs on, when there is no model to decide. */
export function categorise(text: string): IntelCategory {
  const value = text.toLowerCase();
  for (const { category, terms } of CATEGORY_TERMS) {
    if (terms.some((term) => value.includes(term))) return category;
  }
  return "other";
}

const isCategory = (value: unknown): value is IntelCategory =>
  typeof value === "string" && value in CATEGORY_LABELS;

const isImpact = (value: unknown): value is IntelImpact =>
  value === "positive" || value === "negative" || value === "neutral";

/**
 * The points as cards: one per category, in the order the points came in.
 *
 * The star goes to whichever card holds the first point, because the points arrive ranked by what
 * matters most — so the ribbon marks the finding the reader should read first rather than a
 * category we decided in advance was the important one.
 */
export function groupPoints(points: IntelPoint[]): IntelGroup[] {
  const groups: IntelGroup[] = [];

  for (const point of points) {
    const existing = groups.find((group) => group.category === point.category);
    if (existing) existing.points.push(point);
    else groups.push({ category: point.category, label: CATEGORY_LABELS[point.category], points: [point], star: false });
  }

  if (groups.length > 0) groups[0].star = true;
  return groups;
}

/**
 * The questions to offer next.
 *
 * Every topic except the one already open, phrased for the company by name, plus a wider window
 * when the search is on a short one — which is the follow-up a reader asks most often after a
 * thin day's coverage.
 */
export function followUpsFor(intel: IntelQuery, subject: string): IntelFollowUp[] {
  const follows: IntelFollowUp[] = (Object.keys(TOPIC_SPECS) as IntelTopic[])
    .filter((topic) => topic !== intel.topic && topic !== "all")
    .map((topic) => ({
      label: TOPIC_SPECS[topic].follow.replace("%s", subject),
      topic,
      window: intel.window,
    }));

  const wider: IntelWindow[] = ["1d", "3d", "1w"];
  if (wider.includes(intel.window)) {
    follows.unshift({ label: `Widen ${subject} to a full year`, topic: intel.topic, window: "1y" });
  }

  return follows.slice(0, 6);
}

const SYSTEM_PROMPT = [
  "You are stockers, an AI market analyst answering an Indian investor's question about one BSE-listed company.",
  "You are given the question, the company's measured returns, the outperform/hold/underperform call already computed from them,",
  "and a numbered list of real headlines from Indian publishers.",
  "Answer only from that material. Never invent a figure, a date, a target price, a deal or a company.",
  "Never contradict the computed call or restate a measured return as anything other than the number given.",
  "Write a headline of at most twelve words, then three to eight points, most important first.",
  "Each point is one short factual sentence — what happened and what it means for a shareholder. No filler, no advice.",
  "Give every point: the number of the headline it came from as \"source\" (null only if no single headline supports it),",
  'a "category" from results|orders|brokerage|actions|regulatory|ownership|price|other,',
  'an "impact" of positive|negative|neutral for a shareholder, and a "badge" of at most three words naming the fact.',
  'Return JSON only: {"headline":"...","points":[{"text":"...","source":1,"category":"orders","impact":"positive","badge":"₹2,000 Cr order"}]}',
].join(" ");

function clip(value: unknown, limit = MAX_POINT_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function measuredLine(returns: TrailingReturns): string {
  const entries = Object.entries(returns).filter(([, value]) => typeof value === "number");
  if (entries.length === 0) return "No measured price history available for this scrip.";
  return entries.map(([period, value]) => `${period.toUpperCase()} ${(value as number).toFixed(1)}%`).join(", ");
}

async function answerWithAi(
  question: string,
  subject: string,
  items: NewsItem[],
  outlook: StockOutlook | null,
): Promise<{ headline: string; points: IntelPoint[] } | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  const numbered = items
    .map((item, index) => `${index + 1}. ${item.title} (${item.source}, ${item.publishedAt.slice(0, 10)})`)
    .join("\n");

  const measured = outlook
    ? `Computed call: ${outlook.stance === "Buy" ? "Outperform" : outlook.stance} (conviction ${outlook.conviction}/100). Measured returns: ${measuredLine(outlook.measured)}.`
    : "No measured returns are available for this company.";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers-intel-search",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Company: ${subject}\nQuestion: ${question}\n${measured}\n\nHeadlines:\n${numbered}`,
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`OpenRouter responded with ${response.status}`);

    const payload = await response.json();
    const match = (payload.choices?.[0]?.message?.content || "").match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { headline?: unknown; points?: unknown };
    const headline = clip(parsed.headline, 120);

    const points = (Array.isArray(parsed.points) ? parsed.points : [])
      .map((point) => {
        const entry = point as { text?: unknown; source?: unknown; category?: unknown; impact?: unknown; badge?: unknown };
        const text = clip(entry?.text);
        // A citation is only kept when it names a headline that was actually supplied — a model
        // that cites article 9 out of six is corrected to "unsourced", not believed.
        const source = Number(entry?.source);
        const cited = Number.isInteger(source) && source >= 1 && source <= items.length ? source : null;

        return {
          text,
          source: cited,
          // An unrecognised category is worked out from the point's own words rather than dumped
          // into "other", so a card is only ever "Other developments" when it really is.
          category: isCategory(entry?.category) ? entry.category : categorise(text),
          impact: isImpact(entry?.impact) ? entry.impact : "neutral",
          badge: clip(entry?.badge, MAX_BADGE),
        };
      })
      .filter((point) => point.text.length > 0)
      .slice(0, MAX_POINTS);

    if (!headline || points.length === 0) return null;

    return { headline, points };
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * The answer when there is no model: the coverage itself.
 *
 * Every point is one publisher's own headline, categorised by its words and attributed to it. That
 * is not as useful as a synthesis, but it is never wrong — and a reader can see at a glance that
 * nothing was written for them, because each line reads like the headline it is.
 */
export function composeAnswer(
  subject: string,
  items: NewsItem[],
  windowLabel: string,
): { headline: string; points: IntelPoint[] } {
  if (items.length === 0) {
    return {
      headline: `No coverage of ${subject} in the ${windowLabel}`,
      points: [
        {
          text: `No Indian publisher covered ${subject} under this filter in the ${windowLabel}.`,
          source: null,
          category: "other",
          impact: "neutral",
          badge: "no coverage",
        },
        {
          text: "Widen the time window, or switch the topic filter to Everything.",
          source: null,
          category: "other",
          impact: "neutral",
          badge: "try again",
        },
      ],
    };
  }

  return {
    headline: `${items.length} ${items.length === 1 ? "report" : "reports"} on ${subject} in the ${windowLabel}`,
    points: items.slice(0, MAX_POINTS).map((item, index) => ({
      text: `${item.title} — ${item.source}.`,
      source: index + 1,
      category: categorise(item.title),
      impact: "neutral" as IntelImpact,
      badge: item.source.slice(0, MAX_BADGE),
    })),
  };
}

// One company, one topic and one window is the same answer for everyone who asks it, and the
// coverage behind it changes on the scale of hours — so re-asking the model per reader would only
// spend money.
const ANSWER_TTL_MS = 10 * 60_000;
function cacheKey(intel: IntelQuery): string {
  return `${intel.query.toLowerCase()}|${intel.topic}|${intel.window}|${intel.sort}`;
}

async function loadIntel(intel: IntelQuery): Promise<IntelAnswer> {
  const resolved = resolveStock(intel.query);
  const subject = resolved?.name ?? intel.query;

  // The coverage and the company's own figures are independent of each other, so neither waits.
  const [items, stock] = await Promise.all([
    fetchNewsQuery(buildFeedQuery(intel, resolved?.name ?? null), {
      limit: SOURCE_LIMIT,
      order: intel.sort === "recent" ? "date" : "feed",
    }),
    resolved ? stockProfile(resolved) : Promise.resolve(null),
  ]);

  // The company's own history and its category's ranking both read the same cached baselines, so
  // the second costs little once the first has warmed them.
  const [measured, peers] = await Promise.all([
    stock
      ? measuredReturns(stock.code, stock.price)
      : Promise.resolve({ returns: {} as TrailingReturns, from: {} as Record<string, string | null> }),
    stock ? peersFor(stock) : Promise.resolve(null),
  ]);

  const outlook =
    Object.keys(measured.returns).length > 0
      ? buildOutlook(measured.returns, items.map((item) => item.title))
      : null;

  const spec = TOPIC_SPECS[intel.topic];
  const question = resolved ? spec.question : `${spec.question} (search: ${intel.query})`;

  // The model only runs when there is enough coverage for a synthesis to be worth more than the
  // headlines themselves. Below that, the headlines *are* the honest answer.
  const written = items.length >= MIN_POINTS ? await answerWithAi(question, subject, items, outlook) : null;
  const answer = written ?? composeAnswer(subject, items, WINDOW_SPECS[intel.window].label);

  const value: IntelAnswer = {
    query: intel,
    stock,
    subject,
    headline: answer.headline,
    points: answer.points,
    groups: groupPoints(answer.points),
    sources: items.map(toSource),
    outlook,
    measuredFrom: measured.from,
    peers,
    followUps: followUpsFor(intel, subject),
    writer: written ? "ai" : "extractive",
    fetchedAt: new Date().toISOString(),
  };

  return value;
}

/**
 * Everything an intelligence search returns: the company, the call, the answer and its sources.
 *
 * A search costs a news fetch, a set of Bhavcopy baselines and a model call. One company, one topic
 * and one window is the same answer for everyone who asks it, so it is cached per question — and
 * because the answer is served while the next is fetched behind the reader, the second person to
 * ask a popular question gets it back immediately rather than waiting out the model again.
 */
export const searchIntel = revalidatingBy<IntelQuery, IntelAnswer>({
  key: "intel:answer",
  ttlMs: ANSWER_TTL_MS,
  // An empty search is retried sooner: an upstream hiccup shouldn't leave "no coverage" on screen
  // for the full window.
  ttlFor: (answer) => (answer.sources.length > 0 ? ANSWER_TTL_MS : 60_000),
  tags: [CACHE_TAGS.ai, CACHE_TAGS.news],
  persist: true,
  keyOf: cacheKey,
  load: loadIntel,
});
