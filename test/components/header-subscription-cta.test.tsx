import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderSubscriptionCta } from "../../app/components/header-subscription-cta";
import { SubscriptionProvider } from "../../app/components/subscription-provider";

// The real button opens Razorpay's checkout. Here it only has to record the plan and cycle the
// panel handed it, which is the whole of the contract between the two.
jest.mock("../../app/components/razorpay-checkout", () => ({
  SubscribeButton: ({ plan, cycle, label, className }: { plan: string; cycle: string; label: string; className: string }) => (
    <button type="button" className={className} data-plan={plan} data-cycle={cycle}>
      {label}
    </button>
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const baseStatus = {
  state: "trial",
  allowed: true,
  isAdmin: false,
  tier: "pro",
  planName: "Pro",
  marketDaysUsed: 1,
  marketDaysLeft: 4,
  trialStartedAt: "2026-08-01T04:00:00.000Z",
  subscribedUntil: null,
  today: "2026-08-05",
  locks: {},
  features: [],
  signedIn: true,
  name: "Aarav",
};

function renderCta(overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...baseStatus, ...overrides }),
  }) as unknown as typeof fetch;

  return render(
    <SubscriptionProvider>
      <HeaderSubscriptionCta />
    </SubscriptionProvider>,
  );
}

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /Buy plan/ }));
  return screen.findByText("Choose plan and billing");
};

describe("HeaderSubscriptionCta", () => {
  it("starts closed, showing only the trigger", () => {
    renderCta();
    expect(screen.getByRole("button", { name: /Buy plan/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Choose plan and billing")).not.toBeInTheDocument();
  });

  it("opens the panel on click and closes it again on a second click", async () => {
    const user = userEvent.setup();
    renderCta();

    await openPanel(user);
    expect(screen.getByRole("button", { name: /Buy plan/ })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: /Buy plan/ }));
    expect(screen.queryByText("Choose plan and billing")).not.toBeInTheDocument();
  });

  // The panel is a child of the header's control row, which sets `whitespace-nowrap` so the
  // buttons beside it do not break mid-label. That inherits, and without resetting it here the
  // payment note runs straight out past the panel's rounded edge instead of wrapping.
  it("lets its prose wrap rather than inheriting the header's nowrap", async () => {
    const user = userEvent.setup();
    renderCta();
    const heading = await openPanel(user);

    const panel = heading.closest("div")?.parentElement?.parentElement;
    expect(panel).toHaveClass("whitespace-normal");
    expect(screen.getByText(/UPI, cards and netbanking/)).toBeInTheDocument();
  });

  /**
   * The panel opens on the cheapest way in, not the dearest.
   *
   * Both halves matter and neither is cosmetic: a pricing panel that arrives pre-set to the
   * costliest plan on the longest commitment is asking the reader to notice what they were
   * defaulted into before they can trust the figure under it. Starter, monthly, is the honest
   * starting point — every other combination is one click away.
   */
  it("opens on the monthly cycle with Starter selected, and prices both", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    expect(screen.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByRole("button", { name: /^Starter/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Pro/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Elite/ })).toHaveAttribute("aria-pressed", "false");

    // Starter is ₹149/mo, and on the monthly cycle that is both what is payable now and the
    // per-month figure beside it.
    expect(screen.getByText("₹149")).toBeInTheDocument();
    expect(screen.getAllByText("₹149/mo").length).toBeGreaterThan(0);
    // The annual saving line belongs to the yearly cycle only.
    expect(screen.queryByText(/Annual billing saves/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy Starter" })).toBeInTheDocument();
  });

  it("switches every price when the billing cycle changes", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: "Yearly" }));

    // Starter is ₹149/mo billed monthly; the yearly cycle is nine months for twelve, so ₹1,341
    // payable now and ₹112/mo equivalent.
    expect(screen.getByText("₹1,341")).toBeInTheDocument();
    expect(screen.getAllByText("₹112/mo").length).toBeGreaterThan(0);
  });

  it("names the annual saving on the yearly cycle", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: "Yearly" }));

    // Twelve months at ₹149 is ₹1,788; nine of them is ₹1,341, so ₹447 stays in the pocket.
    expect(screen.getByText(/Annual billing saves/)).toBeInTheDocument();
    expect(screen.getByText("₹447")).toBeInTheDocument();
  });

  it("reprices when another plan is picked", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    // Anchored, because once Pro is selected the checkout button is named "Buy Pro" and an
    // unanchored match finds the tile and the CTA both.
    await user.click(screen.getByRole("button", { name: /^Pro/ }));

    expect(screen.getByRole("button", { name: /^Pro/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Starter/ })).toHaveAttribute("aria-pressed", "false");
    // Pro is ₹399/mo, and the panel is still on the monthly cycle it opened with.
    expect(screen.getByText("₹399")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy Pro" })).toBeInTheDocument();
  });

  it("hands the selected plan and cycle to the checkout button", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    // Both moved off the defaults, so this proves the handoff rather than restating them.
    await user.click(screen.getByRole("button", { name: /^Elite/ }));
    await user.click(screen.getByRole("button", { name: "Yearly" }));

    const checkout = screen.getByRole("button", { name: "Buy Elite" });
    expect(checkout).toHaveAttribute("data-plan", "elite");
    expect(checkout).toHaveAttribute("data-cycle", "yearly");
  });

  // Someone who is not signed in has to make an account before they can be charged, and the
  // button says so rather than dropping them into a checkout that cannot complete.
  it("asks a signed-out visitor to create an account first", async () => {
    const user = userEvent.setup();
    renderCta({ signedIn: false, state: "none", allowed: false, tier: null, planName: null });
    await openPanel(user);

    expect(screen.getByRole("button", { name: "Create account & buy" })).toBeInTheDocument();
    // "Buy plan" is the trigger and stays; what must not appear is a checkout naming a plan.
    expect(screen.queryByRole("button", { name: /^Buy (Starter|Pro|Elite)$/ })).not.toBeInTheDocument();
  });

  it("closes when a click lands outside the panel", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    await user.click(document.body);

    await waitFor(() => expect(screen.queryByText("Choose plan and billing")).not.toBeInTheDocument());
  });

  it("stays open while the click is inside the panel", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    await user.click(screen.getByText("Choose plan and billing"));

    expect(screen.getByText("Choose plan and billing")).toBeInTheDocument();
  });

  // The outside-click listener is only attached while the panel is open, and has to come off with
  // it — otherwise every closed CTA on the page keeps a handler on window for the session.
  it("detaches the outside-click listener once closed", async () => {
    const user = userEvent.setup();
    const remove = jest.spyOn(window, "removeEventListener");
    renderCta();

    await openPanel(user);
    await user.click(document.body);

    await waitFor(() => expect(remove).toHaveBeenCalledWith("mousedown", expect.any(Function)));
  });

  it("names Razorpay as the processor", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    expect(screen.getByText("Razorpay")).toBeInTheDocument();
    expect(screen.getByText(/verified server-side before access is granted/)).toBeInTheDocument();
  });
});
