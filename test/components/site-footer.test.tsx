import { render, screen } from "@testing-library/react";
import { SiteFooter } from "../../app/components/site-footer";

// `SiteFooter` is an async server component: the copyright year is read inside a `use cache` scope
// rather than straight into the markup, because under Cache Components `new Date()` in a
// prerendered tree fails the build. So it is called and awaited here rather than rendered as an
// element — `render(<SiteFooter />)` would hand an async function to the client renderer, which
// only knows how to render synchronous components.
describe("SiteFooter", () => {
  it("renders the logo, every column, the copyright line and the back-to-top link", async () => {
    render(await SiteFooter());

    expect(screen.getByText("Stockers")).toBeInTheDocument();
    expect(screen.getByText(/For research purposes only/)).toBeInTheDocument();

    expect(screen.getByText("Markets & Data")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Legal")).toBeInTheDocument();

    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} StockersAI`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to top/ })).toHaveAttribute("href", "#");
  });

  /**
   * The footer appears on the policy and account pages too, not only the landing page. A bare
   * fragment like `#market-pulse` is a link that quietly does nothing from any of those, which is
   * worse than no link — so every destination is absolute.
   */
  it("points every link at a real route rather than a bare fragment", async () => {
    render(await SiteFooter());

    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      // The back-to-top control is the one deliberate fragment.
      if (link.textContent?.includes("Back to top")) continue;
      expect(href.startsWith("/")).toBe(true);
    }
  });

  it("links the four policy pages", async () => {
    render(await SiteFooter());

    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refund-policy");
    expect(screen.getByRole("link", { name: "Return Policy" })).toHaveAttribute("href", "/return-policy");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
    expect(screen.getAllByRole("link", { name: /Disclaimer|read the disclaimer/ })[0]).toHaveAttribute(
      "href",
      "/disclaimer",
    );
  });

  it("links About Us and Contact Us", async () => {
    render(await SiteFooter());

    expect(screen.getByRole("link", { name: "About Us" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Contact Us" })).toHaveAttribute("href", "/contact");
  });

  // The one line a regulator expects to find in the footer of an Indian markets product.
  it("carries the registration disclaimer on every page it appears on", async () => {
    render(await SiteFooter());

    expect(screen.getByText(/Not a SEBI-registered investment adviser/)).toBeInTheDocument();
  });

  it("sends market links to crawlable section routes", async () => {
    render(await SiteFooter());

    expect(screen.getByRole("link", { name: "Live BSE market" })).toHaveAttribute("href", "/live-market");
    expect(screen.getByRole("link", { name: "BSE gainers & losers" })).toHaveAttribute("href", "/bse-gainers-losers");
    expect(screen.getByRole("link", { name: "AI market pulse" })).toHaveAttribute("href", "/market-pulse");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  });
});
