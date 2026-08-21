// The payment ledger's shapes and arithmetic, with nothing server-only in them.
//
// Split from `./payments-ledger` because the admin dashboard is a client component and needs the
// types and the formatter, while the reading half needs Supabase and the IST clock — and that
// clock reaches `./cache`, which imports `next/cache`. Importing the reader from a client component
// dragged the whole server cache stack into the browser bundle.
//
// So the rule this file exists to keep: everything here is pure and safe on either side. The reader
// lives next door and is imported only by route handlers.
//
// Paise throughout, never rupees-as-float. Razorpay counts in paise, the column is a bigint, and a
// running total of currency in a float is a rounding error waiting for a large enough sum. The only
// division happens at the point of formatting.

export type PaymentRow = {
  paymentId: string;
  orderId: string | null;
  userId: string;
  plan: string;
  cycle: string;
  amountPaise: number;
  currency: string;
  promoCode: string | null;
  referralCode: string | null;
  subscribedUntil: string | null;
  paidAt: string;
};

export type RevenueSlice = { key: string; label: string; paise: number; count: number };

/** One period on a trend — a day or a calendar month, zero-filled when nothing was billed. */
export type RevenuePoint = { key: string; label: string; paise: number; count: number };

/** One account's whole history with us, rolled up. */
export type PayingAccount = {
  userId: string;
  /** Everything this account has ever paid. */
  paise: number;
  count: number;
  /** The most recent payment: its size, and the plan and cycle it bought. */
  lastPaise: number;
  plan: string;
  cycle: string;
  firstPaidAt: string;
  lastPaidAt: string;
  /** Paid through this date, as written beside the last payment. */
  subscribedUntil: string | null;
};

export type RevenueSummary = {
  /** Every payment the ledger holds. */
  allTimePaise: number;
  paymentCount: number;
  /** Today and yesterday in IST, so the freshest figure carries a direction of its own. */
  todayPaise: number;
  todayCount: number;
  yesterdayPaise: number;
  /** The current IST calendar month, from the 1st. */
  monthPaise: number;
  monthCount: number;
  /**
   * The previous calendar month in full, and the same slice of it that has elapsed this month.
   *
   * Two figures rather than one because they answer different questions: month-to-date compared
   * against a *whole* previous month always looks like a collapse on the 3rd, so the direction on
   * the month tile is measured against the same number of days.
   */
  previousMonthPaise: number;
  previousMonthToDatePaise: number;
  /** The thirty days ending today — the rolling figure, which the month-to-date is not. */
  last30Paise: number;
  last30Count: number;
  /** The thirty days before those, so the rolling figure can carry a direction. */
  previous30Paise: number;
  /** Mean payment size across the whole ledger. Zero when there are none. */
  averagePaise: number;
  /** Lifetime value: what the average paying account has spent in total. */
  perAccountPaise: number;
  /** Distinct accounts that have ever paid. */
  payingAccounts: number;
  /** Accounts whose second payment has arrived — a renewal rather than a first sale. */
  repeatAccounts: number;
  /**
   * Recurring revenue, normalised to a month.
   *
   * Only subscriptions still live today count, and each contributes its last payment spread over
   * the term that payment bought — a year's money is a twelfth of itself per month. An estimate off
   * the ledger, not a billing-system figure: nothing here knows whether an account means to renew.
   */
  mrrPaise: number;
  arrPaise: number;
  activeSubscriptions: number;
  /** Live subscriptions whose cycle this file does not recognise, so they are outside the MRR. */
  mrrUnrecognisedCycles: number;
  /** Live subscriptions lapsing within the next thirty days, and what they last paid. */
  expiringSoon: number;
  renewalDuePaise: number;
  byPlan: RevenueSlice[];
  byCycle: RevenueSlice[];
  /** Revenue attributed to each promo or referral code that was used. */
  byCode: RevenueSlice[];
  /** The last thirty days, one point per day, oldest first and zero-filled. */
  daily: RevenuePoint[];
  /** The last twelve calendar months, oldest first and zero-filled. */
  monthly: RevenuePoint[];
  /** The single highest-grossing day in the whole ledger. */
  bestDay: RevenuePoint | null;
  /** Payments that carried a promo or referral code — how much a campaign actually moved. */
  discounted: number;
  discountedPaise: number;
  /** The accounts that have paid the most, largest first. */
  topAccounts: PayingAccount[];
  /** The most recent payments, newest first. */
  recent: PaymentRow[];
};

export type LedgerState =
  /** Read, with figures. */
  | { available: true; summary: RevenueSummary; today: string }
  /**
   * Not read, and why — in words an admin can act on.
   *
   * Three genuinely different reasons, kept apart: no Supabase at all (a local clone, which takes
   * no payments and never will), the table not created yet (apply the schema), or the read failed
   * (transient). Collapsing them into "no revenue data" would send somebody looking for a bug in
   * the first case, where there is nothing wrong.
   */
  | { available: false; reason: "no-backend" | "no-table" | "unreadable"; message: string };

/** How many ledger rows the overview keeps in hand. */
export const RECENT_PAYMENTS = 10;
/** The rolling window every "last 30 days" figure and the daily trend share. */
export const TREND_DAYS = 30;
/** How far the monthly trend looks back. */
export const TREND_MONTHS = 12;
/** How many accounts the top-spenders list names. */
export const TOP_ACCOUNTS = 5;
/** A subscription lapsing inside this many days is money up for renewal. */
export const EXPIRY_WINDOW_DAYS = 30;

/**
 * How many months of access one billing cycle buys.
 *
 * Only `monthly` and `yearly` are ever written by `./razorpay-credit`; the rest are here so a cycle
 * renamed or added in the price list does not silently land in the wrong bucket. An unrecognised
 * cycle is reported rather than guessed — see `mrrUnrecognisedCycles`.
 */
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  month: 1,
  quarterly: 3,
  quarter: 3,
  "half-yearly": 6,
  halfyearly: 6,
  yearly: 12,
  annual: 12,
  annually: 12,
};

export function cycleMonths(cycle: string): number | null {
  return CYCLE_MONTHS[cycle.trim().toLowerCase()] ?? null;
}

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: rupees >= 1000 ? 0 : 2 })}`;
}

/** One decimal, but never a trailing `.0` — "₹1.2L" and "₹2L", not "₹2.0L". */
function trimZero(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

/**
 * Money short enough for an axis tick or a cramped cap label.
 *
 * Indian units, because the whole app prices in rupees and reads in `en-IN`: the figure an admin
 * here reads as "₹2.4L" is the one they would say out loud, and "₹240K" is not.
 */
export function compactPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  const sign = rupees < 0 ? "−" : "";
  const size = Math.abs(rupees);

  if (size >= 10_000_000) return `${sign}₹${trimZero(size / 10_000_000)}Cr`;
  if (size >= 100_000) return `${sign}₹${trimZero(size / 100_000)}L`;
  if (size >= 1_000) return `${sign}₹${trimZero(size / 1_000)}K`;
  return `${sign}₹${size}`;
}

/** `days` before `today`, as an IST calendar date. A negative count moves forward. */
export function dayBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** `days` after `today`, as an IST calendar date. */
export function dayAfter(today: string, days: number): string {
  return dayBefore(today, -days);
}

/** `months` calendar months before a `YYYY-MM` key. */
export function monthBefore(month: string, months: number): string {
  const shifted = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) - months;
  return `${String(Math.floor(shifted / 12)).padStart(4, "0")}-${String((shifted % 12) + 1).padStart(2, "0")}`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `2026-08-12` becomes "12 Aug"; `2026-08` becomes "Aug 26".
 *
 * Read off the string rather than through a `Date`, because these keys are already IST calendar
 * dates: parsing one back into an instant only to format it again is one more chance for a
 * timezone to shift the label by a day.
 */
export function labelDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1] ?? ""}`.trim();
}

export function labelMonth(month: string): string {
  return `${MONTH_SHORT[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(2, 4)}`.trim();
}

/** The IST calendar date an ISO instant falls on. */
export function dayOf(at: string): string {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function tally(rows: PaymentRow[], pick: (row: PaymentRow) => string): RevenueSlice[] {
  const slices = new Map<string, RevenueSlice>();

  for (const row of rows) {
    const key = pick(row) || "Unknown";
    const slice = slices.get(key) ?? { key, label: key, paise: 0, count: 0 };
    slice.paise += row.amountPaise;
    slice.count++;
    slices.set(key, slice);
  }

  // By money, then by count, then by name — so two equal slices come out in a stable order rather
  // than in whichever order the rows happened to arrive.
  return [...slices.values()].sort((a, b) => b.paise - a.paise || b.count - a.count || a.label.localeCompare(b.label));
}

/** An empty window, so a quiet day is a gap in the trend rather than a column that never existed. */
function emptyDays(today: string): Map<string, RevenuePoint> {
  const points = new Map<string, RevenuePoint>();
  for (let back = TREND_DAYS - 1; back >= 0; back--) {
    const day = dayBefore(today, back);
    points.set(day, { key: day, label: labelDay(day), paise: 0, count: 0 });
  }
  return points;
}

function emptyMonths(month: string): Map<string, RevenuePoint> {
  const points = new Map<string, RevenuePoint>();
  for (let back = TREND_MONTHS - 1; back >= 0; back--) {
    const key = monthBefore(month, back);
    points.set(key, { key, label: labelMonth(key), paise: 0, count: 0 });
  }
  return points;
}

/**
 * Recurring revenue off the ledger.
 *
 * One live subscription per account — the last thing it bought — spread over the months that
 * purchase covers, so a year paid up front is a twelfth of itself a month rather than a spike. An
 * account whose paid-through date has passed is not recurring anything and is left out entirely.
 *
 * A cycle string this file does not recognise is counted as unrecognised rather than assumed to be
 * monthly: assuming would put twelve times the real figure on a dashboard, and nothing downstream
 * would ever catch it.
 */
function recurring(
  accounts: Iterable<PayingAccount>,
  today: string,
): {
  mrrPaise: number;
  activeSubscriptions: number;
  mrrUnrecognisedCycles: number;
  expiringSoon: number;
  renewalDuePaise: number;
} {
  const lapsesBy = dayAfter(today, EXPIRY_WINDOW_DAYS);
  let mrrPaise = 0;
  let activeSubscriptions = 0;
  let mrrUnrecognisedCycles = 0;
  let expiringSoon = 0;
  let renewalDuePaise = 0;

  for (const account of accounts) {
    if (!account.subscribedUntil || account.subscribedUntil < today) continue;
    activeSubscriptions++;

    if (account.subscribedUntil <= lapsesBy) {
      expiringSoon++;
      renewalDuePaise += account.lastPaise;
    }

    const months = cycleMonths(account.cycle);
    if (months === null || months <= 0) {
      mrrUnrecognisedCycles++;
      continue;
    }
    mrrPaise += Math.round(account.lastPaise / months);
  }

  return { mrrPaise, activeSubscriptions, mrrUnrecognisedCycles, expiringSoon, renewalDuePaise };
}

/**
 * The ledger, summarised.
 *
 * `today` is passed in rather than read from a clock, so the month and the rolling windows are
 * reproducible and the whole function is checkable.
 */
export function summarisePayments(rows: PaymentRow[], today: string): RevenueSummary {
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const previousMonth = monthBefore(month, 1);
  const dayOfMonth = today.slice(8, 10);
  const yesterday = dayBefore(today, 1);
  const from30 = dayBefore(today, TREND_DAYS - 1);
  const from60 = dayBefore(today, TREND_DAYS * 2 - 1);

  let allTimePaise = 0;
  let todayPaise = 0;
  let todayCount = 0;
  let yesterdayPaise = 0;
  let monthPaise = 0;
  let monthCount = 0;
  let previousMonthPaise = 0;
  let previousMonthToDatePaise = 0;
  let last30Paise = 0;
  let last30Count = 0;
  let previous30Paise = 0;
  let discounted = 0;
  let discountedPaise = 0;

  const daily = emptyDays(today);
  const monthly = emptyMonths(month);
  /** Every day the ledger touches, not only the window — the best day may be far behind us. */
  const everyDay = new Map<string, RevenuePoint>();
  const accounts = new Map<string, PayingAccount>();

  for (const row of rows) {
    const day = dayOf(row.paidAt);
    const rowMonth = day.slice(0, 7);
    allTimePaise += row.amountPaise;

    if (row.promoCode || row.referralCode) {
      discounted++;
      discountedPaise += row.amountPaise;
    }

    const everyDayPoint = everyDay.get(day) ?? { key: day, label: labelDay(day), paise: 0, count: 0 };
    everyDayPoint.paise += row.amountPaise;
    everyDayPoint.count++;
    everyDay.set(day, everyDayPoint);

    const dailyPoint = daily.get(day);
    if (dailyPoint) {
      dailyPoint.paise += row.amountPaise;
      dailyPoint.count++;
    }

    const monthlyPoint = monthly.get(rowMonth);
    if (monthlyPoint) {
      monthlyPoint.paise += row.amountPaise;
      monthlyPoint.count++;
    }

    // One rollup per account, carrying the newest payment's plan and cycle: the last thing an
    // account bought is what it holds now, and what the recurring figure is drawn from.
    const account = accounts.get(row.userId) ?? {
      userId: row.userId,
      paise: 0,
      count: 0,
      lastPaise: 0,
      plan: row.plan,
      cycle: row.cycle,
      firstPaidAt: row.paidAt,
      lastPaidAt: "",
      subscribedUntil: row.subscribedUntil,
    };
    account.paise += row.amountPaise;
    account.count++;
    if (row.paidAt >= account.lastPaidAt) {
      account.lastPaidAt = row.paidAt;
      account.lastPaise = row.amountPaise;
      account.plan = row.plan;
      account.cycle = row.cycle;
      account.subscribedUntil = row.subscribedUntil;
    }
    if (row.paidAt < account.firstPaidAt) account.firstPaidAt = row.paidAt;
    accounts.set(row.userId, account);

    if (day === today) {
      todayPaise += row.amountPaise;
      todayCount++;
    } else if (day === yesterday) {
      yesterdayPaise += row.amountPaise;
    }

    if (day >= monthStart && day <= today) {
      monthPaise += row.amountPaise;
      monthCount++;
    } else if (rowMonth === previousMonth) {
      previousMonthPaise += row.amountPaise;
      // The same stretch of last month, so the month tile compares like with like.
      if (day.slice(8, 10) <= dayOfMonth) previousMonthToDatePaise += row.amountPaise;
    }

    if (day >= from30 && day <= today) {
      last30Paise += row.amountPaise;
      last30Count++;
    } else if (day >= from60 && day < from30) {
      previous30Paise += row.amountPaise;
    }
  }

  const bestDay = [...everyDay.values()].sort((a, b) => b.paise - a.paise || b.key.localeCompare(a.key))[0] ?? null;
  const { mrrPaise, activeSubscriptions, mrrUnrecognisedCycles, expiringSoon, renewalDuePaise } = recurring(accounts.values(), today);

  return {
    allTimePaise,
    paymentCount: rows.length,
    todayPaise,
    todayCount,
    yesterdayPaise,
    monthPaise,
    monthCount,
    previousMonthPaise,
    previousMonthToDatePaise,
    last30Paise,
    last30Count,
    previous30Paise,
    averagePaise: rows.length > 0 ? Math.round(allTimePaise / rows.length) : 0,
    perAccountPaise: accounts.size > 0 ? Math.round(allTimePaise / accounts.size) : 0,
    payingAccounts: accounts.size,
    repeatAccounts: [...accounts.values()].filter((account) => account.count > 1).length,
    mrrPaise,
    arrPaise: mrrPaise * 12,
    activeSubscriptions,
    mrrUnrecognisedCycles,
    expiringSoon,
    renewalDuePaise,
    byPlan: tally(rows, (row) => row.plan),
    byCycle: tally(rows, (row) => row.cycle),
    byCode: tally(
      rows.filter((row) => row.promoCode || row.referralCode),
      (row) => row.promoCode ?? row.referralCode ?? "",
    ),
    daily: [...daily.values()],
    monthly: [...monthly.values()],
    bestDay: bestDay && bestDay.paise > 0 ? bestDay : null,
    discounted,
    discountedPaise,
    topAccounts: [...accounts.values()]
      .sort((a, b) => b.paise - a.paise || b.count - a.count || a.userId.localeCompare(b.userId))
      .slice(0, TOP_ACCOUNTS),
    recent: [...rows].sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, RECENT_PAYMENTS),
  };
}
