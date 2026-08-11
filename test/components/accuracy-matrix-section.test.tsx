import { render, screen } from "@testing-library/react";
import { AccuracyMatrixSection } from "../../app/components/accuracy-matrix-section";
import { BseAccuracyLookup } from "../../app/components/bse-accuracy-lookup";

// The lookup is a client component with its own feeds and its own suite; here it only has to be
// identifiable, so the section's job — giving it an anchor and a card to sit in — can be asserted.
jest.mock("../../app/components/bse-accuracy-lookup", () => ({
  BseAccuracyLookup: jest.fn(() => <div data-testid="accuracy-lookup" />),
}));

describe("AccuracyMatrixSection", () => {
  it("gives the accuracy lookup the anchor the page's nav links to", () => {
    const { container } = render(<AccuracyMatrixSection />);
    const section = container.querySelector("section");

    // "#accuracy" is what the "Accuracy" item in the landing page nav scrolls to, so the id and
    // the scroll margin that keeps it clear of the sticky header both matter.
    expect(section).toHaveAttribute("id", "accuracy");
    expect(section).toHaveClass("scroll-mt-28");
  });

  it("renders the lookup inside the card", () => {
    render(<AccuracyMatrixSection />);

    expect(screen.getByTestId("accuracy-lookup")).toBeInTheDocument();
    expect(BseAccuracyLookup).toHaveBeenCalled();
  });
});
