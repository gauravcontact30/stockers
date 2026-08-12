import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingSubscriptionCheckout } from "../../app/components/pending-subscription-checkout";
import { SubscriptionProvider } from "../../app/components/subscription-provider";
// The storage key is private to razorpay-checkout, so what is remembered is asserted through its
// own reader rather than by reaching into localStorage and assuming the layout.
import { readPendingSubscription, savePendingSubscription } from "../../app/components/razorpay-checkout";

// The real button opens Razorpay. Here it only records what the bar handed it.
jest.mock("../../app/components/razorpay-checkout", () => {
  const actual = jest.requireActual("../../app/components/razorpay-checkout");
  return {
    ...actual,
    SubscribeButton: ({
      plan,
      cycle,
      promoCode,
      referralCode,
      label,
    }: {
      plan: string;
      cycle: string;
      promoCode?: string;
      referralCode?: string;
      label: string;
    }) => (
      <button type="button" data-plan={plan} data-cycle={cycle} data-promo={promoCode} data-referral={referralCode}>
        {label}
      </button>
    ),
  };
});

const baseStatus = {
  state: "none",
  allowed: false,
  isAdmin: false,
  tier: null,
  planName: null,
  marketDaysUsed: 0,
  marketDaysLeft: 0,
  trialStartedAt: null,
  subscribedUntil: null,
  today: "2026-08-11",
  locks: {},
  features: [],
  signedIn: true,
  name: "Aarav",
};

/** Puts the checkout intent in the URL the signup redirect would have landed on. */
function atUrl(search: string) {
  window.history.replaceState(null, "", `/dashboard${search}`);
}

function renderBar(overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...baseStatus, ...overrides }),
  }) as unknown as typeof fetch;

  return render(
    <SubscriptionProvider>
      <PendingSubscriptionCheckout />
    </SubscriptionProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  atUrl("");
});

describe("PendingSubscriptionCheckout", () => {
  it("stays out of the way when there is no pending intent", async () => {
    const { container } = renderBar();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it("picks the intent up out of the URL the signup redirect lands on", async () => {
    atUrl("?subscribe=1&plan=elite&cycle=monthly");
    renderBar();

    expect(await screen.findByText("Elite plan ready for checkout")).toBeInTheDocument();
    // Elite is ₹899/mo, and a monthly cycle bills exactly that.
    expect(screen.getByText(/₹899 payable now, ₹899\/month effective on monthly billing/)).toBeInTheDocument();
  });

  // The intent has to survive the round trip through signup, so it is written to storage as soon
  // as it is seen in the URL rather than only when the reader gets to a checkout.
  it("remembers the intent from the URL so it survives a reload", async () => {
    atUrl("?subscribe=1&plan=pro&cycle=yearly");
    renderBar();
    await screen.findByText("Pro plan ready for checkout");

    expect(readPendingSubscription()).toEqual({
      plan: "pro",
      cycle: "yearly",
      promoCode: "",
      referralCode: "",
    });
  });

  it("falls back to the remembered intent when the URL carries none", async () => {
    savePendingSubscription("starter", "yearly");
    renderBar();

    expect(await screen.findByText("Starter plan ready for checkout")).toBeInTheDocument();
    // ₹149 a month for nine months is ₹1,341, which is ₹112 a month over the year.
    expect(screen.getByText(/₹1,341 payable now, ₹112\/month effective on yearly billing/)).toBeInTheDocument();
  });

  it.each([
    ["the subscribe flag is missing", "?plan=pro&cycle=monthly"],
    ["the plan is not one we sell", "?subscribe=1&plan=platinum&cycle=monthly"],
    ["the cycle is not one we bill", "?subscribe=1&plan=pro&cycle=weekly"],
  ])("ignores a URL where %s", async (_case, search) => {
    atUrl(search);
    const { container } = renderBar();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
    expect(readPendingSubscription()).toBeNull();
  });

  // Nobody can be charged before they have an account, so the bar waits rather than offering a
  // checkout that cannot complete.
  it("stays hidden for a visitor who is not signed in", async () => {
    atUrl("?subscribe=1&plan=pro&cycle=monthly");
    const { container } = renderBar({ signedIn: false });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden while the subscription status is still loading", () => {
    atUrl("?subscribe=1&plan=pro&cycle=monthly");
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const { container } = render(
      <SubscriptionProvider>
        <PendingSubscriptionCheckout />
      </SubscriptionProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("reprices and re-remembers when the plan is changed", async () => {
    const user = userEvent.setup();
    atUrl("?subscribe=1&plan=pro&cycle=monthly");
    renderBar();
    await screen.findByText("Pro plan ready for checkout");

    await user.selectOptions(screen.getByLabelText("Subscription plan"), "starter");

    expect(screen.getByText("Starter plan ready for checkout")).toBeInTheDocument();
    expect(screen.getByText(/₹149 payable now/)).toBeInTheDocument();
    expect(readPendingSubscription()).toEqual({
      plan: "starter",
      cycle: "monthly",
      promoCode: "",
      referralCode: "",
    });
  });

  it("reprices and re-remembers when the billing cycle is changed", async () => {
    const user = userEvent.setup();
    atUrl("?subscribe=1&plan=pro&cycle=monthly");
    renderBar();
    await screen.findByText("Pro plan ready for checkout");

    await user.selectOptions(screen.getByLabelText("Billing cycle"), "yearly");

    // Nine months for twelve: ₹3,591 now, ₹299 a month effective.
    expect(screen.getByText(/₹3,591 payable now, ₹299\/month effective on yearly billing/)).toBeInTheDocument();
    expect(readPendingSubscription()).toEqual({
      plan: "pro",
      cycle: "yearly",
      promoCode: "",
      referralCode: "",
    });
  });

  it("preserves promo and referral codes from the signup redirect", async () => {
    atUrl("?subscribe=1&plan=pro&cycle=yearly&promo=save20&ref=stkabc1234");
    renderBar();
    await screen.findByText("Pro plan ready for checkout");

    expect(readPendingSubscription()).toEqual({
      plan: "pro",
      cycle: "yearly",
      promoCode: "save20",
      referralCode: "stkabc1234",
    });
    expect(screen.getByLabelText("Promo code")).toHaveValue("save20");
    expect(screen.getByLabelText("Referral code")).toHaveValue("stkabc1234");
  });

  it("hands the current plan and cycle to the pay button", async () => {
    const user = userEvent.setup();
    atUrl("?subscribe=1&plan=pro&cycle=monthly");
    renderBar();
    await screen.findByText("Pro plan ready for checkout");

    await user.selectOptions(screen.getByLabelText("Subscription plan"), "elite");

    const pay = screen.getByRole("button", { name: "Pay now" });
    expect(pay).toHaveAttribute("data-plan", "elite");
    expect(pay).toHaveAttribute("data-cycle", "monthly");
    expect(pay).toHaveAttribute("data-promo", "");
    expect(pay).toHaveAttribute("data-referral", "");
  });

  // "Later" has to actually mean later: the bar goes, the stored intent goes, and the query string
  // goes too — otherwise a refresh brings the whole thing straight back.
  it("forgets the intent and cleans the URL when dismissed", async () => {
    const user = userEvent.setup();
    atUrl("?subscribe=1&plan=pro&cycle=monthly#pricing");
    const { container } = renderBar();
    await screen.findByText("Pro plan ready for checkout");

    await user.click(screen.getByRole("button", { name: "Later" }));

    expect(container).toBeEmptyDOMElement();
    expect(readPendingSubscription()).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.pathname + window.location.hash).toBe("/dashboard#pricing");
  });

  it("offers every plan we sell in the picker", async () => {
    atUrl("?subscribe=1&plan=pro&cycle=monthly");
    renderBar();
    await screen.findByText("Pro plan ready for checkout");

    const options = screen.getByLabelText("Subscription plan").querySelectorAll("option");
    expect([...options].map((option) => option.textContent)).toEqual(["Starter", "Pro", "Elite"]);
  });
});
