import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromoterTrendChart, scaleFor, shortQuarter, type PromoterQuarter } from "../../app/components/promoter-trend-chart";

function series(values: number[], publicHeld = 45): PromoterQuarter[] {
  const months = ["MAR", "JUN", "SEP", "DEC"];
  return values.map((promoter, index) => ({
    quarter: `30-${months[index % 4]}-${2024 + Math.floor(index / 4)}`,
    promoter,
    publicHeld,
    investorTypes: [
      { key: "promoters", label: "Promoters & insiders", percent: promoter },
      { key: "fii", label: "Foreign institutional investors", percent: 12 + index * 0.1 },
      { key: "dii", label: "Domestic institutional investors", percent: 10 - index * 0.05 },
      { key: "government", label: "Government", percent: 1 },
      { key: "retail", label: "Retail & individual investors", percent: Math.max(0, publicHeld - 25) },
      { key: "bodies", label: "Corporate bodies & trusts", percent: 2 },
    ],
  }));
}

describe("shortQuarter", () => {
  it("shortens a filed date to a month and a two-digit year", () => {
    expect(shortQuarter("30-JUN-2026")).toBe("Jun '26");
    expect(shortQuarter("31-MAR-2025")).toBe("Mar '25");
  });

  it("leaves anything that is not a filed date alone", () => {
    expect(shortQuarter("not a date")).toBe("not a date");
    expect(shortQuarter("")).toBe("");
  });
});

describe("scaleFor", () => {
  it("fits the axis around the data rather than anchoring at zero", () => {
    const { min, max } = scaleFor([50.1, 50.4, 50.2]);
    expect(min).toBeGreaterThan(49);
    expect(max).toBeLessThan(51);
    expect(min).toBeLessThan(50.1);
    expect(max).toBeGreaterThan(50.4);
  });

  it("opens a window around a stake that never moved", () => {
    const { min, max } = scaleFor([50, 50, 50]);
    expect(min).toBe(49.5);
    expect(max).toBe(50.5);
    expect(max).toBeGreaterThan(min);
  });

  it("never runs the axis below zero or above a hundred", () => {
    expect(scaleFor([0.1, 0.1]).min).toBe(0);
    expect(scaleFor([99.9, 99.9]).max).toBe(100);
  });
});

describe("PromoterTrendChart", () => {
  it("says so plainly when there is no filing history", () => {
    render(<PromoterTrendChart history={[]} />);
    expect(screen.getByText("No earlier filings are available for this company yet.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("leads with the most recent quarter's stake", () => {
    render(<PromoterTrendChart history={series([50.1, 50.3, 50.62])} />);

    expect(screen.getAllByText("50.62%").length).toBeGreaterThan(0);
    expect(screen.getByText(/Sep '24 filing/)).toBeInTheDocument();
  });

  it("plots a simple pie per investor type with interactive slices", () => {
    const { container } = render(<PromoterTrendChart history={series([50.1, 50.3, 50.5, 50.7])} />);

    expect(container.querySelectorAll("[data-bar-segment]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-pie-slice]")).toHaveLength(6);
    expect(screen.getByRole("img", { name: /Dec '24 ownership pie chart/ })).toBeInTheDocument();
    expect(screen.getByText("Mar '24")).toBeInTheDocument();
    expect(screen.getAllByText("Dec '24").length).toBeGreaterThan(0);
    expect(screen.getByText("Foreign institutional investors")).toBeInTheDocument();
    expect(screen.getByText("Domestic institutional investors")).toBeInTheDocument();
    expect(screen.getByText("Retail & individual investors")).toBeInTheDocument();
    expect(screen.getByText("Tap a slice or quarter to inspect the filing.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Dec '24 holder split");
  });

  it("reports a rising quarter-on-quarter stake", () => {
    render(<PromoterTrendChart history={series([50.0, 50.5, 51.2])} />);

    expect(screen.getByText("+0.70 pp")).toBeInTheDocument();
    expect(screen.getByText("vs previous quarter")).toBeInTheDocument();
  });

  it("reports a falling quarter-on-quarter stake", () => {
    render(<PromoterTrendChart history={series([51.2, 50.5, 50.0])} />);

    expect(screen.getByText("-0.50 pp")).toBeInTheDocument();
    expect(screen.getByText("vs previous quarter")).toBeInTheDocument();
  });

  it("reports a stake that did not move", () => {
    render(<PromoterTrendChart history={series([50.0, 50.0, 50.0])} />);

    expect(screen.getAllByText("+0.00 pp").length).toBeGreaterThan(0);
    expect(screen.getByText("vs previous quarter")).toBeInTheDocument();
  });

  it("shows the quarter-on-quarter move for the selected point", async () => {
    const user = userEvent.setup();
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    // The latest quarter is selected by default: +0.50 against the one before it.
    expect(screen.getByText("+0.50 pp")).toBeInTheDocument();
    expect(screen.getByText("vs previous quarter")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Jun '24" }));
    expect(screen.getByText("+0.40 pp")).toBeInTheDocument();
  });

  it("shows a negative quarter-on-quarter move", async () => {
    const user = userEvent.setup();
    render(<PromoterTrendChart history={series([50.9, 50.4, 50.0])} />);

    await user.click(screen.getByRole("button", { name: "Jun '24" }));
    expect(screen.getByText("-0.50 pp")).toBeInTheDocument();
  });

  it("omits the quarter-on-quarter line for the very first filing", async () => {
    const user = userEvent.setup();
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    await user.click(screen.getByRole("button", { name: "Mar '24" }));
    expect(screen.getByText(/Mar '24 filing/)).toBeInTheDocument();
    expect(screen.queryByText(/vs previous quarter/)).not.toBeInTheDocument();
    expect(screen.getByText("No prior filing")).toBeInTheDocument();
  });

  it("selects a holder slice on hover", () => {
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Foreign institutional investors: 12\.20 percent/ }));
    expect(screen.getAllByText(/Foreign institutional investors/).length).toBeGreaterThan(0);
    expect(screen.getByText(/holds 12\.20% in the selected quarter/)).toBeInTheDocument();
  });

  it("selects a quarter from the keyboard", () => {
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    fireEvent.focus(screen.getByRole("button", { name: "Jun '24" }));
    expect(screen.getAllByText("50.40%").length).toBeGreaterThan(0);
  });

  it("keeps secondary footer stats out of the focused card", () => {
    render(<PromoterTrendChart history={series([50.0, 52.4, 51.1], 47.6)} />);

    expect(screen.queryByText("Promoter high")).not.toBeInTheDocument();
    expect(screen.queryByText("Promoter low")).not.toBeInTheDocument();
    expect(screen.queryByText("Public float")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /ownership pie chart/ })).toBeInTheDocument();
  });

  it("draws a single filed quarter as a pie", () => {
    const { container } = render(<PromoterTrendChart history={series([50.0])} />);

    expect(container.querySelectorAll("[data-bar-segment]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-pie-slice]")).toHaveLength(6);
    expect(screen.getAllByText("50.00%").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: /Mar '24 ownership pie chart/ })).toBeInTheDocument();
  });

  it("falls back to the last quarter when the series shrinks under the picked one", () => {
    const { rerender } = render(<PromoterTrendChart history={series([50.0, 50.4, 50.9, 51.4])} />);

    fireEvent.focus(screen.getByRole("button", { name: "Dec '24" }));
    expect(screen.getAllByText("51.40%").length).toBeGreaterThan(0);

    // A different company is picked and it has filed fewer quarters.
    rerender(<PromoterTrendChart history={series([20.0, 21.0])} />);
    expect(screen.getAllByText("21.00%").length).toBeGreaterThan(0);
  });

  it("describes the whole series for a screen reader", () => {
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    expect(
      screen.getByRole("img", {
        name: "Sep '24 ownership pie chart, promoter holding 50.90 percent",
      }),
    ).toBeInTheDocument();
  });
});
