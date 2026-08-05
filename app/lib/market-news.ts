import { indianStocks } from "./indian-stocks";

export type Sentiment = "Positive" | "Negative" | "Neutral";

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: Sentiment;
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
const MARKET_QUERY = '(nifty OR sensex OR "Indian stock market" OR NSE OR BSE) when:2d';
const ITEM_LIMIT = 12;
const CACHE_TTL_MS = 10 * 60_000;

const cache = new Map<string, { data: NewsFeed; expiresAt: number }>();

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

function parseFeed(xml: string): NewsItem[] {
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);

  return blocks
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
      };
    })
    .filter((item) => item.title && item.url)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, ITEM_LIMIT);
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

function queryFor(symbol: string | null): { scope: string; query: string } {
  if (!symbol) return { scope: "Indian markets", query: MARKET_QUERY };

  const stock = indianStocks.find((item) => item.symbol === symbol);
  const name = stock?.name ?? symbol;
  return { scope: name, query: `"${name}" (share OR stock OR results OR NSE) when:7d` };
}

export async function getMarketNews(symbolInput?: string | null): Promise<NewsFeed> {
  const symbol = symbolInput ? symbolInput.trim().toUpperCase() : null;
  const { scope, query } = queryFor(symbol);
  const cacheKey = symbol ?? "__market__";

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  let items: NewsItem[] = [];
  try {
    const response = await fetch(feedUrl(query), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (response.ok) items = parseFeed(await response.text());
  } catch {
    items = [];
  }

  const aiSentiments = items.length > 0 ? await classifyWithAi(items) : null;
  const classified = items.map((item, index) => ({
    ...item,
    sentiment: aiSentiments ? aiSentiments[index] : classifySentiment(`${item.title} ${item.summary}`),
  }));

  const feed: NewsFeed = {
    scope,
    items: classified,
    fetchedAt: new Date().toISOString(),
    source: "google-news",
    classifier: aiSentiments ? "ai" : "heuristic",
  };

  // An empty feed is retried sooner so a transient upstream failure doesn't leave the panel
  // blank for the full cache window.
  cache.set(cacheKey, { data: feed, expiresAt: Date.now() + (classified.length > 0 ? CACHE_TTL_MS : 30_000) });
  return feed;
}
