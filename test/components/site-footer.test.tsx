import { render, screen } from "@testing-library/react";
import { SiteFooter } from "../../app/components/site-footer";

describe("SiteFooter", () => {
  it("renders the logo, all footer columns/links, the disclaimer and the copyright line", () => {
    render(<SiteFooter />);

    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.getByText(/For research purposes only/)).toBeInTheDocument();

    expect(screen.getByText("Markets & Data")).toBeInTheDocument();
    expect(screen.getByText("AI Tools")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();

    const marketPulse = screen.getByRole("link", { name: "Market Pulse" });
    expect(marketPulse).toHaveAttribute("href", "#market-pulse");

    const signUp = screen.getByRole("link", { name: "Sign up" });
    expect(signUp).toHaveAttribute("href", "/signup");

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("href", "/dashboard");

    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} Stockers.AI`))).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Back to top/ })).toHaveAttribute("href", "#");
  });
});
