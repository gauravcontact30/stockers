// Reading what the app has actually been paid.
//
// `./razorpay-credit` writes a row of `public.subscription_payments` for every captured payment and
// nothing has ever read it back. The entitlement lives on `users.subscribed_until`, which is what
// every paywall check reads and is deliberately not a query across this table; this is the ledger
// beside it — what was billed, to whom, for which plan, and when.
//
// Server-only. The shapes and the arithmetic live in `./payments-format`, which is pure and safe to
// import from a client component; this half reaches Supabase and the IST clock, and that clock
// reaches `./cache`, which imports `next/cache`. Keep the split — importing this module from the
// admin dashboard once pulled the whole server cache stack into the browser bundle.

import { todayIST } from "./nse-client";
import { summarisePayments, type LedgerState, type PaymentRow } from "./payments-format";
import { eq, isMissingTable, supabaseConfigured, supabaseRequest } from "./supabase";

export type { LedgerState, PaymentRow, RevenueSlice, RevenueSummary } from "./payments-format";
export { formatPaise, summarisePayments, RECENT_PAYMENTS } from "./payments-format";

/** A bound on one read: this is a summary strip, not an accounting export. */
const MAX_ROWS = 2000;

type LedgerRow = {
  payment_id: string;
  order_id: string | null;
  user_id: string;
  plan: string;
  cycle: string;
  amount_paise: number | string;
  currency: string | null;
  promo_code: string | null;
  referral_code: string | null;
  subscribed_until: string | null;
  paid_at: string;
};

/** PostgREST returns `bigint` as a string, so the figure is coerced on the way back in. */
function fromRow(row: LedgerRow): PaymentRow {
  const amount = typeof row.amount_paise === "number" ? row.amount_paise : Number(row.amount_paise);

  return {
    paymentId: row.payment_id,
    orderId: row.order_id,
    userId: row.user_id,
    plan: row.plan,
    cycle: row.cycle,
    amountPaise: Number.isFinite(amount) ? amount : 0,
    currency: row.currency ?? "INR",
    promoCode: row.promo_code,
    referralCode: row.referral_code,
    subscribedUntil: row.subscribed_until,
    paidAt: row.paid_at,
  };
}

/**
 * The ledger, or a reason it could not be read.
 *
 * Never throws. Revenue is a panel on a dashboard, not the dashboard — an accounting read that
 * fails must not take the rest of the overview down with it, which is the opposite of the rule the
 * portfolio store follows and right for the same reason: nothing here is being written.
 */
export async function readLedger(): Promise<LedgerState> {
  if (!supabaseConfigured()) {
    return {
      available: false,
      reason: "no-backend",
      message: "Payments are recorded in Supabase, which is not configured here. A local clone takes no payments.",
    };
  }

  try {
    const rows = await supabaseRequest<LedgerRow>({
      method: "GET",
      path: `subscription_payments?select=*&order=paid_at.desc&limit=${MAX_ROWS}`,
    });

    const today = todayIST();
    return { available: true, summary: summarisePayments(rows.map(fromRow), today), today };
  } catch (error) {
    if (isMissingTable(error)) {
      return {
        available: false,
        reason: "no-table",
        message: "The `subscription_payments` table has not been created yet. Apply supabase/schema.sql to start recording the ledger.",
      };
    }

    console.error("payments ledger: could not be read", error);
    return { available: false, reason: "unreadable", message: "The payments ledger could not be read just now." };
  }
}

/** One account's payments, newest first. For a support question about a specific charge. */
export async function paymentsForUser(userId: string): Promise<PaymentRow[]> {
  if (!supabaseConfigured()) return [];

  try {
    const rows = await supabaseRequest<LedgerRow>({
      method: "GET",
      path: `subscription_payments?user_id=${eq(userId)}&select=*&order=paid_at.desc`,
    });
    return rows.map(fromRow);
  } catch {
    return [];
  }
}
