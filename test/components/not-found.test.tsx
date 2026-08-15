import { render, screen, within } from "@testing-library/react";
import NotFound, { metadata } from "../../app/not-found";
import { HOME_SECTION_ROUTES } from "../../app/lib/section-routes";
import { ThemeProvider } from "../../app/lib/theme-provider";

// The footer is an async server component since the copyright year moved into a `use cache` scope,
// and the client renderer used here cannot render one. It has its own suite.
jest.mock("../../app/components/site-footer", () => ({
  SiteFooter: () => <footer data-testid="site-footer" />,
}));

describe("the 404 page", () => {
  // The page mounts the shared auth header, which reads the theme from context.
  const renderPage = () =>
    render(
      <ThemeProvider>
        <NotFound />
      </ThemeProvider>,
    );

  it("names the status code, so a reader recognises what happened", () => {
    renderPage();

    expect(screen.getByText("Error 404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("That page isn't here");
  });

  /**
   * A 404 is routine, and the common cause is a stale link rather than anything being broken.
   * Saying so stops a reader concluding the site is down and leaving.
   */
  it("says nothing is broken", () => {
    renderPage();

    expect(screen.getByText(/Nothing is wrong with your connection/)).toBeInTheDocument();
  });

  it("offers a way back and a way to report it", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Back to the market" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Tell us what you were looking for/ })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  /**
   * The suggestions are read from `HOME_SECTION_ROUTES` rather than hand-listed, so a section added
   * later appears here without anybody remembering to add it. This asserts that wiring.
   */
  it("suggests every public section route", () => {
    renderPage();

    const list = screen.getByRole("heading", { name: /pick up where you meant to/i }).closest("section")!;

    for (const route of HOME_SECTION_ROUTES) {
      expect(within(list).getByRole("link", { name: new RegExp(route.label, "i") })).toHaveAttribute(
        "href",
        route.path,
      );
    }
  });

  /**
   * The one that protects the crawl budget. Many URLs answering with one page is a soft-404
   * pattern, and letting it be indexed is how a site's crawl allowance is quietly spent on
   * addresses that do not exist. `follow` stays on so the suggestions are still worth having.
   */
  it("is marked noindex, follow", () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
