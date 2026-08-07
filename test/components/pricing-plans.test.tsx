import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PLANS, PricingPlans, rupees, yearlyPrice, yearlySaving } from "../../app/components/pricing-plans";

describe("pricing arithmetic", () => {
  // Ten months for twelve is the standard annual discount here, and deriving it means the
  // advertised saving can never drift from the advertised price.
  it("charges ten months on the annual cycle", () => {
    expect(yearlyPrice(299)).toBe(2990);
    expect(yearlyPrice(799)).toBe(7990);
  });

  it("saves exactly the two months it claims", () => {
    expect(yearlySaving(299)).toBe(299 * 2);
    expect(yearlySaving(1999)).toBe(1999 * 2);
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
    expect(screen.getByText("2 months free")).toBeInTheDocument();

    const starter = screen.getByText("Starter").closest<HTMLElement>("div.rounded-3xl")!;
    // ₹2,990 over twelve months is ₹249 a month, which is the figure worth comparing.
    expect(within(starter).getByText("₹249")).toBeInTheDocument();
    expect(within(starter).getByText(/₹2,990/)).toBeInTheDocument();
    expect(within(starter).getByText("₹598")).toBeInTheDocument();
  });

  it("switches every plan to the monthly rate together", async () => {
    const user = userEvent.setup();
    render(<PricingPlans />);

    await user.click(screen.getByRole("button", { name: "Monthly" }));

    const starter = screen.getByText("Starter").closest<HTMLElement>("div.rounded-3xl")!;
    expect(within(starter).getByText("₹299")).toBeInTheDocument();
    expect(within(starter).getByText(/Billed monthly/)).toBeInTheDocument();

    const pro = screen.getByText("Pro").closest<HTMLElement>("div.rounded-3xl")!;
    expect(within(pro).getByText("₹799")).toBeInTheDocument();
  });

  // Both cycles quote a per-month figure, so the reader is never comparing a month against a year.
  it("quotes every plan per month on both cycles", async () => {
    const user = userEvent.setup();
    render(<PricingPlans />);

    expect(screen.getAllByText("/month")).toHaveLength(PLANS.length);
    await user.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getAllByText("/month")).toHaveLength(PLANS.length);
  });

  it("marks the most popular plan and links each plan to signup", () => {
    render(<PricingPlans />);

    expect(screen.getByText("Most popular").closest("div.rounded-3xl")).toHaveTextContent("Pro");
    expect(screen.getByRole("link", { name: "Choose Elite" })).toHaveAttribute("href", "/signup");
  });

  it("says the exchange data is the same on every plan", () => {
    render(<PricingPlans />);
    expect(screen.getByText(/Exchange data is the same on every plan/)).toBeInTheDocument();
  });
});
