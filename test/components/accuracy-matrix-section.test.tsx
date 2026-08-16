import { render, screen } from "@testing-library/react";
import { AccuracyMatrixSection } from "../../app/components/accuracy-matrix-section";
import { BseAccuracyLookup } from "../../app/components/bse-accuracy-lookup";
import { dailyPicks } from "../../app/lib/daily-picks";
import { FALLBACK_EXAMPLES } from "../../app/lib/suggestion-defaults";

// The lookup is a client component with its own feeds and its own suite; here it only has to be
// identifiable, so the section's job — giving it an anchor, a card to sit in, and the day's
// suggested companies — can be asserted.
jest.mock("../../app/components/bse-accuracy-lookup", () => ({
  BseAccuracyLookup: jest.fn(() => <div data-testid="accuracy-lookup" />),
}));

// Reads a JSON cache off disk and is covered by its own suite; stubbed here so this one is about
// what the section does with the answer rather than how it is produced.
jest.mock("../../app/lib/daily-picks", () => ({
  dailyPicks: jest.fn(),
}));

const picks = dailyPicks as jest.MockedFunction<typeof dailyPicks>;

describe("AccuracyMatrixSection", () => {
  beforeEach(() => {
    picks.mockResolvedValue([{ symbol: "HAL", name: "Hindustan Aeronautics" }]);
  });

  it("gives the accuracy lookup the anchor the page's nav links to", async () => {
    const { container } = render(await AccuracyMatrixSection());
    const section = container.querySelector("section");

    // "#accuracy" is what the "Accuracy" item in the landing page nav scrolls to, so the id and
    // the scroll margin that keeps it clear of the sticky header both matter.
    expect(section).toHaveAttribute("id", "accuracy");
    expect(section).toHaveClass("scroll-mt-28");
  });

  it("renders the lookup inside the card", async () => {
    render(await AccuracyMatrixSection());

    expect(screen.getByTestId("accuracy-lookup")).toBeInTheDocument();
    expect(BseAccuracyLookup).toHaveBeenCalled();
  });

  it("hands the lookup the day's picks", async () => {
    render(await AccuracyMatrixSection());

    expect(picks).toHaveBeenCalledWith(expect.objectContaining({ count: 6 }));
    expect(BseAccuracyLookup).toHaveBeenCalledWith(
      expect.objectContaining({ examples: [{ symbol: "HAL", name: "Hindustan Aeronautics" }] }),
      undefined,
    );
  });

  it("falls back to the shared default list when no picks could be built", async () => {
    picks.mockResolvedValue([]);
    render(await AccuracyMatrixSection());

    expect(BseAccuracyLookup).toHaveBeenCalledWith(
      expect.objectContaining({ examples: FALLBACK_EXAMPLES }),
      undefined,
    );
  });
});
