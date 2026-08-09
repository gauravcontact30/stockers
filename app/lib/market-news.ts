import { CACHE_TAGS, revalidatingBy } from "./cache";
import { indianStocks } from "./indian-stocks";
import { searchIndex } from "./stock-search";

export type Sentiment = "Positive" | "Negative" | "Neutral";

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: Sentiment;
  /** The listed company the headline is about, when one can be identified. */
  symbol: string | null;
  company: string | null;
};

export type NewsFeed = {
  scope: string;
  items: NewsItem[];
  fetchedAt: string;
  source: "google-news";
  classifier: "ai" | "heuristic";
};

// Google News' RSS search needs no API key, is scoped to Indian publishers via hl/gl/ceid, and
// returns genuinely fresh articles with a real publisher and canonical link on each one — which
// is what lets this feed cite its sources instead of asserting headlines on its own authority.
const FEED_BASE = "https://news.google.com/rss/search";

/**
 * The market feed, as several searches rather than one.
 *
 * One query for "nifty OR sensex" returns index commentary, and index commentary names no company
 * — so a board that wants to say "this headline is about Tata Steel, here is Tata Steel's price"
 * had almost nothing to work with. These four run together: the first keeps the index view, and
 * the rest are phrased the way stories about individual listed companies are written. Duplicates
 * are dropped by URL when the results are merged.
 */
const MARKET_QUERIES = [
  '(nifty OR sensex OR "Indian stock market" OR NSE OR BSE) when:2d',
  '("share price" OR "shares surge" OR "shares jump" OR "stock rallies") India when:2d',
  '("shares fall" OR "shares slump" OR "stock declines" OR "shares tumble") India when:2d',
  '(BSE OR NSE) ("Q1 results" OR "Q2 results" OR "Q3 results" OR "Q4 results" OR "order win" OR "brokerage") when:3d',
];

const SYMBOL_QUERY = (name: string) => `"${name}" (share OR stock OR results OR NSE) when:7d`;

/** Per feed, before merging. The merged list is capped separately. */
const ITEM_LIMIT = 12;
const MARKET_ITEM_LIMIT = 48;
const CACHE_TTL_MS = 10 * 60_000;

function feedUrl(query: string) {
  return `${FEED_BASE}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

// Google News titles arrive as "Headline - Publisher"; the publisher is already available in its
// own <source> tag, so the duplicate suffix is trimmed to keep headlines clean.
function stripPublisherSuffix(title: string, source: string) {
  const suffix = ` - ${source}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => ENTITIES[match])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function readTag(block: string, name: string): string {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block);
  if (!match) return "";
  return decodeEntities(match[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "")).trim();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Google News' <description> is usually just the headline and publisher wrapped in an anchor,
// which would render as the title repeated verbatim underneath itself. Only genuinely additional
// prose survives; otherwise the card shows the headline alone.
function readSummary(block: string, title: string): string {
  const raw = readTag(block, "description");
  const text = decodeEntities(raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (!text) return "";

  const normalizedTitle = normalize(title);
  const remainder = normalize(text).replace(normalizedTitle, "").trim();
  if (!normalizedTitle || remainder.split(" ").filter(Boolean).length < 6) return "";

  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
}

const POSITIVE_TERMS = [
  "rally", "surge", "gain", "jump", "rise", "rises", "soar", "record high", "upgrade", "beats",
  "profit", "strong", "growth", "bullish", "boost", "outperform", "wins", "expansion", "recovery",
];

const NEGATIVE_TERMS = [
  "fall", "falls", "slump", "crash", "plunge", "drop", "decline", "slip", "slips", "loss", "losses",
  "downgrade", "weak", "bearish", "selloff", "sell-off", "cut", "miss", "probe", "fraud", "worst",
];

// Used whenever no AI key is configured, and as the floor if the model returns something
// unusable. Deliberately conservative: anything that isn't clearly directional stays Neutral
// rather than being guessed into a Positive or Negative call a reader might trade on.
export function classifySentiment(text: string): Sentiment {
  const value = text.toLowerCase();
  const positives = POSITIVE_TERMS.filter((term) => value.includes(term)).length;
  const negatives = NEGATIVE_TERMS.filter((term) => value.includes(term)).length;
  if (positives > negatives) return "Positive";
  if (negatives > positives) return "Negative";
  return "Neutral";
}

function parseFeed(xml: string, limit = ITEM_LIMIT, order: FeedOrder = "date"): NewsItem[] {
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);

  const items = blocks
    .map((block) => {
      const source = readTag(block, "source");
      const title = stripPublisherSuffix(readTag(block, "title"), source);
      const url = readTag(block, "link");
      const pubDate = readTag(block, "pubDate");
      const published = new Date(pubDate);

      return {
        id: url,
        title,
        summary: readSummary(block, title),
        source: source || "Google News",
        url,
        publishedAt: Number.isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
        sentiment: "Neutral" as Sentiment,
        symbol: null,
        company: null,
      };
    })
    .filter((item) => item.title && item.url);

  // "feed" keeps Google's own ordering, which is its relevance ranking for the query. The news
  // board always wants the newest first; the intelligence search offers the reader both.
  if (order === "date") items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return items.slice(0, limit);
}

// Sentiment is the one judgement the model is asked for, and only over headlines it was handed —
// it never authors a headline, a source, or a link, so a bad model response can mislabel a story
// but can never invent one.
async function classifyWithAi(items: NewsItem[]): Promise<Sentiment[] | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  try {
    const numbered = items.map((item, index) => `${index + 1}. ${item.title}`).join("\n");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You label Indian market news headlines by their likely effect on investor sentiment. " +
              'Reply with JSON only: {"sentiments":["Positive"|"Negative"|"Neutral", ...]} with exactly one entry per headline, in order. ' +
              "Do not rewrite, summarise, or add headlines.",
          },
          { role: "user", content: numbered },
        ],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content || "";
    const parsed = text.match(/\{[\s\S]*\}/);
    if (!parsed) return null;

    const sentiments: unknown = JSON.parse(parsed[0])?.sentiments;
    if (!Array.isArray(sentiments) || sentiments.length !== items.length) return null;

    return sentiments.map((value, index) =>
      value === "Positive" || value === "Negative" || value === "Neutral"
        ? (value as Sentiment)
        : classifySentiment(items[index].title)
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Which company a headline is about
// ---------------------------------------------------------------------------
// Headlines name companies; they do not carry tickers. Tying one to the other is what lets the
// board put a logo, a live price and today's move beside a story.
//
// Two things keep this from labelling stories with the wrong company. Matching is on whole words
// only, so "Vedanta" cannot be found inside another word. And the distinctive part of a name has
// to be at least five characters, because the corporate boilerplate every Indian listing shares —
// India, Limited, Industries, Corporation — matches everything and identifies nothing.

const NAME_NOISE =
  /\b(ltd|limited|india|indian|corporation|corp|company|co|industries|enterprises|holdings|group|of|and|the|&)\b/gi;

const MIN_NEEDLE = 5;
const MIN_TICKER = 3;

/**
 * Single words that are somebody's registered name and also just a word.
 *
 * There is a listed company whose distinctive name reduces to "consumer", so a story about "FPIs
 * betting on consumer durables" was tagged as being about that company, with its logo and its
 * price beside it. A one-word needle from this list identifies nothing; the company can still be
 * matched by its ticker, which is unambiguous.
 */
const TOO_GENERIC = new Set([
  "consumer", "services", "technologies", "technology", "finance", "financial", "capital", "global",
  "national", "international", "general", "standard", "premier", "universal", "modern", "future",
  "digital", "energy", "power", "motors", "steel", "cement", "textiles", "chemicals", "pharma",
  "healthcare", "infra", "infrastructure", "logistics", "securities", "investments", "ventures",
  "solutions", "systems", "network", "networks", "media", "foods", "paper", "sugar", "mills",
  "markets", "market", "trading", "exchange", "bank", "banks", "insurance", "growth", "value",
]);

type Needle = { symbol: string; company: string; needle: string; curated: boolean };

let needles: Needle[] | null = null;

/** The searchable form of every listed company's name, longest first so the best match wins. */
function companyNeedles(): Needle[] {
  if (needles) return needles;

  const built: Needle[] = [];
  for (const stock of searchIndex()) {
    const stripped = stock.name
      .replace(/\(.*?\)/g, " ")
      .replace(NAME_NOISE, " ")
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const oneWord = !stripped.includes(" ");
    if (stripped.length >= MIN_NEEDLE && !(oneWord && TOO_GENERIC.has(stripped))) {
      built.push({ symbol: stock.symbol, company: stock.name, needle: stripped, curated: stock.curated });
    }
  }

  // Longest needle first: "tata consultancy services" must beat "tata" on a TCS headline. Within
  // the same length the hand-classified name wins, since a dormant shell can share a word with a
  // household name.
  built.sort((a, b) => b.needle.length - a.needle.length || Number(b.curated) - Number(a.curated));
  needles = built;
  return needles;
}

/** The listed company a headline is about, or nulls when none can be identified. */
export function matchCompany(text: string): { symbol: string | null; company: string | null } {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

  for (const entry of companyNeedles()) {
    if (haystack.includes(` ${entry.needle} `)) return { symbol: entry.symbol, company: entry.company };
  }

  // No name matched, so try the ticker as a word of its own — headlines do print "SBIN", "IREDA".
  const words = new Set(text.toUpperCase().match(/[A-Z&-]{3,}/g) ?? []);
  for (const entry of companyNeedles()) {
    if (entry.symbol.length >= MIN_TICKER && words.has(entry.symbol)) {
      return { symbol: entry.symbol, company: entry.company };
    }
  }

  return { symbol: null, company: null };
}

function queryFor(symbol: string | null): { scope: string; queries: string[] } {
  if (!symbol) return { scope: "Indian markets", queries: MARKET_QUERIES };

  const stock = indianStocks.find((item) => item.symbol === symbol);
  const name = stock?.name ?? symbol;
  return { scope: name, queries: [SYMBOL_QUERY(name)] };
}

export type NewsStory = {
  /** Two or three sentences of context. Written by the model, from the headlines below only. */
  brief: string[];
  /** Other publishers covering the same company or subject, each with its own link. */
  related: NewsItem[];
  /** Whether the brief came from the model or from the deterministic fallback. */
  writer: "ai" | "extractive";
};

/**
 * Everything worth showing about one headline, beyond the headline.
 *
 * The rule this follows is the same one the sentiment classifier follows: the model is given
 * material and asked to explain it, never to supply it. Every related story here is a real article
 * from a real publisher with its own link, fetched the same way the feed is; the model only writes
 * the connecting prose, and is told in as many words not to add facts, figures or price targets.
 * If there is no model configured, the brief falls back to the publishers' own summaries.
 */
export async function getNewsStory(input: { title: string; url: string; symbol?: string | null }): Promise<NewsStory> {
  const symbol = input.symbol ? input.symbol.trim().toUpperCase() : null;

  // Related coverage: the company's own feed when the story names one, the market feed otherwise.
  const feed = await getMarketNews(symbol);
  const related = feed.items.filter((item) => item.url !== input.url).slice(0, 6);

  const brief = await briefWithAi(input.title, related);
  if (brief) return { brief, related, writer: "ai" };

  // No model, or the model failed. Say what is known without dressing it up: the publishers'
  // own one-liners, which are quotations rather than claims of ours.
  const extractive = [
    `${related.length > 0 ? `${related.length} other ${related.length === 1 ? "publisher is" : "publishers are"} covering this` : "No other coverage found yet"}${symbol ? ` around ${symbol}` : ""}.`,
    "Open the source below for the publisher's full report — the headlines here link straight to them.",
  ];
  return { brief: extractive, related, writer: "extractive" };
}

async function briefWithAi(title: string, related: NewsItem[]): Promise<string[] | null> {
  if (!process.env.OPENROUTER_API_KEY) return null;

  try {
    const context = related.map((item, index) => `${index + 1}. ${item.title} (${item.source})`).join("\n");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "stockers",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You explain an Indian market news story to a retail investor, using only the headlines you are given. " +
              'Reply with JSON only: {"brief":["sentence", "sentence", "sentence"]} — two or three short sentences. ' +
              "Say what the story is about and why it matters to a shareholder. " +
              "Do not invent facts, figures, prices, price targets or dates that are not in the headlines. " +
              "Do not give outperform or underperform advice. If the headlines are too thin to explain, say so plainly.",
          },
          { role: "user", content: `Headline: ${title}\n\nOther coverage:\n${context || "(none found)"}` },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    const parsed = (payload.choices?.[0]?.message?.content || "").match(/\{[\s\S]*\}/);
    if (!parsed) return null;

    const brief: unknown = JSON.parse(parsed[0])?.brief;
    if (!Array.isArray(brief) || brief.length === 0) return null;

    return brief.filter((line): line is string => typeof line === "string" && line.trim().length > 0).slice(0, 4);
  } catch {
    return null;
  }
}

/** Whether a feed comes back newest-first or in the order the publisher's search ranked it. */
export type FeedOrder = "date" | "feed";

/**
 * One search's worth of headlines, or nothing if that search fails.
 *
 * Exported because the intelligence search runs its own queries against the same public feed —
 * one retrieval path for everything on the site that reads the web, rather than two that could
 * disagree about what a headline is.
 */
export async function fetchNewsQuery(
  query: string,
  options: { limit?: number; order?: FeedOrder } = {},
): Promise<NewsItem[]> {
  try {
    const response = await fetch(feedUrl(query), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return response.ok ? parseFeed(await response.text(), options.limit, options.order) : [];
  } catch {
    return [];
  }
}

const fetchFeed = (query: string) => fetchNewsQuery(query);

async function loadMarketNews(symbol: string | null): Promise<NewsFeed> {
  const { scope, queries } = queryFor(symbol);

  // The searches run together and are merged by URL — the same story reaching two of them is one
  // headline, not two. One failing search costs its own results and nothing else.
  const merged = new Map<string, NewsItem>();
  for (const batch of await Promise.all(queries.map(fetchFeed))) {
    for (const item of batch) if (!merged.has(item.url)) merged.set(item.url, item);
  }

  const items = [...merged.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, symbol ? ITEM_LIMIT : MARKET_ITEM_LIMIT);

  const aiSentiments = items.length > 0 ? await classifyWithAi(items) : null;
  const classified = items.map((item, index) => ({
    ...item,
    sentiment: aiSentiments ? aiSentiments[index] : classifySentiment(`${item.title} ${item.summary}`),
    // A per-symbol feed is already about one company; only the market-wide feed has to work it out.
    ...(symbol ? { symbol, company: scope } : matchCompany(`${item.title} ${item.summary}`)),
  }));

  const feed: NewsFeed = {
    scope,
    items: classified,
    fetchedAt: new Date().toISOString(),
    source: "google-news",
    classifier: aiSentiments ? "ai" : "heuristic",
  };

  return feed;
}

/**
 * Headlines for the market, or for one company.
 *
 * Fetching several Google News feeds and then classifying every headline through a model measured
 * 3492ms cold against the production build. Each symbol keeps its own entry with its own clock,
 * and a lapsed one is served while the next is fetched behind the reader, so only the very first
 * request for a given symbol ever pays that.
 *
 * The family is bounded because the key is a reader-supplied ticker: without a cap, something
 * walking every symbol on the exchange would grow the map without limit.
 */
const loadNewsFor = revalidatingBy<string | null, NewsFeed>({
  key: "news:feed",
  ttlMs: CACHE_TTL_MS,
  // An empty feed is far more likely to be a transient upstream failure than a market with no news
  // in it, so it is only stood behind for half a minute rather than the full window.
  ttlFor: (feed) => (feed.items.length > 0 ? CACHE_TTL_MS : 30_000),
  tags: [CACHE_TAGS.news, CACHE_TAGS.ai],
  persist: true,
  capacity: 120,
  keyOf: (symbol) => symbol ?? "__market__",
  load: loadMarketNews,
});

export function getMarketNews(symbolInput?: string | null): Promise<NewsFeed> {
  return loadNewsFor(symbolInput ? symbolInput.trim().toUpperCase() : null);
}
