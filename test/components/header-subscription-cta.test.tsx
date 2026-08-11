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

  it("opens on the yearly cycle with Pro selected, and prices both", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    expect(screen.getByRole("button", { name: "Yearly" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "false");

    // Pro is ₹399/mo billed monthly; the yearly cycle is nine months for twelve, so ₹3,591
    // payable now and ₹299/mo equivalent.
    expect(screen.getByText("₹3,591")).toBeInTheDocument();
    expect(screen.getAllByText("₹299/mo").length).toBeGreaterThan(0);
  });

  it("switches every price when the billing cycle changes", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: "Monthly" }));

    expect(screen.getByText("₹399")).toBeInTheDocument();
    expect(screen.getAllByText("₹399/mo").length).toBeGreaterThan(0);
    // The annual saving line belongs to the yearly cycle only.
    expect(screen.queryByText(/Annual billing saves/)).not.toBeInTheDocument();
  });

  it("names the annual saving on the yearly cycle", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    // Twelve months at ₹399 is ₹4,788; nine of them is ₹3,591, so ₹1,197 stays in the pocket.
    expect(screen.getByText(/Annual billing saves/)).toBeInTheDocument();
    expect(screen.getByText("₹1,197")).toBeInTheDocument();
  });

  it("reprices when another plan is picked", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    // Anchored, because once Starter is selected the checkout button is named "Buy Starter" and
    // an unanchored match finds the tile and the CTA both.
    await user.click(screen.getByRole("button", { name: /^Starter/ }));

    // Starter is ₹149/mo, so ₹1,341 for the year and ₹112 a month equivalent.
    expect(screen.getByRole("button", { name: /^Starter/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("₹1,341")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buy Starter" })).toBeInTheDocument();
  });

  it("hands the selected plan and cycle to the checkout button", async () => {
    const user = userEvent.setup();
    renderCta();
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: /^Elite/ }));
    await user.click(screen.getByRole("button", { name: "Monthly" }));

    const checkout = screen.getByRole("button", { name: "Buy Elite" });
    expect(checkout).toHaveAttribute("data-plan", "elite");
    expect(checkout).toHaveAttribute("data-cycle", "monthly");
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
