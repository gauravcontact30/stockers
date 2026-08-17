import { fireEvent, render, screen } from "@testing-library/react";
import { CompanyLogo, monogramText, monogramTone } from "../../app/components/company-logo";
import { normaliseTicker, stockLogoUrl } from "../../app/lib/company-logos";

describe("normaliseTicker", () => {
  it("upper-cases and trims", () => {
    expect(normaliseTicker("  reliance ")).toBe("RELIANCE");
  });

  it.each([
    ["TCS.NS", "TCS"],
    ["TCS.BO", "TCS"],
    ["TCS.NSE", "TCS"],
    ["TCS.BSE", "TCS"],
  ])("drops the exchange suffix on %s", (input, expected) => {
    expect(normaliseTicker(input)).toBe(expected);
  });

  it.each([
    ["IDEA-BE", "IDEA"],
    ["SUZLON-EQ", "SUZLON"],
    ["XYZ-BZ", "XYZ"],
    ["ABC-SM", "ABC"],
    ["ABC-ST", "ABC"],
    ["ABC-RT", "ABC"],
    ["ABC-IQ", "ABC"],
  ])("drops the series marker on %s", (input, expected) => {
    expect(normaliseTicker(input)).toBe(expected);
  });

  // A hyphen is part of plenty of real tickers, so only the known series endings are trimmed.
  it("leaves a hyphen that belongs to the ticker alone", () => {
    expect(normaliseTicker("BAJAJ-AUTO")).toBe("BAJAJ-AUTO");
    expect(normaliseTicker("M&M")).toBe("M&M");
  });
});

describe("stockLogoUrl", () => {
  it("builds a URL from the bare ticker", () => {
    expect(stockLogoUrl("RELIANCE")).toBe("https://images.dhan.co/symbol/RELIANCE.png");
  });

  it("escapes a ticker that carries an ampersand", () => {
    expect(stockLogoUrl("M&M")).toBe("https://images.dhan.co/symbol/M%26M.png");
  });

  it.each([[null], [undefined], [""], ["   "]])("returns nothing for %p", (value) => {
    expect(stockLogoUrl(value)).toBeNull();
  });

  // A company name is not a ticker; asking the store for one would just waste a request on a
  // guaranteed miss.
  it.each([["Tata Capital"], ["Juniper Green Energy Limited"], ["A-VERY-LONG-NAME-THAT-IS-NOT-A-TICKER"]])(
    "refuses to look up %s",
    (value) => {
      expect(stockLogoUrl(value)).toBeNull();
    },
  );
});

describe("monogramText", () => {
  it("takes the first three characters of the bare ticker", () => {
    expect(monogramText("RELIANCE")).toBe("REL");
    expect(monogramText("tcs.ns")).toBe("TCS");
  });

  it("falls back to a question mark when there is nothing to letter", () => {
    expect(monogramText("  ")).toBe("?");
  });
});

describe("monogramTone", () => {
  it("gives the same ticker the same colour every time", () => {
    expect(monogramTone("RELIANCE")).toBe(monogramTone("RELIANCE"));
  });

  it("spreads different tickers across the palette", () => {
    const tones = new Set(["RELIANCE", "TCS", "INFY", "SBIN", "ITC", "WIPRO", "HDFCBANK"].map(monogramTone));
    expect(tones.size).toBeGreaterThan(1);
  });

  it("handles an empty seed without falling over", () => {
    expect(monogramTone("")).toEqual(expect.any(String));
  });
});

describe("CompanyLogo", () => {
  it("renders the company's own logo, sized and lazy", () => {
    render(<CompanyLogo symbol="RELIANCE" size={40} />);

    const image = screen.getByAltText("Reliance Industries (RELIANCE) logo");
    expect(image).toHaveAttribute("src", "https://images.dhan.co/symbol/RELIANCE.png");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveStyle({ width: "40px", height: "40px" });
  });

  // The three that rendered as monograms on the landing page. Each has a real mark in the symbol
  // store, and each used to ask two dead hosts for it first.
  it.each([
    ["HAL", "Hindustan Aeronautics"],
    ["BHEL", "Bharat Heavy Electricals"],
    ["POLYCAB", "Polycab India"],
  ])("asks the symbol store first for %s, on real-mark rows too", (symbol, name) => {
    render(<CompanyLogo symbol={symbol} preferReal />);

    expect(screen.getByAltText(`${name} (${symbol}) logo`)).toHaveAttribute(
      "src",
      `https://images.dhan.co/symbol/${symbol}.png`,
    );
  });

  it("never asks a host that no longer serves logos", () => {
    render(<CompanyLogo symbol="LGEINDIA" preferReal />);
    const image = screen.getByAltText("LG Electronics India (LGEINDIA) logo");

    for (let attempt = 0; attempt < 4; attempt++) {
      const current = screen.queryByAltText("LG Electronics India (LGEINDIA) logo");
      if (!current) break;
      expect(current.getAttribute("src")).not.toContain("clearbit");
      expect(current.getAttribute("src")).not.toContain("groww");
      expect(current.getAttribute("src")).not.toContain("tickertape");
      fireEvent.error(current);
    }

    expect(image).toBeDefined();
  });

  it("falls back from the symbol store to the company's own favicon", () => {
    render(<CompanyLogo symbol="HAL" preferReal />);

    fireEvent.error(screen.getByAltText("Hindustan Aeronautics (HAL) logo"));

    expect(screen.getByAltText("Hindustan Aeronautics (HAL) logo")).toHaveAttribute(
      "src",
      "https://www.google.com/s2/favicons?domain=hal-india.co.in&sz=128",
    );
  });

  it("tries one more icon service before a monogram when a real mark is wanted", () => {
    render(<CompanyLogo symbol="BHEL" preferReal />);

    fireEvent.error(screen.getByAltText("Bharat Heavy Electricals (BHEL) logo"));
    fireEvent.error(screen.getByAltText("Bharat Heavy Electricals (BHEL) logo"));

    expect(screen.getByAltText("Bharat Heavy Electricals (BHEL) logo")).toHaveAttribute(
      "src",
      "https://icons.duckduckgo.com/ip3/bhel.com.ico",
    );
  });

  it("stops at the company favicon when no real mark was asked for", () => {
    render(<CompanyLogo symbol="LGEINDIA" />);

    fireEvent.error(screen.getByAltText("LG Electronics India (LGEINDIA) logo"));

    expect(screen.getByAltText("LG Electronics India (LGEINDIA) logo")).toHaveAttribute(
      "src",
      "https://www.google.com/s2/favicons?domain=lg.com&sz=128",
    );
  });

  // A miss is the expected outcome for the long tail of small caps, not an error.
  it("swaps to a monogram when the store has no logo", () => {
    render(<CompanyLogo symbol="SWANDEF" />);

    fireEvent.error(screen.getByAltText("SWANDEF (SWANDEF) logo"));

    expect(screen.queryByAltText("SWANDEF (SWANDEF) logo")).not.toBeInTheDocument();
    expect(screen.getByText("SWA")).toBeInTheDocument();
  });

  it("draws the monogram straight away when there is no ticker to look up", () => {
    render(<CompanyLogo symbol="Delta Logistics" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("DEL")).toBeInTheDocument();
  });

  // Rows are reused as a list pages, so a miss on one company must not blank out the next.
  it("tries again when the row is reused for another company", () => {
    const { rerender } = render(<CompanyLogo symbol="SWANDEF" />);
    fireEvent.error(screen.getByAltText("SWANDEF (SWANDEF) logo"));
    expect(screen.getByText("SWA")).toBeInTheDocument();

    rerender(<CompanyLogo symbol="RELIANCE" />);
    expect(screen.getByAltText("Reliance Industries (RELIANCE) logo")).toBeInTheDocument();
  });

  it("honours a hand-checked logo for a company with no ticker", () => {
    render(<CompanyLogo symbol="Delta Logistics" src="https://logo.test/delta.png" />);

    expect(screen.getByAltText("DELTA LOGISTICS (DELTA LOGISTICS) logo")).toHaveAttribute("src", "https://logo.test/delta.png");
  });

  it("accepts extra classes from the row it sits in", () => {
    render(<CompanyLogo symbol="TCS" className="mt-1" />);
    expect(screen.getByAltText("Tata Consultancy Services (TCS) logo")).toHaveClass("mt-1");
  });

  /**
   * The failure `onError` never sees.
   *
   * These rows are rendered on the server now, so the browser starts fetching each logo the moment
   * the HTML lands — before hydration attaches any handler. A source that 403s quickly fires its
   * error into nothing, and the row was left showing a broken image indefinitely. An element that
   * has finished loading with no intrinsic width has failed, whenever it happened.
   */
  it("recovers a logo that failed before hydration attached the handler", async () => {
    // jsdom loads nothing, so `complete`/`naturalWidth` are stubbed to describe an image the
    // browser already tried and failed to fetch.
    const complete = jest.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = jest.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);

    render(<CompanyLogo symbol="SWANDEF" />);

    expect(await screen.findByText("SWA")).toBeInTheDocument();
    expect(screen.queryByAltText("SWANDEF (SWANDEF) logo")).not.toBeInTheDocument();

    complete.mockRestore();
    width.mockRestore();
  });

  it("leaves a logo that did load alone", () => {
    const complete = jest.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = jest.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(128);

    render(<CompanyLogo symbol="RELIANCE" />);

    expect(screen.getByAltText("Reliance Industries (RELIANCE) logo")).toBeInTheDocument();

    complete.mockRestore();
    width.mockRestore();
  });
});
