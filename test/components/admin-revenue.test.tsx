// What the app has been paid, as the super admin sees it.
//
// The panel does no arithmetic of its own — `app/lib/payments-format` computes every figure and has
// its own suite. What is tested here is the presentation, and specifically the parts of it that
// could quietly mislead: a recurring-revenue estimate must say what it excluded, a month-to-date
// figure must name what it is being compared against, and every state the ledger can come back in
// must produce a sentence rather than a blank card or a zero pretending to be a reading.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminRevenue } from "../../app/components/admin-revenue";
import { summarisePayments, type LedgerState, type PaymentRow } from "../../app/lib/payments-format";

const TODAY = "2026-08-21";

function row(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    paymentId: "pay_1",
    orderId: "order_1",
    userId: "user_alpha_00000001",
    plan: "Pro",
    cycle: "monthly",
    amountPaise: 49_900,
    currency: "INR",
    promoCode: null,
    referralCode: null,
    subscribedUntil: "2026-09-20",
    paidAt: "2026-08-21T06:00:00.000Z",
    ...overrides,
  };
}

function ledgerOf(rows: PaymentRow[]): LedgerState {
  return { available: true, summary: summarisePayments(rows, TODAY), today: TODAY };
}

/** A ledger with something in every corner the panel renders. */
const BUSY: PaymentRow[] = [
  row({ paymentId: "pay_a2", userId: "user_alpha_00000001", paidAt: "2026-08-21T06:00:00.000Z" }),
  row({ paymentId: "pay_a1", userId: "user_alpha_00000001", paidAt: "2026-07-10T06:00:00.000Z", subscribedUntil: "2026-08-09" }),
  row({
    paymentId: "pay_b1",
    userId: "user_bravo_00000002",
    plan: "Elite",
    cycle: "yearly",
    amountPaise: 999_900,
    paidAt: "2026-08-19T06:00:00.000Z",
    subscribedUntil: "2027-08-18",
    promoCode: "LAUNCH20",
  }),
  row({ paymentId: "pay_c1", userId: "user_charlie_0000003", plan: "Starter", amountPaise: 19_900, paidAt: "2026-08-05T06:00:00.000Z", subscribedUntil: "2026-09-04" }),
  row({
    paymentId: "pay_d1",
    userId: "user_delta_00000004",
    plan: "Legacy Gold",
    cycle: "weekly",
    amountPaise: 9_900,
    paidAt: "2026-07-20T06:00:00.000Z",
    subscribedUntil: "2026-12-31",
    referralCode: "FRIEND",
  }),
  row({ paymentId: "pay_e1", userId: "user_echo_000000005", amountPaise: 29_900, paidAt: "2026-06-02T06:00:00.000Z", subscribedUntil: null }),
];

/** The card a heading names, so an assertion cannot drift onto a figure in the card next door. */
function card(label: string): HTMLElement {
  return screen.getByText(label).closest("div") as HTMLElement;
}

describe("before the ledger has answered", () => {
  it("says it is reading rather than showing a zero", () => {
    render(<AdminRevenue ledger={null} />);
    expect(screen.getByText("Reading the ledger…")).toBeInTheDocument();
    expect(screen.queryByText(/Recurring revenue/)).not.toBeInTheDocument();
  });
});

describe("when the ledger could not be read", () => {
  it("passes the reason through in the words the reader can act on", () => {
    render(
      <AdminRevenue
        ledger={{
          available: false,
          reason: "no-table",
          message: "The `subscription_payments` table has not been created yet.",
        }}
      />,
    );
    expect(screen.getByText("The `subscription_payments` table has not been created yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Recurring revenue/)).not.toBeInTheDocument();
  });
});

describe("the headline", () => {
  it("leads with recurring revenue, and the year it implies", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);

    // ₹499 monthly + a twelfth of ₹9,999 + ₹199 monthly. The weekly one is not in it.
    expect(screen.getByText("₹1,531")).toBeInTheDocument();
    expect(screen.getByText("₹18,375")).toBeInTheDocument();
    expect(screen.getByText(/live subscriptions/)).toHaveTextContent("across 4 live subscriptions");
  });

  it("admits which subscriptions it could not fold into that figure", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(screen.getByText("1 live subscription bill on a cycle this figure cannot spread over a month, and are not in it.")).toBeInTheDocument();
  });

  it("says nothing about exclusions when there are none", () => {
    render(<AdminRevenue ledger={ledgerOf([row()])} />);
    expect(screen.queryByText(/cannot spread over a month/)).not.toBeInTheDocument();
  });

  it("names what month-to-date is measured against, rather than leaving a bare percentage", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(screen.getByText(/the same point last month/)).toBeInTheDocument();
  });

  it("colours the month green when it is ahead and red when it is behind", () => {
    const ahead = render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(ahead.container.querySelector(".text-emerald-600")).toBeInTheDocument();
    ahead.unmount();

    // Last month took ₹499 by the 10th; this month has taken nothing at all.
    const behind = render(<AdminRevenue ledger={ledgerOf([row({ paidAt: "2026-07-10T06:00:00.000Z" })])} />);
    expect(behind.container.querySelector(".text-rose-600")).toBeInTheDocument();
    behind.unmount();

    // Neither month has taken anything, so there is no direction to show and the figure stays ink.
    const flat = render(<AdminRevenue ledger={ledgerOf([row({ paidAt: "2026-03-10T06:00:00.000Z", subscribedUntil: null })])} />);
    expect(flat.getAllByText("no change").length).toBeGreaterThan(0);
    expect(flat.container.querySelector(".text-emerald-600")).not.toBeInTheDocument();
    expect(flat.container.querySelector(".text-rose-600")).not.toBeInTheDocument();
  });

  it("counts what lapses inside the renewal window", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(screen.getByText("2 subscriptions lapse within 30 days")).toBeInTheDocument();
  });

  it("says so plainly when nothing is about to lapse", () => {
    render(<AdminRevenue ledger={ledgerOf([row({ subscribedUntil: "2027-12-31" })])} />);
    expect(screen.getByText("Nothing lapses within 30 days")).toBeInTheDocument();
  });

  it("dates itself, and names the best day on record", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(screen.getByText(/Every figure is IST and current to 21 Aug 2026/)).toHaveTextContent(
      "the best single day on record is 19 Aug 2026 at ₹9,999",
    );
  });

  it("leaves the best day out when nothing has been billed", () => {
    render(<AdminRevenue ledger={ledgerOf([])} />);
    expect(screen.getByText(/Every figure is IST/)).not.toHaveTextContent("best single day");
  });
});

describe("the tiles", () => {
  it("compares the rolling window against the one before it, not against yesterday", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(screen.getByText(/vs the 30 before/)).toBeInTheDocument();
  });

  it("reports how many payers came back", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    expect(screen.getByText("20% of payers came back")).toBeInTheDocument();
  });

  it("does not divide by an empty ledger to get that share", () => {
    render(<AdminRevenue ledger={ledgerOf([])} />);
    expect(screen.getByText("Nobody has paid yet")).toBeInTheDocument();
  });
});

describe("the concentration cards", () => {
  it("ranks the largest accounts and says what share of revenue they are", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);

    const accounts = card("Largest paying accounts");
    expect(within(accounts).getByText(/are 100% of everything billed/)).toBeInTheDocument();
    // The id is truncated: the ledger holds an id, and the roster is where a name lives.
    expect(within(accounts).getByText("user_bravo_0")).toBeInTheDocument();
    expect(within(accounts).getByText("₹9,999")).toBeInTheDocument();
  });

  it("badges a plan it still sells, and prints one it no longer does as itself", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    const accounts = card("Largest paying accounts");

    expect(within(accounts).getByText("Elite")).toBeInTheDocument();
    expect(within(accounts).getByText("Legacy Gold")).toBeInTheDocument();
  });

  it("says when an account has no paid-through date at all", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    const accounts = card("Largest paying accounts");

    expect(within(accounts).getByText(/no paid-through date/)).toBeInTheDocument();
    expect(within(accounts).getByText(/paid to 18 Aug 2027/)).toBeInTheDocument();
  });

  it("prints a paid-through date it cannot parse as it stands, rather than as an Invalid Date", () => {
    // The column is free text and nothing in the app validates it on the way out of Supabase.
    render(<AdminRevenue ledger={ledgerOf([row({ subscribedUntil: "whenever" })])} />);
    expect(screen.getByText(/paid to whenever/)).toBeInTheDocument();
  });

  it("attributes revenue to each code, and totals what the codes moved", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    const codes = card("Promo and referral codes");

    expect(within(codes).getByText(/2 of 6 payments carried a code/)).toHaveTextContent("₹10,098 — 87% of revenue");
    expect(within(codes).getByText("LAUNCH20")).toBeInTheDocument();
    expect(within(codes).getByText(/99% of code-driven revenue/)).toBeInTheDocument();
  });

  it("says nothing has been paid rather than drawing an empty ranking", () => {
    render(<AdminRevenue ledger={ledgerOf([])} />);

    expect(screen.getByText("Nobody has paid yet.")).toBeInTheDocument();
    expect(screen.getByText("No account has paid yet.")).toBeInTheDocument();
    expect(screen.getByText("No payment has carried a promo or referral code.")).toBeInTheDocument();
    expect(screen.getByText("No code has been used yet.")).toBeInTheDocument();
  });

  it("treats a ledger of free payments as nothing to rank, rather than dividing by zero", () => {
    render(<AdminRevenue ledger={ledgerOf([row({ amountPaise: 0, promoCode: "FREEBIE" })])} />);

    expect(screen.getByText("No account has paid yet.")).toBeInTheDocument();
    expect(screen.getByText("No code has been used yet.")).toBeInTheDocument();
    // The code was still used, even though it moved no money.
    expect(screen.getByText(/1 of 1 payments carried a code/)).toHaveTextContent("₹0 — 0% of revenue");
  });
});

describe("the recent payments table", () => {
  it("shows the account, the code and the paid-through date for each row", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    const table = screen.getByRole("table", { name: /most recent payments/i });
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows[0]).toHaveTextContent("user_alpha_0");
    expect(rows[0]).toHaveTextContent("₹499");
    expect(rows[0]).toHaveTextContent("2026-09-20");
    expect(rows[1]).toHaveTextContent("LAUNCH20");
  });

  it("falls back through promo, referral and nothing at all", () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    const table = screen.getByRole("table", { name: /most recent payments/i });

    expect(within(table).getByText("LAUNCH20")).toBeInTheDocument();
    expect(within(table).getByText("FRIEND")).toBeInTheDocument();
    expect(within(table).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("sorts on every column that carries a value to sort by", async () => {
    render(<AdminRevenue ledger={ledgerOf(BUSY)} />);
    const table = () => screen.getByRole("table", { name: /most recent payments/i });

    // Each of these headers is a button because the column named something to order on. "Code" is
    // deliberately not among them — a promo code has no order worth sorting into.
    for (const name of ["Paid", "Plan", "Cycle", "Account", "Paid up to"]) {
      await userEvent.click(within(table()).getByRole("button", { name }));
    }
    expect(within(table()).queryByRole("button", { name: "Code" })).not.toBeInTheDocument();

    await userEvent.click(within(table()).getByRole("button", { name: "Amount" }));
    // The first click sorts descending, so the largest payment leads.
    expect(within(table()).getAllByRole("row")[1]).toHaveTextContent("₹9,999");
  });

  it("is not rendered at all when there is nothing to list", () => {
    render(<AdminRevenue ledger={ledgerOf([])} />);
    expect(screen.queryByRole("table", { name: /most recent payments/i })).not.toBeInTheDocument();
  });
});
