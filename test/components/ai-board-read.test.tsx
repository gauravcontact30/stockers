import { render, screen, waitFor } from "@testing-library/react";
import { AiBoardRead } from "../../app/components/ai-board-read";
import type { BoardBrief } from "../../app/lib/board-read";

const brief: BoardBrief = {
  subject: "Every NSE sectoral index, ranked by today's move",
  question: "Which way did money rotate today?",
  facts: [{ label: "Sectors advancing", value: "9 of 15" }],
  highlights: ["NIFTY IT: +1.20% today"],
};

function mockRead(read: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => ({ read }) } as Response);
}

describe("AiBoardRead", () => {
  it("renders nothing until the board it reads has figures", () => {
    global.fetch = jest.fn();
    const { container } = render(<AiBoardRead feature="sectors" brief={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts the section's own figures, charged against the section's feature", async () => {
    mockRead({ headline: "Money rotated into IT", points: ["Nine of fifteen sectors rose."], source: "ai" });
    render(<AiBoardRead feature="sectors" brief={brief} />);

    await screen.findByText("Money rotated into IT");
    expect(global.fetch).toHaveBeenCalledWith("/api/ai/board-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "sectors", brief }),
    });
  });

  it("shows the headline, the points and the AI provenance", async () => {
    mockRead({ headline: "Money rotated into IT", points: ["Nine of fifteen sectors rose.", "Metals lagged."], source: "ai" });
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText("Money rotated into IT")).toBeInTheDocument();
    expect(screen.getByText("Nine of fifteen sectors rose.")).toBeInTheDocument();
    expect(screen.getByText("Metals lagged.")).toBeInTheDocument();
    expect(screen.getByText(/Written by AI agent/)).toBeInTheDocument();
  });

  // Without a key the read is composed from the figures, and the panel says so rather than
  // passing arithmetic off as the model's work.
  it("says when the read was composed from the numbers instead", async () => {
    mockRead({ headline: "Sectors advancing: 9 of 15", points: ["NIFTY IT: +1.20% today"], source: "heuristic" });
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText(/no AI key configured/)).toBeInTheDocument();
  });

  it("shows a placeholder while the desk is thinking", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });

  it("shows an error when the desk refuses", async () => {
    mockRead(null, false);
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText(/couldn't read this board right now/)).toBeInTheDocument();
  });

  it("shows an error when the request rejects outright", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText(/couldn't read this board right now/)).toBeInTheDocument();
  });

  // A 200 with nothing in it should leave the placeholder up, not render an empty panel.
  it("keeps waiting when the response carries no read", async () => {
    mockRead(undefined);
    const { container } = render(<AiBoardRead feature="sectors" brief={brief} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });

  // Unmounting mid-flight must not push an error into a panel that is already gone.
  it("says nothing when the request settles after the panel has left", async () => {
    let reject: (reason: Error) => void = () => {};
    global.fetch = jest.fn(() => new Promise((_, no) => { reject = no; })) as unknown as typeof fetch;

    const { unmount } = render(<AiBoardRead feature="sectors" brief={brief} />);
    unmount();
    reject(new Error("offline"));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/couldn't read this board right now/)).not.toBeInTheDocument();
  });

  it("re-reads when the board's figures change, and not otherwise", async () => {
    mockRead({ headline: "First read", points: ["a"], source: "ai" });
    const { rerender } = render(<AiBoardRead feature="sectors" brief={brief} />);
    await screen.findByText("First read");

    rerender(<AiBoardRead feature="sectors" brief={{ ...brief }} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    mockRead({ headline: "Second read", points: ["b"], source: "ai" });
    rerender(<AiBoardRead feature="sectors" brief={{ ...brief, facts: [{ label: "Sectors advancing", value: "2 of 15" }] }} />);
    expect(await screen.findByText("Second read")).toBeInTheDocument();
  });
});
