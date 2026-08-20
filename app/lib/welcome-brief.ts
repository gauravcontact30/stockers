import "server-only";

// What a visitor is shown five seconds after they arrive.
//
// Two things, and the order matters. First the stocks worth *exploring* — the best six-month
// performers on the tracked catalogue that are currently trading within a couple of percent of
// their lowest price of the past week. Then a single tip about the BSE, written by the model
// against today's session, so it reads as advice about this morning rather than as a leaflet.
//
// ---------------------------------------------------------------------------
// A pool, not a pair
// ---------------------------------------------------------------------------
//
// The dialog names two stocks, but this sends every name that cleared the screen. The greeting
// opens on every visit now, and a reader who comes back after lunch to the same two names is a
// greeting that has stopped saying anything — so the brief carries the whole qualified set and the
// visit draws its own pair from it, skipping the pair it drew last time. The screen stays the thing
// that decides *which* stocks are eligible; only which two of them are shown is left to the arrival.
//
// That is also why the tip never names a stock: the pair on screen is chosen in the browser, after
// this brief was written, so a tip that referred to "the two above" would be referring to two names
// it never saw.
//
// ---------------------------------------------------------------------------
// The screen, and why it is an intersection
// ---------------------------------------------------------------------------
//
// Neither half is interesting on its own. A stock that has compounded for six months but sits at
// the top of its week is not cheap; a stock at the bottom of its week that has gone nowhere for
// six months is not a performer, it is a faller. The intersection — has been working, and is
// currently at the bottom of its recent range — is the one thing worth putting in front of
// somebody who has never been here before, and it is entirely measured: the six-month figure comes
// from the daily returns cache every board on this site is ranked from, and the week's low is the
// lowest price the company itself has traded at over the last five sessions — not an estimate, and
// not a comparison against anybody else.
//
// ---------------------------------------------------------------------------
// Why this is one cached brief rather than a request per visitor
// ---------------------------------------------------------------------------
//
// It fires for everybody who arrives, and it fires five seconds in — while the landing page is still settling. A model call
// and twenty-five price histories per arrival would be the most expensive thing on the site and
// would say very nearly the same thing every time, because the inputs change once a session. So
// the whole brief is built once, held for half an hour, and served from memory to everyone who
// arrives inside that window.
//
// The tip has a written fallback underneath it. A deployment with no `OPENROUTER_API_KEY`, or a
// model that times out, still greets its visitor properly — with a tip that is general rather than
// about today, which is a smaller loss than an empty panel or no welcome at all.

import { CACHE_TAGS, revalidating } from "./cache";
import { getReturnsForPeriod } from "./historical-returns";
import { indianStocks } from "./indian-stocks";
import { mapWithConcurrency, type QuoteSubject } from "./market-data";
import { marketSessionState, tradingDayKey, type MarketSessionState } from "./market-session";
import { aiModel, chatJson, extractJsonObject } from "./openrouter";

/** How many stocks one visit is shown. Two: enough to be a suggestion, few enough to be read. */
export const WELCOME_PICK_COUNT = 2;

/**
 * How many qualified names the brief carries for the browser to draw its two from.
 *
 * Eight is four different pairs — more visits than one reader makes inside the half hour a brief
 * lives for — and it is bounded by what the screen actually produces on an ordinary session:
 * measured against a live morning, nine of the top twenty-five qualified.
 */
export const WELCOME_POOL_SIZE = 8;

/**
 * The hard ceiling on the tip, in characters.
 *
 * A backstop against a model that answers with an essay, not a length to design to — a tip cut off
 * at the limit reads worse than a long one, so the prompt asks for one or two short sentences and
 * this only catches the case where it did not.
 */
const MAX_TIP_LENGTH = 200;

/**
 * How many of the six-month leaders are checked against the week's prices.
 *
 * Every one of these is a price-history request, so the number is a budget rather than a
 * preference. Thirty is enough to fill the rotation pool on an ordinary session — measured against
 * a live morning, nine of the top twenty-five qualified — and it is one burst of requests every
 * half hour rather than one per visitor.
 */
const SHORTLIST_SIZE = 30;

const HISTORY_CONCURRENCY = 10;

/** A six-month return below this is not a performer, whatever it has done this week. */
const MIN_SIX_MONTH_RETURN = 15;

/**
 * How close to the week's low still counts as being at it, as a percentage above.
 *
 * The low is the lowest price the stock has *traded* at this week, intraday, so "exactly equal"
 * would be a screen that answers empty on nearly every session — measured against a live morning
 * it matched nothing at all, while a two percent band matched nine of the twenty-five. Two percent
 * is close enough that the claim is true as a reader would mean it, and the card shows both the
 * price and the low so it can be checked rather than taken.
 */
export const AT_LOW_BAND_PERCENT = 2;

export type WelcomePick = {
  symbol: string;
  name: string;
  sector: string;
  capTier: string;
  price: number | null;
  /** Today's move, whichever way it went. */
  changePercent: number | null;
  /** The measured six-month return: the "has been performing" half. */
  sixMonthReturn: number | null;
  /** The lowest price it has traded at over the past week. */
  weekLow: number | null;
  /** How far above that low it trades, as a percentage. Never more than `AT_LOW_BAND_PERCENT`. */
  aboveWeekLow: number | null;
};

export type WelcomeBrief = {
  /** Everything that cleared the screen. The dialog draws two of these per visit. */
  picks: WelcomePick[];
  tip: string;
  /** Whether the tip came from the model or from the written fallback. */
  tipSource: "ai" | "written";
  model: string | null;
  marketSession: MarketSessionState;
  /** The session the six-month figures were measured against. */
  sessionDate: string | null;
  date: string;
  generatedAt: string;
};

/**
 * The tip a deployment with no model configured still greets its visitor with.
 *
 * Deliberately about how to read the screen above it rather than about what to buy: a fixed line
 * cannot know today's market, and a fixed line that pretended to would be the one kind of wrong
 * that matters here.
 */
const WRITTEN_TIP =
  "Strong over six months but back at this week's low is a pullback; flat over six months at the same low is a trend. Read both figures before acting on either.";

function clip(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > MAX_TIP_LENGTH ? `${text.slice(0, MAX_TIP_LENGTH - 1).trimEnd()}…` : text;
}

/**
 * What one company's last week of prices says: its low, and where it trades now.
 *
 * Both come out of the same chart request, which is the point. Reading the current price from the
 * app's own quote cache instead would mean `getAllQuotes` — a live read across the whole ~390-name
 * catalogue — to use twenty of them, and on a cold instance that alone took the endpoint past a
 * minute while a dialog sat waiting on it. The chart already carries the price it is being asked
 * about, so this asks for nothing it does not use.
 */
type WeekWindow = { weekLow: number; price: number; changePercent: number | null };

async function weekWindowFor(subject: QuoteSubject): Promise<WeekWindow | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(subject.yahooSymbol)}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; stockers-app/1.0)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    if (typeof price !== "number" || price <= 0) return null;

    // Today's move, from the same meta block: the previous close is what the exchange settled the
    // last session at, so this is the figure every board on the site shows, not a second opinion.
    const previousClose = result?.meta?.chartPreviousClose ?? result?.meta?.previousClose;
    const changePercent =
      typeof previousClose === "number" && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : null;

    const lows: (number | null)[] = result?.indicators?.quote?.[0]?.low ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

    // The intraday low where the feed carries one, the close otherwise — "the lowest price it has
    // traded at this week" is the claim, and a close-only series is the weaker version of it.
    const series = [...lows, ...closes].filter((value): value is number => typeof value === "number" && value > 0);
    if (series.length === 0) return null;

    return { weekLow: Math.min(...series), price, changePercent };
  } catch {
    // An unreachable history is not a stock at its low; it is a stock this screen cannot judge.
    return null;
  }
}

/** Everything that clears both halves of the screen, best six-month performer first. */
async function screenPicks(): Promise<{ picks: WelcomePick[]; sessionDate: string | null }> {
  const returns = await getReturnsForPeriod("6mo");

  // The six-month leaders, best first. Read from the daily returns cache every other board on this
  // site is ranked from, so this half costs no network at all on a warm day.
  const leaders = indianStocks
    .map((stock) => ({ stock, sixMonthReturn: returns.returns[stock.symbol] }))
    .filter(
      (entry): entry is { stock: (typeof indianStocks)[number]; sixMonthReturn: number } =>
        typeof entry.sixMonthReturn === "number" && entry.sixMonthReturn > MIN_SIX_MONTH_RETURN,
    )
    .sort((left, right) => right.sixMonthReturn - left.sixMonthReturn)
    .slice(0, SHORTLIST_SIZE);

  const windows = await mapWithConcurrency(leaders, HISTORY_CONCURRENCY, (entry) => weekWindowFor(entry.stock));

  const atTheirLow = leaders
    .map((entry, index) => ({ ...entry, window: windows[index] }))
    .filter(
      (entry): entry is { stock: (typeof indianStocks)[number]; sixMonthReturn: number; window: WeekWindow } =>
        entry.window !== null && entry.window.price <= entry.window.weekLow * (1 + AT_LOW_BAND_PERCENT / 100),
    )
    // Both halves already hold for everything left, so the ranking is the half a reader is here
    // for: which of them has performed best. Cut to the pool rather than to the pair — the two a
    // given visit sees are drawn from this in the browser.
    .sort((left, right) => right.sixMonthReturn - left.sixMonthReturn)
    .slice(0, WELCOME_POOL_SIZE);

  return {
    sessionDate: returns.date,
    picks: atTheirLow.map(({ stock, sixMonthReturn, window }) => ({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      capTier: stock.capTier,
      price: window.price,
      changePercent: window.changePercent,
      weekLow: window.weekLow,
      sixMonthReturn,
      aboveWeekLow: ((window.price - window.weekLow) / window.weekLow) * 100,
    })),
  };
}

/**
 * One tip about this morning, or null when the model cannot be reached.
 *
 * What the screen found is handed over — how many leaders are sitting at their weekly low, in which
 * sectors, how far they have run — so the tip is about today rather than about markets in general.
 * No stock is named in it: the panel names its own two, chosen in the browser after this is
 * written, and a model free to name a third would quietly undo the measured screen above it.
 */
async function aiTip(picks: WelcomePick[], session: MarketSessionState): Promise<string | null> {
  return chatJson({
    feature: "welcome-brief",
    // Twelve seconds, not twenty-five: this is a greeting on a timer. A reader who has been on the
    // page for five seconds will not wait half a minute for the panel behind it.
    timeoutMs: 12_000,
    system:
      "You write one short, practical tip for somebody opening an Indian stock market site. " +
      "Give exactly one tip they could act on today on the BSE: what this session means for how an order is placed, " +
      "or how to read a stock that has led for six months and is now back at the bottom of its weekly range. " +
      "One or two short sentences, under 160 characters, ending as a complete sentence. Concrete and specific — no platitudes, " +
      "nothing that would read the same on any other day. " +
      "Never name a stock, never promise a return or a price target, and do not mention this site. " +
      'Reply with JSON only: {"tip":"..."}',
    user: JSON.stringify({
      session,
      day: tradingDayKey(),
      // Aggregates, not names: what the screen found today is the thing worth a tip about, and the
      // two names a given visit ends up showing are not decided until the browser draws them.
      screen: "six-month leaders trading within 2% of their lowest price this week",
      qualifyingCount: picks.length,
      sectors: [...new Set(picks.map((pick) => pick.sector))],
      sixMonthReturnsPercent: picks.map((pick) => pick.sixMonthReturn),
      todayChangesPercent: picks.map((pick) => pick.changePercent),
    }),
    temperature: 0.4,
    parse: (text) => {
      const parsed = extractJsonObject(text) as { tip?: unknown } | null;
      const tip = parsed?.tip;

      // An empty or missing tip is a truncated or confused reply, and the written line is a better
      // greeting than a blank panel.
      if (typeof tip !== "string" || tip.trim().length === 0) return null;
      return clip(tip);
    },
  });
}

async function loadWelcomeBrief(): Promise<WelcomeBrief> {
  const now = new Date();
  const screened = await screenPicks().catch(() => ({ picks: [] as WelcomePick[], sessionDate: null }));
  const session = marketSessionState(now);

  const generated = screened.picks.length > 0 ? await aiTip(screened.picks, session) : null;

  return {
    picks: screened.picks,
    tip: generated ?? WRITTEN_TIP,
    tipSource: generated ? "ai" : "written",
    model: generated ? aiModel() : null,
    marketSession: session,
    sessionDate: screened.sessionDate,
    date: tradingDayKey(now),
    generatedAt: now.toISOString(),
  };
}

/**
 * The welcome, built once and shared.
 *
 * Half an hour, because that is the scale both halves change on: the six-month figures are a daily
 * cache, and a week's low moves slowly by construction. A brief that came back with no stocks is
 * retried much sooner — that is usually an upstream feed being unreachable rather than a session
 * where no performer sat at its weekly low.
 */
export const getWelcomeBrief = revalidating<WelcomeBrief>({
  // Named for the screen rather than the panel: a cached entry belongs to the question that
  // produced it, so changing the screen has to change the key rather than silently reuse rows
  // computed from a different one.
  key: "welcome:six-month-leaders-at-week-low:pool",
  ttlMs: 30 * 60_000,
  ttlFor: (brief) => (brief.picks.length > 0 ? 30 * 60_000 : 2 * 60_000),
  tags: [CACHE_TAGS.bse, CACHE_TAGS.quotes, CACHE_TAGS.ai],
  persist: true,
  load: loadWelcomeBrief,
});
