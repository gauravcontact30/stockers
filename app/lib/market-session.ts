// What the exchange is doing right now, in IST.
//
// Extracted from ./bse-ai-prediction-accuracy, which is where this clock was first written and
// where it still reads best — the AI lock at 08:50, the open at 09:15, the close at 15:30. It had
// to move because the market boards need the same answer and that module imports ./bse-market: a
// board asking "is the session live?" of the accuracy engine would have closed an import cycle
// around the two largest modules in the app.
//
// Nothing here reaches the network or the exchange. It is arithmetic on the clock plus the holiday
// list an operator configures, which is exactly why it can be asked cheaply on every request — a
// board that renders "LIVE" has to be right about that at the moment it renders, not at the moment
// its data was cached.

/** IANA zone for Indian market hours. Everything below is computed against this, never local time. */
export const IST_TIME_ZONE = "Asia/Kolkata";

export const MARKET_OPEN_TIME = "09:15";
export const MARKET_CLOSE_TIME = "15:30";

/**
 * Where the trading day currently stands.
 *
 * "pre-open" covers everything before 09:15 on a trading day, "closed" everything from 15:30, and
 * "holiday" the days the exchange does not trade at all. A board showing session figures needs all
 * four: what it can honestly say about its numbers is different on each.
 */
export type MarketSessionState = "pre-open" | "live" | "closed" | "holiday";

/** Today in IST as `YYYY-MM-DD`, whatever zone the server happens to be running in. */
export function tradingDayKey(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: IST_TIME_ZONE });
}

/** An IST wall-clock time on `day`, as an instant a `Date` can be built from. */
export function istInstant(day: string, time: string): string {
  return `${day}T${time}:00+05:30`;
}

export function marketOpenAt(day = tradingDayKey()): string {
  return istInstant(day, MARKET_OPEN_TIME);
}

export function marketCloseAt(day = tradingDayKey()): string {
  return istInstant(day, MARKET_CLOSE_TIME);
}

export function isBeforeMarketOpen(now = new Date()): boolean {
  return now.getTime() < new Date(marketOpenAt(tradingDayKey(now))).getTime();
}

export function isAfterMarketClose(now = new Date()): boolean {
  return now.getTime() >= new Date(marketCloseAt(tradingDayKey(now))).getTime();
}

/**
 * Exchange holidays, as `YYYY-MM-DD` in `BSE_MARKET_HOLIDAYS`.
 *
 * Unset, only weekends are skipped — which is the safe direction to be wrong in: treating a
 * holiday as a session shows the previous day's figures under a "closed" label, whereas treating a
 * session as a holiday would tell a reader the exchange is shut while it is trading.
 */
function marketHolidays(): Set<string> {
  return new Set(
    (process.env.BSE_MARKET_HOLIDAYS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function isTradingDay(day: string): boolean {
  // Noon IST rather than midnight: midnight IST is the *previous* date in UTC, and `getUTCDay`
  // would then report the wrong weekday for every single day.
  const weekday = new Date(istInstant(day, "12:00")).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !marketHolidays().has(day);
}

export function marketSessionState(now = new Date()): MarketSessionState {
  const day = tradingDayKey(now);
  if (!isTradingDay(day)) return "holiday";
  if (isBeforeMarketOpen(now)) return "pre-open";
  if (isAfterMarketClose(now)) return "closed";
  return "live";
}
