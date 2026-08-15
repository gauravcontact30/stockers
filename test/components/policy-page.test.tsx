import { render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "../../app/lib/theme-provider";
import {
  POLICY_PAGES,
  PolicyCallout,
  PolicyList,
  PolicyPage,
  PolicySection,
  PolicyTable,
} from "../../app/components/policy-page";

// `SiteFooter` became an async server component when the copyright year moved into a `use cache`
// scope, and the client renderer these tests use cannot render one. Stubbed rather than awaited,
// because nothing in this suite is about the footer — it has its own, which renders the real thing.
jest.mock("../../app/components/site-footer", () => ({
  SiteFooter: () => <footer data-testid="site-footer" />,
}));

describe("POLICY_PAGES", () => {
  it("names all four policies, each at its own route", () => {
    expect(POLICY_PAGES.map((page) => page.href)).toEqual([
      "/refund-policy",
      "/return-policy",
      "/privacy-policy",
      "/disclaimer",
    ]);
    expect(new Set(POLICY_PAGES.map((page) => page.label)).size).toBe(4);
  });
});

describe("PolicySection", () => {
  it("renders its heading as a real heading, so the page has an outline", () => {
    render(
      <PolicySection title="The short version">
        <p>Body copy.</p>
      </PolicySection>,
    );

    expect(screen.getByRole("heading", { name: "The short version", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Body copy.")).toBeInTheDocument();
  });
});

describe("PolicyList", () => {
  it("renders one list item per entry, including rich ones", () => {
    render(<PolicyList items={["Plain text", <strong key="b">Bold text</strong>]} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Plain text")).toBeInTheDocument();
    expect(screen.getByText("Bold text")).toBeInTheDocument();
  });
});

describe("PolicyTable", () => {
  it("renders the head as column headers and each row beneath", () => {
    render(
      <PolicyTable
        head={["Name", "Purpose"]}
        rows={[
          ["stockers_session", "Keeps you signed in"],
          ["stockers-theme", "Light or dark"],
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Purpose" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /stockers_session/ })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  // These carry long explanations, and a table that widens the page makes the document unreadable
  // on a phone. It has to scroll inside its own container instead.
  it("scrolls inside itself rather than widening the page", () => {
    const { container } = render(<PolicyTable head={["A"]} rows={[["one"]]} />);

    expect(container.firstElementChild).toHaveClass("overflow-x-auto");
  });
});

describe("PolicyCallout", () => {
  it("draws an ordinary callout in amber and a serious one in rose", () => {
    const { container, unmount } = render(<PolicyCallout>Ordinary</PolicyCallout>);
    expect(container.firstElementChild?.className).toContain("amber");
    unmount();

    const { container: serious } = render(<PolicyCallout tone="rose">Serious</PolicyCallout>);
    expect(serious.firstElementChild?.className).toContain("rose");
  });
});

describe("PolicyPage", () => {
  // The page mounts the shared site header, which reads the theme from context.
  const renderPage = (title = "Refund Policy") =>
    render(
      <ThemeProvider>
        <PolicyPage eyebrow="Legal" title={title} summary="What this page covers." updated="9 August 2026">
          <PolicySection title="A section">
            <p>Body.</p>
          </PolicySection>
        </PolicyPage>
      </ThemeProvider>,
    );

  it("puts the title in the page's only h1, above the summary and the date", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Refund Policy", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("What this page covers.")).toBeInTheDocument();
    expect(screen.getByText("Last updated 9 August 2026")).toBeInTheDocument();
  });

  it("renders the page's own body", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "A section", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Body.")).toBeInTheDocument();
  });

  /**
   * A reader who lands on one policy from a search result should be able to reach the other three
   * without hunting through the footer — and the one they are on should say so rather than
   * offering them a link back to where they already are.
   */
  it("links its three siblings and marks the current page", () => {
    renderPage("Privacy Policy");

    const nav = screen.getByRole("navigation", { name: "Other policies" });
    const current = within(nav).getByRole("link", { name: "Privacy Policy" });

    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Disclaimer" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
  });
});
