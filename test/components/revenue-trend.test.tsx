// Takings over time, as columns.
//
// The chart's contract is that nothing it shows is reachable only by pointing at it: every column
// is a button with the period, the amount and the payment count in its accessible name, and the
// same numbers sit in the table underneath. Most of what is asserted below is that promise, plus
// the axis arithmetic — a bar chart whose scale is wrong is worse than no chart, because it looks
// authoritative while misstating the number.

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RevenueTrend, axisScale, tickIndexes, type TrendRange } from "../../app/components/revenue-trend";
import type { RevenuePoint } from "../../app/lib/payments-format";

function point(key: string, paise: number, count = paise > 0 ? 1 : 0): RevenuePoint {
  return { key, label: key, paise, count };
}

/** A thirty-point series, mostly quiet, with one peak and one payment worth almost nothing. */
function daily(): RevenuePoint[] {
  return Array.from({ length: 30 }, (_, index) => {
    const key = `day-${String(index).padStart(2, "0")}`;
    if (index === 29) return point(key, 49_900, 2);
    if (index === 20) return point(key, 999_900, 1);
    if (index === 5) return point(key, 100, 1);
    return point(key, 0);
  });
}

const DAILY: TrendRange = { id: "daily", label: "Daily", window: "the last 30 days", points: daily() };
const MONTHLY: TrendRange = {
  id: "monthly",
  label: "Monthly",
  window: "the last 12 months",
  points: [point("Jul 26", 200_000, 4), point("Aug 26", 400_000, 6)],
};

/** The columns, which are the only buttons whose name mentions a payment. */
function bars() {
  return screen.getAllByRole("button", { name: /payment/ });
}

/**
 * The plot, as opposed to the table underneath it.
 *
 * Nearly every figure appears twice on purpose - once on the chart and once in its table twin - so
 * an unscoped `getByText` for an amount finds two nodes. Which is the point of the twin, and the
 * reason these queries say which half they mean.
 */
function plot(container: HTMLElement) {
  return container.querySelector("div[role='group'][aria-labelledby]") as HTMLElement;
}

function caption(container: HTMLElement) {
  return container.querySelector("figcaption") as HTMLElement;
}

describe("the axis scale", () => {
  it("has nothing to draw when nothing was billed", () => {
    expect(axisScale(0)).toEqual({ top: 0, steps: [] });
    expect(axisScale(-1)).toEqual({ top: 0, steps: [] });
  });

  it("snaps the step to a round number at every rung of the ladder", () => {
    // ₹400 wants a ₹100 step; ₹600 a ₹200; ₹1,000 a ₹250; ₹1,600 a ₹500; ₹2,400 a ₹1,000.
    expect(axisScale(40_000).steps).toEqual([0, 10_000, 20_000, 30_000, 40_000]);
    expect(axisScale(60_000).steps).toEqual([0, 20_000, 40_000, 60_000]);
    expect(axisScale(100_000).steps).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
    expect(axisScale(160_000).steps).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
    expect(axisScale(240_000).steps).toEqual([0, 100_000, 200_000, 300_000]);
  });

  it("stops at the first round number above the peak, so a tall bar fills the plot", () => {
    expect(axisScale(100_000).top).toBe(100_000);
    expect(axisScale(160_000).top).toBe(200_000);
  });

  it("never steps in fractions of a rupee", () => {
    expect(axisScale(200)).toEqual({ top: 200, steps: [0, 100, 200] });
  });
});

describe("the x-axis ticks", () => {
  it("labels nothing when there is nothing to label", () => {
    expect(tickIndexes(0).size).toBe(0);
  });

  it("always labels the newest point, and thins the rest", () => {
    const marks = tickIndexes(30);
    expect(marks.has(29)).toBe(true);
    expect([...marks].sort((a, b) => a - b)).toEqual([4, 9, 14, 19, 24, 29]);
  });

  it("labels every point when there are few enough", () => {
    expect([...tickIndexes(3)].sort()).toEqual([0, 1, 2]);
  });
});

describe("when there is nothing to plot", () => {
  it("says so, with no control to switch between two empty views", () => {
    render(<RevenueTrend ranges={[]} />);
    expect(screen.getByText("No payment has been recorded in this window.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Trend period" })).not.toBeInTheDocument();
  });

  it("keeps the control when there is another period worth trying", () => {
    render(
      <RevenueTrend
        ranges={[
          { ...DAILY, points: [point("day-00", 0), point("day-01", 0)] },
          MONTHLY,
        ]}
      />,
    );
    expect(screen.getByText("No payment has been recorded in this window.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Trend period" })).toBeInTheDocument();
  });

  it("uses the caller's wording when it is given some", () => {
    render(<RevenueTrend ranges={[]} empty="The ledger is empty." />);
    expect(screen.getByText("The ledger is empty.")).toBeInTheDocument();
  });
});

describe("the plot", () => {
  it("names every column, whether or not anything was paid on it", () => {
    render(<RevenueTrend ranges={[DAILY]} />);

    const columns = bars();
    expect(columns).toHaveLength(30);
    expect(columns[29]).toHaveAccessibleName("day-29: ₹499 from 2 payments");
    expect(columns[20]).toHaveAccessibleName("day-20: ₹9,999 from 1 payment");
    // A quiet day is still a column with a name — the gap is the information.
    expect(columns[0]).toHaveAccessibleName("day-00: ₹0 from 0 payments");
  });

  it("draws a mark only where money came in, and keeps the smallest one visible", () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    const marks = container.querySelectorAll("button > span[style*='background']");

    // Three paying days out of thirty.
    expect(marks).toHaveLength(3);
    // ₹1 against a ₹9,999 peak rounds to nothing, so it is floored rather than drawn as zero.
    expect((marks[0] as HTMLElement).style.height).toBe("1.5%");
  });

  it("hangs round numbers off the grid, starting at zero", () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    // A ₹9,999 peak asks for a ₹2,500 step, so the rules land on round thousands.
    expect(within(plot(container)).getByText("₹0")).toBeInTheDocument();
    expect(within(plot(container)).getByText("₹2.5K")).toBeInTheDocument();
    expect(within(plot(container)).getByText("₹7.5K")).toBeInTheDocument();
  });

  it("labels the tallest column directly, and nothing else", () => {
    render(<RevenueTrend ranges={[DAILY]} />);
    // ₹9,999 is the peak; ₹499 is the newest column and gets no label of its own.
    expect(screen.getByText("₹10K", { selector: "span.pointer-events-none" })).toBeInTheDocument();
    expect(screen.queryByText("₹499", { selector: "span.pointer-events-none" })).not.toBeInTheDocument();
  });

  it("shows only a thinned set of period labels under the plot", () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    const axis = container.querySelectorAll("span[aria-hidden='true']");
    const shown = [...axis].filter((label) => !label.className.includes("invisible"));

    expect(axis).toHaveLength(30);
    expect(shown).toHaveLength(6);
    expect(shown[shown.length - 1]).toHaveTextContent("day-29");
  });

  it("summarises the window under the chart", () => {
    render(<RevenueTrend ranges={[DAILY]} />);
    expect(screen.getByText(/across the last 30 days/)).toHaveTextContent("₹10,499 across the last 30 days · peak ₹9,999");
    expect(screen.getByText(/per period/)).toHaveTextContent("Average ₹349.97 per period");
  });
});

describe("reading a single column", () => {
  it("opens a readout on hover and closes it when the pointer leaves the plot", async () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    await userEvent.hover(bars()[20]);
    expect(within(plot(container)).getByText("₹9,999")).toBeInTheDocument();
    expect(screen.getByText(/1 payment ·/)).toHaveTextContent("95% of the window");

    fireEvent.mouseLeave(plot(container));
    expect(within(plot(container)).queryByText("₹9,999")).not.toBeInTheDocument();
  });

  it("pluralises the payment count in the readout", async () => {
    render(<RevenueTrend ranges={[DAILY]} />);
    await userEvent.hover(bars()[29]);
    expect(screen.getByText(/2 payments ·/)).toBeInTheDocument();
  });

  it("hides the peak's own label while a column is being read, so the two never overlap", async () => {
    render(<RevenueTrend ranges={[DAILY]} />);
    expect(screen.getByText("₹10K", { selector: "span.pointer-events-none" })).toBeInTheDocument();

    await userEvent.hover(bars()[0]);
    expect(screen.queryByText("₹10K", { selector: "span.pointer-events-none" })).not.toBeInTheDocument();
  });

  it("dims the rest of the series only once one is chosen", async () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    const marks = () => [...container.querySelectorAll("button > span[style*='background']")] as HTMLElement[];

    expect(marks().every((mark) => mark.style.opacity === "1")).toBe(true);

    await userEvent.hover(bars()[20]);
    const opacities = marks().map((mark) => mark.style.opacity);
    expect(opacities).toContain("1");
    expect(opacities).toContain("0.28");
  });

  it("reaches the same readout from the keyboard, and releases it on Escape", () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    const column = bars()[20];

    fireEvent.focus(column);
    expect(within(plot(container)).getByText("₹9,999")).toBeInTheDocument();

    // Any other key leaves the readout where it is.
    fireEvent.keyDown(column, { key: "ArrowRight" });
    expect(within(plot(container)).getByText("₹9,999")).toBeInTheDocument();

    fireEvent.keyDown(column, { key: "Escape" });
    expect(within(plot(container)).queryByText("₹9,999")).not.toBeInTheDocument();
  });

  it("closes the readout when focus moves away", () => {
    const { container } = render(<RevenueTrend ranges={[DAILY]} />);
    fireEvent.focus(bars()[20]);
    fireEvent.blur(bars()[20]);
    expect(within(plot(container)).queryByText("₹9,999")).not.toBeInTheDocument();
  });
});

describe("switching the grain", () => {
  it("marks the chosen period and repoints the plot at it", async () => {
    const { container } = render(<RevenueTrend ranges={[DAILY, MONTHLY]} />);

    expect(screen.getByRole("button", { name: "Daily" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "false");
    expect(caption(container)).toHaveTextContent("Revenue collected, the last 30 days");

    await userEvent.click(screen.getByRole("button", { name: "Monthly" }));

    expect(screen.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    expect(caption(container)).toHaveTextContent("Revenue collected, the last 12 months");
    expect(bars()).toHaveLength(2);
  });

  it("drops the open readout on the way, rather than pointing it at a different period's data", async () => {
    const { container } = render(<RevenueTrend ranges={[DAILY, MONTHLY]} />);

    await userEvent.hover(bars()[20]);
    expect(within(plot(container)).getByText("₹9,999")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.queryByText("₹9,999")).not.toBeInTheDocument();
  });

  it("falls back to the first period when the one it was showing is gone", () => {
    const { container, rerender } = render(<RevenueTrend ranges={[DAILY, MONTHLY]} />);
    expect(caption(container)).toHaveTextContent("Revenue collected, the last 30 days");

    rerender(<RevenueTrend ranges={[{ ...MONTHLY, id: "quarterly", label: "Quarterly", window: "the last 4 quarters" }]} />);
    expect(caption(container)).toHaveTextContent("Revenue collected, the last 4 quarters");
  });
});

describe("the table twin", () => {
  it("carries every figure as text, newest first", () => {
    const { container } = render(<RevenueTrend ranges={[MONTHLY]} />);
    const table = container.querySelector("table") as HTMLElement;
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Aug 26");
    expect(rows[0]).toHaveTextContent("₹4,000");
    expect(rows[1]).toHaveTextContent("Jul 26");
    expect(rows[1]).toHaveTextContent("₹2,000");
  });
});
