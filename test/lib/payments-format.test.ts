/** @jest-environment node */

// The ledger's arithmetic.
//
// Every figure the revenue panel prints is computed here once, off a `today` the caller passes in
// rather than a clock — which is the whole reason this is testable at all. What is checked below is
// that the windows do not overlap or leak: a payment belongs to exactly one of "this month" and
// "last month", and the rolling thirty days is genuinely rolling rather than the calendar month
// wearing a different label.
//
// Money is compared in paise throughout. A test that asserted on the formatted string would pass
// against a total that was a rupee out.

import {
  compactPaise,
  cycleMonths,
  dayAfter,
  dayBefore,
  dayOf,
  formatPaise,
  labelDay,
  labelMonth,
  monthBefore,
  summarisePayments,
  RECENT_PAYMENTS,
  TREND_DAYS,
  TREND_MONTHS,
  type PaymentRow,
} from "../../app/lib/payments-format";

const TODAY = "2026-08-21";

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    paymentId: "pay_1",
    orderId: "order_1",
    userId: "user_a",
    plan: "Pro",
    cycle: "monthly",
    amountPaise: 49_900,
    currency: "INR",
    promoCode: null,
    referralCode: null,
    subscribedUntil: "2026-09-20",
    // Midday UTC is half past five in the evening IST, so the calendar day is the same either way
    // and no assertion below turns on which side of midnight the fixture landed.
    paidAt: "2026-08-21T06:00:00.000Z",
    ...overrides,
  };
}

/**
 * The fixture the bulk of the assertions read from.
 *
 * Deliberately awkward: an account that has paid twice with the newer payment listed first, a live
 * yearly subscription, a lapsed one, a subscription with no paid-through date at all, a cycle
 * nothing recognises, and payments either side of every window boundary.
 */
const LEDGER: PaymentRow[] = [
  row({ paymentId: "pay_a2", userId: "user_a", paidAt: "2026-08-21T06:00:00.000Z", amountPaise: 49_900, subscribedUntil: "2026-09-20" }),
  row({ paymentId: "pay_a1", userId: "user_a", paidAt: "2026-07-21T06:00:00.000Z", amountPaise: 49_900, subscribedUntil: "2026-08-20" }),
  row({
    paymentId: "pay_b1",
    userId: "user_b",
    plan: "Elite",
    cycle: "yearly",
    amountPaise: 999_900,
    paidAt: "2026-08-19T06:00:00.000Z",
    subscribedUntil: "2027-08-18",
    promoCode: "LAUNCH20",
  }),
  row({ paymentId: "pay_c1", userId: "user_c", plan: "Starter", amountPaise: 19_900, paidAt: "2026-07-25T06:00:00.000Z", subscribedUntil: "2026-08-24" }),
  row({ paymentId: "pay_d1", userId: "user_d", cycle: "weekly", amountPaise: 9_900, paidAt: "2026-07-20T06:00:00.000Z", subscribedUntil: "2026-09-30" }),
  row({ paymentId: "pay_e1", userId: "user_e", amountPaise: 49_900, paidAt: "2026-02-10T06:00:00.000Z", subscribedUntil: "2026-03-12", referralCode: "FRIEND" }),
  row({ paymentId: "pay_f1", userId: "user_f", amountPaise: 149_900, paidAt: "2024-05-10T06:00:00.000Z", subscribedUntil: null }),
  row({ paymentId: "pay_g1", userId: "user_g", amountPaise: 29_900, paidAt: "2026-08-20T06:00:00.000Z", subscribedUntil: "2026-09-19" }),
];

describe("formatting money", () => {
  it("prints paise as rupees, with decimals only below a thousand", () => {
    expect(formatPaise(4_900)).toBe("₹49");
    expect(formatPaise(4_950)).toBe("₹49.5");
    expect(formatPaise(100_000)).toBe("₹1,000");
    expect(formatPaise(0)).toBe("₹0");
  });

  it("compacts to Indian units, and drops a trailing zero decimal", () => {
    expect(compactPaise(0)).toBe("₹0");
    expect(compactPaise(45_000)).toBe("₹450");
    expect(compactPaise(1_250_000)).toBe("₹12.5K");
    expect(compactPaise(24_000_000)).toBe("₹2.4L");
    expect(compactPaise(20_000_000)).toBe("₹2L");
    expect(compactPaise(1_200_000_000)).toBe("₹1.2Cr");
  });

  it("carries a minus sign rather than a hyphen", () => {
    expect(compactPaise(-500_000)).toBe("−₹5K");
  });
});

describe("calendar helpers", () => {
  it("steps backwards and forwards across month and year boundaries", () => {
    expect(dayBefore("2026-03-01", 1)).toBe("2026-02-28");
    expect(dayAfter("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayAfter(TODAY, 30)).toBe("2026-09-20");
  });

  it("steps months backwards across a year boundary", () => {
    expect(monthBefore("2026-08", 0)).toBe("2026-08");
    expect(monthBefore("2026-01", 1)).toBe("2025-12");
    expect(monthBefore("2026-01", 13)).toBe("2024-12");
  });

  it("labels a day and a month off the string, without a timezone in the way", () => {
    expect(labelDay("2026-08-05")).toBe("5 Aug");
    expect(labelMonth("2026-08")).toBe("Aug 26");
  });

  it("degrades to the number alone when a key names no real month", () => {
    expect(labelDay("2026-13-05")).toBe("5");
    expect(labelMonth("2026-13")).toBe("26");
  });

  it("reads an instant as its IST calendar day, and an unparseable one as nothing", () => {
    // Twenty past midnight IST, which is the previous evening in UTC.
    expect(dayOf("2026-08-20T18:50:00.000Z")).toBe("2026-08-21");
    expect(dayOf("not-an-instant")).toBe("");
  });

  it("knows how many months a cycle buys, and admits when it does not", () => {
    expect(cycleMonths("monthly")).toBe(1);
    expect(cycleMonths(" YEARLY ")).toBe(12);
    expect(cycleMonths("annual")).toBe(12);
    expect(cycleMonths("quarterly")).toBe(3);
    expect(cycleMonths("half-yearly")).toBe(6);
    expect(cycleMonths("weekly")).toBeNull();
  });
});

describe("an empty ledger", () => {
  const summary = summarisePayments([], TODAY);

  it("is zero everywhere rather than dividing by nothing", () => {
    expect(summary.allTimePaise).toBe(0);
    expect(summary.averagePaise).toBe(0);
    expect(summary.perAccountPaise).toBe(0);
    expect(summary.mrrPaise).toBe(0);
    expect(summary.arrPaise).toBe(0);
    expect(summary.payingAccounts).toBe(0);
    expect(summary.repeatAccounts).toBe(0);
    expect(summary.bestDay).toBeNull();
    expect(summary.topAccounts).toEqual([]);
    expect(summary.byCode).toEqual([]);
  });

  it("still returns a full, zero-filled trend — a quiet month is a flat chart, not a missing one", () => {
    expect(summary.daily).toHaveLength(TREND_DAYS);
    expect(summary.monthly).toHaveLength(TREND_MONTHS);
    expect(summary.daily.every((point) => point.paise === 0 && point.count === 0)).toBe(true);
    expect(summary.daily[0].key).toBe("2026-07-23");
    expect(summary.daily[TREND_DAYS - 1].key).toBe(TODAY);
    expect(summary.monthly[0].key).toBe("2025-09");
    expect(summary.monthly[TREND_MONTHS - 1].key).toBe("2026-08");
  });
});

describe("summarising a real ledger", () => {
  const summary = summarisePayments(LEDGER, TODAY);

  it("totals everything it holds", () => {
    expect(summary.allTimePaise).toBe(1_359_200);
    expect(summary.paymentCount).toBe(8);
    expect(summary.averagePaise).toBe(169_900);
  });

  it("separates today from yesterday", () => {
    expect(summary.todayPaise).toBe(49_900);
    expect(summary.todayCount).toBe(1);
    expect(summary.yesterdayPaise).toBe(29_900);
  });

  it("keeps the calendar month and the previous month apart", () => {
    expect(summary.monthPaise).toBe(1_079_700);
    expect(summary.monthCount).toBe(3);
    expect(summary.previousMonthPaise).toBe(79_700);
  });

  it("compares month-to-date against the same stretch of last month, not the whole of it", () => {
    // The 25th of July is inside last month but past the 21st, so it is in the closing total and
    // out of the like-for-like one. Comparing against the full month would flatter every 1st.
    expect(summary.previousMonthToDatePaise).toBe(59_800);
    expect(summary.previousMonthToDatePaise).toBeLessThan(summary.previousMonthPaise);
  });

  it("rolls thirty days rather than reusing the calendar month", () => {
    expect(summary.last30Paise).toBe(1_099_600);
    expect(summary.last30Count).toBe(4);
    expect(summary.previous30Paise).toBe(59_800);
    expect(summary.last30Paise).not.toBe(summary.monthPaise);
  });

  it("rolls each account up once, whatever order its payments arrive in", () => {
    expect(summary.payingAccounts).toBe(7);
    expect(summary.repeatAccounts).toBe(1);
    expect(summary.perAccountPaise).toBe(194_171);

    const repeat = summary.topAccounts.find((account) => account.userId === "user_a");
    expect(repeat).toMatchObject({ count: 2, paise: 99_800, lastPaise: 49_900, subscribedUntil: "2026-09-20" });
    // The newer payment was listed first in the fixture, so this only holds if both directions of
    // the comparison are honoured rather than the last row seen winning.
    expect(repeat?.firstPaidAt).toBe("2026-07-21T06:00:00.000Z");
    expect(repeat?.lastPaidAt).toBe("2026-08-21T06:00:00.000Z");
  });

  it("spreads a live subscription over the term it bought", () => {
    // ₹499 monthly + ₹9,999 a year (a twelfth each month) + ₹199 monthly + ₹299 monthly.
    expect(summary.mrrPaise).toBe(183_025);
    expect(summary.arrPaise).toBe(2_196_300);
    expect(summary.activeSubscriptions).toBe(5);
  });

  it("reports a cycle it cannot normalise instead of guessing at it", () => {
    expect(summary.mrrUnrecognisedCycles).toBe(1);
  });

  it("counts what lapses inside the renewal window, and what it last paid", () => {
    expect(summary.expiringSoon).toBe(3);
    expect(summary.renewalDuePaise).toBe(99_700);
  });

  it("leaves out a lapsed subscription and one with no paid-through date at all", () => {
    expect(summary.topAccounts.map((account) => account.userId)).toContain("user_f");
    expect(summary.activeSubscriptions).toBe(5);
  });

  it("splits by plan and by cycle, largest first", () => {
    expect(summary.byPlan).toEqual([
      { key: "Elite", label: "Elite", paise: 999_900, count: 1 },
      { key: "Pro", label: "Pro", paise: 339_400, count: 6 },
      { key: "Starter", label: "Starter", paise: 19_900, count: 1 },
    ]);
    expect(summary.byCycle.map((slice) => slice.key)).toEqual(["yearly", "monthly", "weekly"]);
  });

  it("attributes revenue to the code that carried it", () => {
    expect(summary.discounted).toBe(2);
    expect(summary.discountedPaise).toBe(1_049_800);
    expect(summary.byCode).toEqual([
      { key: "LAUNCH20", label: "LAUNCH20", paise: 999_900, count: 1 },
      { key: "FRIEND", label: "FRIEND", paise: 49_900, count: 1 },
    ]);
  });

  it("fills the daily trend to match the rolling total exactly", () => {
    expect(summary.daily).toHaveLength(TREND_DAYS);
    expect(summary.daily.reduce((sum, point) => sum + point.paise, 0)).toBe(summary.last30Paise);
    expect(summary.daily.find((point) => point.key === TODAY)).toMatchObject({ paise: 49_900, count: 1, label: "21 Aug" });
    expect(summary.daily.find((point) => point.key === "2026-08-18")).toMatchObject({ paise: 0, count: 0 });
  });

  it("fills the monthly trend, and drops what falls off the back of it", () => {
    expect(summary.monthly).toHaveLength(TREND_MONTHS);
    expect(summary.monthly.find((point) => point.key === "2026-08")).toMatchObject({ paise: 1_079_700, count: 3 });
    expect(summary.monthly.find((point) => point.key === "2026-07")).toMatchObject({ paise: 79_700, count: 3 });
    expect(summary.monthly.find((point) => point.key === "2026-02")).toMatchObject({ paise: 49_900, count: 1 });
    // May 2024 is older than the window and is in no bucket — but is still in the all-time total.
    expect(summary.monthly.reduce((sum, point) => sum + point.paise, 0)).toBe(1_209_300);
  });

  it("finds the best day anywhere in the ledger, not only inside a window", () => {
    expect(summary.bestDay).toMatchObject({ key: "2026-08-19", paise: 999_900, count: 1 });
  });

  it("ranks the largest accounts by lifetime spend", () => {
    expect(summary.topAccounts.map((account) => account.userId)).toEqual(["user_b", "user_f", "user_a", "user_e", "user_g"]);
  });

  it("lists the newest payments first, capped", () => {
    expect(summary.recent).toHaveLength(8);
    expect(summary.recent.length).toBeLessThanOrEqual(RECENT_PAYMENTS);
    expect(summary.recent[0].paymentId).toBe("pay_a2");
    expect(summary.recent[7].paymentId).toBe("pay_f1");
  });
});

describe("edges", () => {
  it("names an unlabelled plan rather than dropping it", () => {
    const summary = summarisePayments([row({ plan: "" })], TODAY);
    expect(summary.byPlan).toEqual([{ key: "Unknown", label: "Unknown", paise: 49_900, count: 1 }]);
  });

  it("reports no best day when every payment was for nothing", () => {
    const summary = summarisePayments([row({ amountPaise: 0 })], TODAY);
    expect(summary.bestDay).toBeNull();
  });

  it("breaks a tie on the best day towards the more recent one", () => {
    const summary = summarisePayments(
      [
        row({ paymentId: "pay_old", paidAt: "2026-08-10T06:00:00.000Z", amountPaise: 50_000 }),
        row({ paymentId: "pay_new", paidAt: "2026-08-15T06:00:00.000Z", amountPaise: 50_000 }),
      ],
      TODAY,
    );
    expect(summary.bestDay?.key).toBe("2026-08-15");
  });

  it("breaks a tie between equal slices on count, then on name", () => {
    const summary = summarisePayments(
      [
        row({ paymentId: "p1", plan: "Zeta", amountPaise: 20_000 }),
        row({ paymentId: "p2", plan: "Alpha", amountPaise: 10_000 }),
        row({ paymentId: "p3", plan: "Alpha", amountPaise: 10_000 }),
        row({ paymentId: "p4", plan: "Beta", amountPaise: 20_000 }),
      ],
      TODAY,
    );
    // Alpha and Zeta and Beta all total ₹200; Alpha took two payments to get there, so it leads,
    // and Beta precedes Zeta on name alone.
    expect(summary.byPlan.map((slice) => slice.key)).toEqual(["Alpha", "Beta", "Zeta"]);
  });

  it("breaks a tie between equal accounts on payment count, then on id", () => {
    const summary = summarisePayments(
      [
        row({ paymentId: "p1", userId: "user_z", amountPaise: 20_000 }),
        row({ paymentId: "p2", userId: "user_b", amountPaise: 20_000 }),
        row({ paymentId: "p3", userId: "user_a", amountPaise: 10_000 }),
        row({ paymentId: "p4", userId: "user_a", amountPaise: 10_000 }),
      ],
      TODAY,
    );
    expect(summary.topAccounts.map((account) => account.userId)).toEqual(["user_a", "user_b", "user_z"]);
  });

  it("keeps a subscription that lapses today, and drops one that lapsed yesterday", () => {
    const summary = summarisePayments(
      [
        row({ paymentId: "p1", userId: "user_today", subscribedUntil: TODAY }),
        row({ paymentId: "p2", userId: "user_gone", subscribedUntil: "2026-08-20" }),
      ],
      TODAY,
    );
    expect(summary.activeSubscriptions).toBe(1);
    expect(summary.expiringSoon).toBe(1);
  });
});
