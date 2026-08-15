// The rail across the top of every slide and the tape along its foot.
//
// These replaced the only fabricated figures left in the hero: a rail of five invented index levels
// ("S&P BSE SENSEX 81,204 ▲0.6%") and a tape of eight invented quotes, two of them showing falls,
// on all four slides. So the first thing this suite is for is the property that made the change
// worth making — that when there is nothing real to show, nothing is shown.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MINT, SAND } from "../../app/components/hero-scenes";
import { HeroTickerProvider, TopMoversRail, TopMoversTape, weekLabel } from "../../app/components/hero-ticker";

const STOCKS = [
  {
    symbol: "BOSCHLTD",
    name: "Bosch Ltd",
    weekPercent: 12.0512,
    sector: "Auto",
    direction: "gainer" as const,
    returnPercent: 12.0512,
    returns: { oneWeek: 12.0512, threeMonth: 18.2, sixMonth: 31.4, oneYear: 55.7, threeYear: 92.5, fiveYear: 141.8, overall: 620.3 },
  },
  {
    symbol: "IDEA",
    name: "Vodafone Idea Ltd",
    weekPercent: 10.59,
    sector: "Telecommunication",
    direction: "gainer" as const,
    returnPercent: 10.59,
    returns: { oneWeek: 10.59, threeMonth: -4.2, sixMonth: 11.6, oneYear: 26.1, threeYear: null, fiveYear: null, overall: -12.4 },
  },
  {
    symbol: "POWERINDIA",
    name: "Hitachi Energy India Ltd",
    weekPercent: 9.52,
    sector: "Power",
    direction: "gainer" as const,
    returnPercent: 9.52,
    returns: { oneWeek: 9.52, threeMonth: 14.9, sixMonth: 35.5, oneYear: 78.2, threeYear: 210.4, fiveYear: 515.6, overall: 880.9 },
  },
  {
    symbol: "LGEINDIA",
    name: "LG Electronics India Ltd",
    weekPercent: 9.2,
    sector: "Consumer Durables",
    direction: "gainer" as const,
    returnPercent: 9.2,
    returns: { oneWeek: 9.2, threeMonth: 12.5, sixMonth: null, oneYear: null, threeYear: null, fiveYear: null, overall: 16.3 },
  },
  {
    symbol: "SOLARINDS",
    name: "Solar Industries India Ltd",
    weekPercent: 8.59,
    sector: "Chemicals",
    direction: "gainer" as const,
    returnPercent: 8.59,
    returns: { oneWeek: 8.59, threeMonth: 22.7, sixMonth: 44.1, oneYear: 89.4, threeYear: 300.2, fiveYear: 930.5, overall: 2500.4 },
  },
  {
    symbol: "LICI",
    name: "Life Insurance Corporation of India",
    weekPercent: 5.32,
    sector: "Insurance",
    direction: "gainer" as const,
    returnPercent: 5.32,
    returns: { oneWeek: 5.32, threeMonth: 8.1, sixMonth: 13.9, oneYear: 21.4, threeYear: 48.7, fiveYear: null, overall: 32.2 },
  },
];

function renderRail(stocks = STOCKS) {
  return render(
    <HeroTickerProvider stocks={stocks}>
      <TopMoversRail palette={MINT} />
    </HeroTickerProvider>,
  );
}

function renderTape(stocks = STOCKS) {
  return render(
    <HeroTickerProvider stocks={stocks}>
      <TopMoversTape palette={SAND} />
    </HeroTickerProvider>,
  );
}

describe("weekLabel", () => {
  it("writes the weekly return to two places, always signed", () => {
    expect(weekLabel(12.0512)).toBe("▲ 12.05%");
    expect(weekLabel(5)).toBe("▲ 5.00%");
  });
});

describe("TopMoversRail", () => {
  it("puts each company's full name on the top line inside the pill", () => {
    renderRail();

    expect(screen.getAllByText("Bosch Ltd").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vodafone Idea Ltd").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BOSCHLTD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("▲ 12.05%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("IDEA").length).toBeGreaterThan(0);
  });

  /**
   * A readable name rather than a crowded label, and the logo rather than nothing.
   *
   * This strip rotates in one row, so long legal names are shortened in the pill while the full
   * company name stays in the title.
   */
  it("puts each company's own mark before its ticker", () => {
    renderRail();

    // The same CompanyLogo the boards use: the ticker store's real image, falling back to the
    // company's own favicon and then to a drawn monogram, so never a broken frame.
    expect(screen.getAllByAltText(/\(BOSCHLTD\) logo$/).length).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/\(IDEA\) logo$/).length).toBeGreaterThan(0);
  });

  it("shows the richer BSE stock detail on the below-slider ribbon", () => {
    renderRail();

    expect(screen.getAllByText("Bosch Ltd").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Auto").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gain +12.05%").length).toBeGreaterThan(0);
  });

  it("shortens long company names in the rotating card", () => {
    renderRail();

    expect(screen.getAllByText("Solar Inds").length).toBeGreaterThan(0);
    expect(screen.queryByText("Solar Industries India Ltd")).not.toBeInTheDocument();
  });

  it("takes five, however many it is given", () => {
    const { container } = renderRail();

    expect(container.querySelector(".animate-marquee")).toBeNull();
    expect(container.querySelector(".animate-hero-rail-marquee")).not.toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(10);
    // Sixth by weekly return, so the first one cut.
    expect(screen.queryByText("LICI")).not.toBeInTheDocument();
  });

  it("draws nothing at all when the exchange could not be read", () => {
    const { container } = renderRail([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TopMoversTape", () => {
  it("shows each company as a rich rotating card, with its mark and default weekly return", () => {
    renderTape();

    expect(screen.getAllByText("Bosch Ltd").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Life Insurance Corp of").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gain 1W +12.1%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("▲ 5.32%").length).toBeGreaterThan(0);
  });

  it("renders a continuous rotating row that pauses from the ribbon panel", () => {
    const { container } = renderTape();

    const panel = container.querySelector(".hover-pause-marquee") as HTMLElement;
    const row = container.querySelector(".animate-hero-ribbon-marquee") as HTMLElement;
    expect(container.querySelector(".animate-marquee")).toBeNull();
    expect(panel).not.toBeNull();
    expect(row).not.toBeNull();
    expect(row.children).toHaveLength(STOCKS.length * 2);
    expect(row.children[0]).toHaveClass("w-fit");
    expect(within(row).getAllByText("Bosch Ltd", { ignore: '[aria-hidden="true"] *' })).toHaveLength(1);
  });

  it("shows the selected return window inside each rotating stock card", () => {
    renderTape();

    const select = screen.getByRole("combobox", { name: "Return period for BOSCHLTD" });
    expect(within(select).getByRole("option", { name: "3M" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "threeMonth" } });

    expect(screen.getAllByText("Gain 3M +18.2%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+18.2%").length).toBeGreaterThan(0);
    expect(screen.queryByText("NA")).not.toBeInTheDocument();
  });

  it("only offers periods with measured return values", () => {
    renderTape();

    const select = screen.getByRole("combobox", { name: "Return period for IDEA" });
    expect(within(select).getByRole("option", { name: "Overall" })).toBeInTheDocument();
    expect(within(select).queryByRole("option", { name: "3Y" })).not.toBeInTheDocument();
    expect(screen.queryByText("NA")).not.toBeInTheDocument();
  });

  it("keeps every card readable to assistive technology", () => {
    const { container } = renderTape();
    const row = container.querySelector(".animate-hero-ribbon-marquee") as HTMLElement;
    const items = Array.from(row.children);

    expect(items).toHaveLength(STOCKS.length * 2);
    expect(items.filter((item) => item.getAttribute("aria-hidden") === "true")).toHaveLength(STOCKS.length);
    expect(within(row).getAllByText("Bosch Ltd", { ignore: '[aria-hidden="true"] *' })).toHaveLength(1);
  });

  it("draws nothing at all when the exchange could not be read", () => {
    const { container } = renderTape([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("HeroTickerProvider", () => {
  // A scene rendered outside the provider — every scene, until the carousel wraps them — must get
  // an empty list rather than crash on an undefined context.
  it("defaults to an empty list, so a scene outside it simply has no strips", () => {
    const { container } = render(<TopMoversRail palette={MINT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("defaults to an empty list when mounted without stocks", () => {
    const { container } = render(
      <HeroTickerProvider>
        <TopMoversTape palette={SAND} />
      </HeroTickerProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
