import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLANS, PricingPlans, rupees, yearlyPrice, yearlySaving } from "../../app/components/pricing-plans";

describe("pricing arithmetic", () => {
  // Nine months for twelve is the annual discount, and deriving it means the advertised saving can
  // never drift from the advertised price.
  it("charges nine months on the annual cycle", () => {
    expect(yearlyPrice(149)).toBe(1341);
    expect(yearlyPrice(399)).toBe(3591);
  });

  it("saves exactly the three months it claims", () => {
    expect(yearlySaving(149)).toBe(149 * 3);
    expect(yearlySaving(899)).toBe(899 * 3);
  });

  it("formats rupees the Indian way", () => {
    expect(rupees(19990)).toBe("₹19,990");
    expect(rupees(299)).toBe("₹299");
  });
});

describe("PricingPlans", () => {
  it("offers exactly one recommended plan", () => {
    expect(PLANS.filter((plan) => plan.featured)).toHaveLength(1);
  });

  it("gives every plan its own colour so none reads as a copy of the next", () => {
    const washes = new Set(PLANS.map((plan) => plan.chrome));
    expect(washes.size).toBe(PLANS.length);
  });

  it("opens on the yearly cycle with the discount stated", () => {
    render(<PricingPlans />);

    expect(screen.getByRole("button", { name: /Yearly/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("3 months free")).toBeInTheDocument();

    const starter = screen.getAllByText("Starter")[0].closest<HTMLElement>("div.rounded-3xl")!;
    // ₹1,341 over twelve months is ₹112 a month, which is the figure worth comparing.
    expect(within(starter).getByText("₹112")).toBeInTheDocument();
    expect(within(starter).getByText(/₹1,341/)).toBeInTheDocument();
    expect(within(starter).getByText("₹447")).toBeInTheDocument();
  });

  it("switches every plan to the monthly rate together", async () => {
    const user = userEvent.setup();
    render(<PricingPlans />);

    await user.click(screen.getByRole("button", { name: "Monthly" }));

    const starter = screen.getAllByText("Starter")[0].closest<HTMLElement>("div.rounded-3xl")!;
    expect(within(starter).getByText("₹149")).toBeInTheDocument();
    expect(within(starter).getByText(/Billed monthly/)).toBeInTheDocument();

    const pro = screen.getAllByText("Pro")[0].closest<HTMLElement>("div.rounded-3xl")!;
    expect(within(pro).getByText("₹399")).toBeInTheDocument();
  });

  // Both cycles quote a per-month figure, so the reader is never comparing a month against a year.
  it("quotes every plan per month on both cycles", async () => {
    const user = userEvent.setup();
    render(<PricingPlans />);

    expect(screen.getAllByText("/month")).toHaveLength(PLANS.length);
    await user.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getAllByText("/month")).toHaveLength(PLANS.length);
  });

  it("marks the most popular plan and offers every plan a way to subscribe", () => {
    render(<PricingPlans />);

    expect(screen.getByText("Most popular").closest("div.rounded-3xl")).toHaveTextContent("Pro");
    // Rendered outside the subscription provider the status is unknown, so the button is the
    // optimistic one — the checkout it opens is what 401s a signed-out visitor, not the markup.
    expect(screen.getByRole("button", { name: "Choose Elite" })).toBeInTheDocument();
  });

  // The payment server prices a plan by its key, so a plan whose key drifted would charge for
  // something else entirely.
  it("gives every plan the key the payment server prices it by", () => {
    expect(PLANS.map((plan) => plan.key)).toEqual(["starter", "pro", "elite"]);
  });

  it("says the exchange data is the same on every plan", () => {
    render(<PricingPlans />);
    expect(screen.getByText(/Exchange data is the same on every plan/)).toBeInTheDocument();
  });

  it("shows AI feature categories with top-three star ranks", () => {
    render(<PricingPlans />);

    expect(screen.getByRole("heading", { name: "AI features by plan" })).toBeInTheDocument();
    expect(screen.getByText("All Starter AI features included")).toBeInTheDocument();
    expect(screen.getByText("All Starter + Pro AI features included.")).toBeInTheDocument();
    expect(screen.getByLabelText("6 Starter AI features. Starter AI features")).toBeInTheDocument();
    expect(screen.getByLabelText("6 Pro AI features. All Starter AI features included")).toBeInTheDocument();
    expect(screen.getByLabelText("6 Elite AI features. All Starter + Pro AI features included.")).toBeInTheDocument();
    expect(screen.getAllByText("AI market pulse")).toHaveLength(1);
    expect(screen.getAllByText("Today's AI picks")).toHaveLength(1);
    expect(screen.getByText("AI intelligence search")).toBeInTheDocument();
    expect(screen.getAllByLabelText("3 star Rank 1")).toHaveLength(3);
    expect(screen.getAllByLabelText("2 star Rank 2")).toHaveLength(3);
    expect(screen.getAllByLabelText("1 star Rank 3")).toHaveLength(3);
  });
});
