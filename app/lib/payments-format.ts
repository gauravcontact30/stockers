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

export type RevenueSummary = {
  /** Every payment the ledger holds. */
  allTimePaise: number;
  paymentCount: number;
  /** The current IST calendar month, from the 1st. */
  monthPaise: number;
  monthCount: number;
  /** The thirty days ending today — the rolling figure, which the month-to-date is not. */
  last30Paise: number;
  last30Count: number;
  /** The thirty days before those, so the rolling figure can carry a direction. */
  previous30Paise: number;
  /** Mean payment size across the whole ledger. Zero when there are none. */
  averagePaise: number;
  /** Distinct accounts that have ever paid. */
  payingAccounts: number;
  byPlan: RevenueSlice[];
  byCycle: RevenueSlice[];
  /** Payments that carried a promo or referral code — how much a campaign actually moved. */
  discounted: number;
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

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: rupees >= 1000 ? 0 : 2 })}`;
}

/** `days` before `today`, as an IST calendar date. */
export function dayBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
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

/**
 * The ledger, summarised.
 *
 * `today` is passed in rather than read from a clock, so the month and the rolling windows are
 * reproducible and the whole function is checkable.
 */
export function summarisePayments(rows: PaymentRow[], today: string): RevenueSummary {
  const monthStart = `${today.slice(0, 7)}-01`;
  const from30 = dayBefore(today, 29);
  const from60 = dayBefore(today, 59);

  let allTimePaise = 0;
  let monthPaise = 0;
  let monthCount = 0;
  let last30Paise = 0;
  let last30Count = 0;
  let previous30Paise = 0;
  let discounted = 0;
  const accounts = new Set<string>();

  for (const row of rows) {
    const day = dayOf(row.paidAt);
    allTimePaise += row.amountPaise;
    accounts.add(row.userId);
    if (row.promoCode || row.referralCode) discounted++;

    if (day >= monthStart && day <= today) {
      monthPaise += row.amountPaise;
      monthCount++;
    }
    if (day >= from30 && day <= today) {
      last30Paise += row.amountPaise;
      last30Count++;
    } else if (day >= from60 && day < from30) {
      previous30Paise += row.amountPaise;
    }
  }

  return {
    allTimePaise,
    paymentCount: rows.length,
    monthPaise,
    monthCount,
    last30Paise,
    last30Count,
    previous30Paise,
    averagePaise: rows.length > 0 ? Math.round(allTimePaise / rows.length) : 0,
    payingAccounts: accounts.size,
    byPlan: tally(rows, (row) => row.plan),
    byCycle: tally(rows, (row) => row.cycle),
    discounted,
    recent: [...rows].sort((a, b) => b.paidAt.localeCompare(a.paidAt)).slice(0, RECENT_PAYMENTS),
  };
}
