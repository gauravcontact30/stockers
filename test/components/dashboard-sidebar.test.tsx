import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DASHBOARD_SECTIONS,
  DashboardSectionTabs,
  DashboardSidebar,
  isAiSection,
  isDashboardSectionId,
  SECTION_BY_ID,
} from "../../app/components/dashboard-sidebar";

const STORAGE_KEY = "stockers-sidebar-collapsed";

describe("DashboardSidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists every dashboard section with its label visible while expanded", () => {
    render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);

    for (const section of DASHBOARD_SECTIONS) {
      expect(screen.getByRole("button", { name: section.label })).toBeInTheDocument();
    }
    // Labels are shown inline, so no hover tooltip is needed (or rendered) in this state.
    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("AI workspace")).toBeInTheDocument();
  });

  it("marks the open section as the current page", () => {
    render(<DashboardSidebar active="top-picks" onSelect={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Top Picks" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("reports the picked section to its parent", async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<DashboardSidebar active="overview" onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Dip Winners" }));
    expect(onSelect).toHaveBeenCalledWith("dip-winners");
  });

  it("collapses to an icon rail with a hover tooltip per section, and expands again", async () => {
    const user = userEvent.setup();
    const { container } = render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);
    const aside = container.querySelector("aside");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(screen.queryByText("AI workspace")).not.toBeInTheDocument();
    // The label survives only as a tooltip, one per section, still reachable by name.
    expect(screen.getAllByRole("tooltip")).toHaveLength(DASHBOARD_SECTIONS.length);
    expect(screen.getByRole("tooltip", { name: "ETF Research" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ETF Research" })).toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    await user.click(expandButton);

    expect(aside).toHaveAttribute("data-collapsed", "false");
    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);
  });

  it("remembers the collapsed rail across visits", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    unmount();

    const { container } = render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);
    expect(container.querySelector("aside")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  // Private-mode browsers throw on localStorage access. The sidebar must still render — it just
  // forgets the preference.
  it("falls back to the expanded sidebar when the stored preference can't be read", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const { container } = render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);
    expect(container.querySelector("aside")).toHaveAttribute("data-collapsed", "false");
  });

  it("stays usable when the preference can't be written", async () => {
    const user = userEvent.setup();
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    const { container } = render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(container.querySelector("aside")).toHaveAttribute("data-collapsed", "true");
  });
});

describe("DashboardSectionTabs", () => {
  it("offers the same sections as a phone-friendly strip", async () => {
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<DashboardSectionTabs active="compare" onSelect={onSelect} />);

    expect(screen.getAllByRole("button")).toHaveLength(DASHBOARD_SECTIONS.length);
    expect(screen.getByRole("button", { name: "Compare" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Overview" })).not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", { name: "Market Pulse" }));
    expect(onSelect).toHaveBeenCalledWith("market-pulse");
  });
});

describe("isDashboardSectionId", () => {
  it("accepts a known section id and rejects anything else", () => {
    expect(isDashboardSectionId("buy-tomorrow")).toBe(true);
    expect(isDashboardSectionId("pricing")).toBe(false);
  });
});

describe("sidebar grouping", () => {
  // Seventeen destinations in one flat column is a list nobody reads; grouped, the reader picks a
  // kind of question first.
  it("heads each family of sections while expanded", () => {
    render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);

    const nav = within(screen.getByRole("navigation", { name: "Dashboard sections" }));
    expect(nav.getByText("Workspace")).toBeInTheDocument();
    expect(nav.getByText("AI screeners")).toBeInTheDocument();
    expect(nav.getByText("Exchange boards")).toBeInTheDocument();
    expect(nav.getByText("Help")).toBeInTheDocument();
  });

  it("carries every board and the help section as its own destination", () => {
    render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);

    const nav = within(screen.getByRole("navigation", { name: "Dashboard sections" }));
    for (const label of ["Company Directory", "Sector Trends", "Most Traded", "MTF Watch", "Stocks in News", "Dividends", "IPO Watch", "ETF Board", "Getting Started"]) {
      expect(nav.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  // Collapsed there is no room for a heading, so a hairline keeps the grouping readable.
  it("swaps the group headings for dividers on the icon rail", async () => {
    const user = userEvent.setup();
    render(<DashboardSidebar active="overview" onSelect={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const nav = screen.getByRole("navigation", { name: "Dashboard sections" });
    expect(within(nav).queryByText("Exchange boards")).not.toBeInTheDocument();
    // One divider per group after the first.
    expect(nav.querySelectorAll("div.border-t")).toHaveLength(3);
  });

  it("groups the compact phone strip the same way", () => {
    render(<DashboardSectionTabs active="overview" onSelect={jest.fn()} />);

    const nav = within(screen.getByRole("navigation", { name: "Dashboard sections (compact)" }));
    expect(nav.getByText("Exchange boards")).toBeInTheDocument();
    expect(nav.getByRole("button", { name: /Getting Started/ })).toBeInTheDocument();
  });
});

describe("isAiSection", () => {
  it("is true only for a section with an AI layer to gate", () => {
    expect(isAiSection(SECTION_BY_ID["market-pulse"])).toBe(true);
    expect(isAiSection(SECTION_BY_ID.dividends)).toBe(true);
    expect(isAiSection(SECTION_BY_ID.overview)).toBe(false);
    expect(isAiSection(SECTION_BY_ID.support)).toBe(false);
  });

  // The exchange boards were public before they moved in and stay public: only the AI layer locks.
  it("leaves every moved-in board ungated", () => {
    for (const id of ["directory", "sectors", "most-traded", "mtf", "stock-news", "dividends", "ipos", "etf-board"] as const) {
      const section = SECTION_BY_ID[id];
      expect(isAiSection(section) && section.gate).toBe(false);
    }
  });
});
