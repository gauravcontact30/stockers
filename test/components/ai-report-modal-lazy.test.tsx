// The deferred report sheet, and the latch that makes deferring it worth anything.
//
// The property under test is not "the modal renders" — the real modal has its own suite. It is
// that nothing is rendered, and so nothing is fetched, until somebody opens one; and that once
// opened it stays mounted so the shell's exit animation has something to animate.

import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { AiReportModal } from "../../app/components/ai-report-modal-lazy";
import { useOnceOpen } from "../../app/components/use-once-open";

jest.mock("../../app/components/ai-report-modal", () => ({
  AiReportModal: ({ open }: { open: boolean }) => <div data-testid="real-modal" data-open={String(open)} />,
}));

const PROPS = { onClose: () => {}, loading: false, analysis: null };

/** Lets `next/dynamic` resolve the chunk it was asked for. */
async function settle() {
  await act(async () => {});
}

describe("useOnceOpen", () => {
  function Probe({ open }: { open: boolean }) {
    return <span data-testid="latch">{String(useOnceOpen(open))}</span>;
  }

  it("is false until the first open", () => {
    render(<Probe open={false} />);
    expect(screen.getByTestId("latch")).toHaveTextContent("false");
  });

  it("is true on the very render that opens it, without waiting for an effect", () => {
    render(<Probe open />);
    expect(screen.getByTestId("latch")).toHaveTextContent("true");
  });

  it("stays true after it closes again", async () => {
    const { rerender } = render(<Probe open />);
    await settle();

    rerender(<Probe open={false} />);
    // Latched, not mirrored: the shell animates on the way out and must stay mounted through it.
    expect(screen.getByTestId("latch")).toHaveTextContent("true");
  });
});

describe("AiReportModal (deferred)", () => {
  it("renders nothing at all until it is opened", () => {
    const { container } = render(<AiReportModal open={false} {...PROPS} />);

    // Nothing in the tree means `next/dynamic` never asks for the chunk, which is the entire
    // reason the five boards import this file instead of the real one.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("real-modal")).not.toBeInTheDocument();
  });

  it("loads and shows the real sheet once opened", async () => {
    render(<AiReportModal open {...PROPS} />);
    await settle();

    expect(await screen.findByTestId("real-modal")).toHaveAttribute("data-open", "true");
  });

  it("keeps the sheet mounted after it closes, so it can animate out", async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <AiReportModal open={open} {...PROPS} />
        </>
      );
    }

    render(<Host />);
    await settle();
    expect(await screen.findByTestId("real-modal")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "close" }).click();
    });

    // Still there, now told it is closed — the shell holds itself for 220ms and unmounts itself.
    expect(screen.getByTestId("real-modal")).toHaveAttribute("data-open", "false");
  });
});
