import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromoterTrendChart, scaleFor, shortQuarter, type PromoterQuarter } from "../../app/components/promoter-trend-chart";

function series(values: number[], publicHeld = 45): PromoterQuarter[] {
  const months = ["MAR", "JUN", "SEP", "DEC"];
  return values.map((promoter, index) => ({
    quarter: `30-${months[index % 4]}-${2024 + Math.floor(index / 4)}`,
    promoter,
    publicHeld,
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

    expect(screen.getByText("50.62")).toBeInTheDocument();
    expect(screen.getByText(/as of Sep '24/)).toBeInTheDocument();
  });

  it("plots one point and one label per filed quarter", () => {
    const { container } = render(<PromoterTrendChart history={series([50.1, 50.3, 50.5, 50.7])} />);

    expect(container.querySelectorAll("circle")).toHaveLength(4);
    expect(screen.getByText("Mar '24")).toBeInTheDocument();
    expect(screen.getByText("Dec '24")).toBeInTheDocument();
  });

  it("reports a rising stake over the window", () => {
    render(<PromoterTrendChart history={series([50.0, 50.5, 51.2])} />);

    expect(screen.getByText(/\+1\.20 pp over 3 quarters/)).toBeInTheDocument();
    expect(screen.getByText("▲")).toBeInTheDocument();
  });

  it("reports a falling stake over the window", () => {
    render(<PromoterTrendChart history={series([51.2, 50.5, 50.0])} />);

    expect(screen.getByText(/-1\.20 pp over 3 quarters/)).toBeInTheDocument();
    expect(screen.getByText("▼")).toBeInTheDocument();
  });

  it("reports a stake that did not move", () => {
    render(<PromoterTrendChart history={series([50.0, 50.0, 50.0])} />);

    expect(screen.getByText(/\+0\.00 pp over 3 quarters/)).toBeInTheDocument();
    expect(screen.getByText("■")).toBeInTheDocument();
  });

  it("shows the quarter-on-quarter move for the selected point", async () => {
    const user = userEvent.setup();
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    // The latest quarter is selected by default: +0.50 against the one before it.
    expect(screen.getByText(/\+0\.50 pp vs previous quarter/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Jun '24: 50.40% promoter holding" }));
    expect(screen.getByText(/\+0\.40 pp vs previous quarter/)).toBeInTheDocument();
  });

  it("shows a negative quarter-on-quarter move", async () => {
    const user = userEvent.setup();
    render(<PromoterTrendChart history={series([50.9, 50.4, 50.0])} />);

    await user.click(screen.getByRole("button", { name: "Jun '24: 50.40% promoter holding" }));
    expect(screen.getByText(/-0\.50 pp vs previous quarter/)).toBeInTheDocument();
  });

  it("omits the quarter-on-quarter line for the very first filing", async () => {
    const user = userEvent.setup();
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    await user.click(screen.getByRole("button", { name: "Mar '24: 50.00% promoter holding" }));
    expect(screen.getByText(/as of Mar '24/)).toBeInTheDocument();
    expect(screen.queryByText(/vs previous quarter/)).not.toBeInTheDocument();
  });

  it("selects a quarter on hover", () => {
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Mar '24: 50.00% promoter holding" }));
    expect(screen.getByText("50.00")).toBeInTheDocument();
    expect(screen.getByText(/as of Mar '24/)).toBeInTheDocument();
  });

  it("selects a quarter from the keyboard", () => {
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    fireEvent.focus(screen.getByRole("button", { name: "Jun '24: 50.40% promoter holding" }));
    expect(screen.getByText("50.40")).toBeInTheDocument();
  });

  it("summarises the high, the low and the public float", () => {
    render(<PromoterTrendChart history={series([50.0, 52.4, 51.1], 47.6)} />);

    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("52.40%")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("50.00%")).toBeInTheDocument();
    expect(screen.getByText("Public float")).toBeInTheDocument();
    expect(screen.getByText("47.60%")).toBeInTheDocument();
  });

  it("draws a single filed quarter without dividing by a zero-length axis", () => {
    const { container } = render(<PromoterTrendChart history={series([50.0])} />);

    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(screen.getByText("50.00")).toBeInTheDocument();
    // The lone point is centred rather than pinned to the left edge.
    const cx = Number(container.querySelector("circle")!.getAttribute("cx"));
    expect(cx).toBeGreaterThan(100);
  });

  it("falls back to the last quarter when the series shrinks under the picked one", () => {
    const { rerender } = render(<PromoterTrendChart history={series([50.0, 50.4, 50.9, 51.4])} />);

    fireEvent.focus(screen.getByRole("button", { name: "Dec '24: 51.40% promoter holding" }));
    expect(screen.getByText("51.40")).toBeInTheDocument();

    // A different company is picked and it has filed fewer quarters.
    rerender(<PromoterTrendChart history={series([20.0, 21.0])} />);
    expect(screen.getByText("21.00")).toBeInTheDocument();
  });

  it("describes the whole series for a screen reader", () => {
    render(<PromoterTrendChart history={series([50.0, 50.4, 50.9])} />);

    expect(
      screen.getByRole("img", {
        name: "Promoter holding from Mar '24 to Sep '24, 50.90 percent at the latest filing",
      }),
    ).toBeInTheDocument();
  });
});
