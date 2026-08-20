// The days the BSE does not hold a normal session.
//
// Weekends are arithmetic and live in ./market-session. This file is the other half: the dates the
// exchange closes for a holiday, which no amount of arithmetic will produce because most of them
// follow lunar calendars and are fixed each year by a BSE circular.
//
// ---------------------------------------------------------------------------
// Why a committed list rather than only an environment variable
// ---------------------------------------------------------------------------
//
// `BSE_MARKET_HOLIDAYS` came first and still works, but an unset variable is indistinguishable
// from a correct one that happens to be empty — which is exactly the state this deployment was in:
// the 8:50 lock would have predicted ten stocks for Diwali. A list in the repository is reviewable
// in a diff, cannot be lost by recreating an environment, and ships with the checkout. The
// variable is kept as the way to add a date without a deploy, and the two are merged.
//
// ---------------------------------------------------------------------------
// Which direction this is allowed to be wrong in
// ---------------------------------------------------------------------------
//
// Missing a holiday costs a wasted run: the lock predicts ten stocks for a day that never trades,
// and tomorrow's run replaces them. Inventing one is worse — the site tells a reader the exchange
// is shut while it is trading, and the morning's list is never built at all. So every date below
// is one that is fixed by the calendar rather than announced, and the movable feasts are left for
// an operator to copy from the circular rather than guessed at here.
//
// ---------------------------------------------------------------------------
// Keeping it current — the part that needs a human
// ---------------------------------------------------------------------------
//
// The BSE publishes the next year's trading holidays around December, at
// https://www.bseindia.com/static/markets/marketinfo/listholi.aspx. Copy the dates in and delete
// the ones that have passed. The festivals whose dates move year to year — Holi, Ram Navami,
// Mahavir Jayanti, Good Friday, Id-ul-Fitr, Bakri Id, Muharram, Ganesh Chaturthi, Dussehra,
// Diwali Laxmi Pujan and Balipratipada, Guru Nanak Jayanti — are the ones this list will always be
// missing until somebody adds them.
//
// One note about Diwali: on Laxmi Pujan the exchange holds a special evening Muhurat session and
// no normal one. Listing it here is right for this app, whose whole clock is the 9:15–15:30
// session and whose 8:50 lock has nothing to predict for a day that has no regular open.

export type MarketHoliday = {
  /** `YYYY-MM-DD`, IST. */
  date: string;
  name: string;
};

/**
 * Known BSE closures, ascending.
 *
 * Deliberately short. Everything here is a fixed-date national holiday the exchange observes every
 * year; nothing here was inferred from a lunar calendar. Dates already past are harmless — a day
 * that has gone cannot be locked again — so they are pruned when the list is next updated rather
 * than on a schedule.
 */
export const BSE_MARKET_HOLIDAYS: MarketHoliday[] = [
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2026-12-25", name: "Christmas" },
  { date: "2027-01-26", name: "Republic Day" },
  { date: "2027-04-14", name: "Dr. Babasaheb Ambedkar Jayanti" },
];

/** The listed closures as a set of dates, built once. */
export const BSE_MARKET_HOLIDAY_DATES: ReadonlySet<string> = new Set(
  BSE_MARKET_HOLIDAYS.map((holiday) => holiday.date),
);

/** What the list is called, when a date is one of them. */
export function holidayName(day: string): string | null {
  return BSE_MARKET_HOLIDAYS.find((holiday) => holiday.date === day)?.name ?? null;
}

/**
 * The last date this list knows anything about.
 *
 * A holiday calendar does not fail loudly: it simply stops having dates in it, and every closure
 * after that is silently treated as a trading day. Exposing the horizon is what lets the scheduled
 * run say so out loud every morning rather than leaving it to be noticed on Diwali.
 */
export function holidayCalendarThrough(): string | null {
  return BSE_MARKET_HOLIDAYS.at(-1)?.date ?? null;
}
