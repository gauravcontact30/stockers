import { render, screen, waitFor } from "@testing-library/react";
import { AiBoardRead, applyFrame, parseFrame } from "../../app/components/ai-board-read";
import type { BoardBrief, BoardRead, ReadFrame } from "../../app/lib/board-read";

const brief: BoardBrief = {
  subject: "Every NSE sectoral index, ranked by today's move",
  question: "Which way did money rotate today?",
  facts: [{ label: "Sectors advancing", value: "9 of 15" }],
  highlights: ["NIFTY IT: +1.20% today"],
};

/** The frames a finished read arrives as, so a test can name the read and not the wire format. */
function framesFor(read: BoardRead): ReadFrame[] {
  return [
    { type: "headline", text: read.headline },
    ...read.points.map((text): ReadFrame => ({ type: "point", text })),
    { type: "done", source: read.source },
  ];
}

/**
 * A response whose body streams the given chunks, as the endpoint's does.
 *
 * Chunks are deliberately separate from frames: the panel has to cope with a frame split across a
 * chunk boundary, which is the normal case over a real connection.
 */
function streamingResponse(chunks: string[], ok = true): Response {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length ? { done: false, value: encoder.encode(chunks[index++]) } : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

/** One NDJSON line per frame, in one chunk — the shape a cached read arrives in. */
function mockRead(read: BoardRead, ok = true) {
  const body = framesFor(read).map((frame) => `${JSON.stringify(frame)}\n`).join("");
  global.fetch = jest.fn().mockResolvedValue(streamingResponse([body], ok));
}

describe("parseFrame", () => {
  it("reads each kind of frame off the wire", () => {
    expect(parseFrame('{"type":"headline","text":"Money rotated into IT"}')).toEqual({
      type: "headline",
      text: "Money rotated into IT",
    });
    expect(parseFrame('{"type":"point","text":"Nine of fifteen rose."}')).toEqual({
      type: "point",
      text: "Nine of fifteen rose.",
    });
    expect(parseFrame('{"type":"done","source":"ai"}')).toEqual({ type: "done", source: "ai" });
  });

  // A `done` frame is the panel's signal to stop saying it is still writing, so an unrecognised
  // source must not be taken at face value — it falls back to the composed read's provenance.
  it("treats an unknown source as composed rather than as the model's work", () => {
    expect(parseFrame('{"type":"done","source":"guesswork"}')).toEqual({ type: "done", source: "heuristic" });
  });

  it("ignores blank lines, half-written frames and frames with nothing in them", () => {
    expect(parseFrame("")).toBeNull();
    expect(parseFrame("   ")).toBeNull();
    expect(parseFrame('{"type":"headline","te')).toBeNull();
    expect(parseFrame('{"type":"headline","text":""}')).toBeNull();
    expect(parseFrame('{"type":"headline"}')).toBeNull();
    expect(parseFrame('{"type":"applause","text":"bravo"}')).toBeNull();
  });
});

describe("applyFrame", () => {
  it("builds a read up frame by frame", () => {
    let read = applyFrame(null, { type: "headline", text: "Money rotated into IT" });
    expect(read).toEqual({ headline: "Money rotated into IT", points: [], source: "heuristic" });

    read = applyFrame(read, { type: "point", text: "Nine of fifteen rose." });
    read = applyFrame(read, { type: "point", text: "Metals lagged." });
    read = applyFrame(read, { type: "done", source: "ai" });

    expect(read).toEqual({
      headline: "Money rotated into IT",
      points: ["Nine of fifteen rose.", "Metals lagged."],
      source: "ai",
    });
  });

  // The headline can arrive before anything else, so points must be able to land on a read that
  // has no headline yet without losing it.
  it("keeps a point that arrives before the headline", () => {
    expect(applyFrame(null, { type: "point", text: "Metals lagged." })).toEqual({
      headline: "",
      points: ["Metals lagged."],
      source: "heuristic",
    });
  });
});

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
      signal: expect.anything(),
    });
  });

  it("shows the headline, the points and the AI provenance", async () => {
    mockRead({
      headline: "Money rotated into IT",
      points: ["Nine of fifteen sectors rose.", "Metals lagged."],
      source: "ai",
    });
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText("Money rotated into IT")).toBeInTheDocument();
    expect(screen.getByText("Nine of fifteen sectors rose.")).toBeInTheDocument();
    expect(screen.getByText("Metals lagged.")).toBeInTheDocument();
    expect(await screen.findByText(/Written by AI agent/)).toBeInTheDocument();
  });

  // Without a key the read is composed from the figures, and the panel says so rather than
  // passing arithmetic off as the model's work.
  it("says when the read was composed from the numbers instead", async () => {
    mockRead({ headline: "Sectors advancing: 9 of 15", points: ["NIFTY IT: +1.20% today"], source: "heuristic" });
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText(/no AI key configured/)).toBeInTheDocument();
  });

  // The point of streaming: the headline is on screen while the model is still writing the rest,
  // and the panel says as much rather than presenting a partial read as the finished one.
  it("shows the headline as soon as it lands, before the points arrive", async () => {
    let release: (() => void) | null = null;
    const encoder = new TextEncoder();
    const chunks = ['{"type":"headline","text":"Money rotated into IT"}\n', '{"type":"point","text":"Metals lagged."}\n{"type":"done","source":"ai"}\n'];
    let index = 0;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (index === 0) return { done: false, value: encoder.encode(chunks[index++]) };
            if (index === 1) {
              // The second chunk waits until the test has checked what is on screen after the first.
              await new Promise<void>((resolve) => {
                release = resolve;
              });
              return { done: false, value: encoder.encode(chunks[index++]) };
            }
            return { done: true, value: undefined };
          },
        }),
      },
    } as unknown as Response);

    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText("Money rotated into IT")).toBeInTheDocument();
    expect(screen.getByText(/Still writing/)).toBeInTheDocument();
    expect(screen.queryByText("Metals lagged.")).not.toBeInTheDocument();

    await waitFor(() => expect(release).not.toBeNull());
    release!();

    expect(await screen.findByText("Metals lagged.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Still writing/)).not.toBeInTheDocument());
  });

  // A frame split across a chunk boundary is the normal case over a real connection: the half-line
  // has to be held back and completed rather than parsed and dropped.
  it("reassembles a frame split across two chunks", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      streamingResponse([
        '{"type":"headline","text":"Money rota',
        'ted into IT"}\n{"type":"point","text":"Metals lagged."}\n{"type":"done","source":"ai"}',
      ]),
    );

    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText("Money rotated into IT")).toBeInTheDocument();
    expect(await screen.findByText("Metals lagged.")).toBeInTheDocument();
  });

  // A proxy that buffers, or an environment without streaming bodies, hands the whole reply over
  // at once. The same line parsing has to cover it.
  it("reads a whole body when no stream is offered", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: null,
      text: async () =>
        framesFor({ headline: "Money rotated into IT", points: ["Metals lagged."], source: "ai" })
          .map((frame) => `${JSON.stringify(frame)}\n`)
          .join(""),
    } as unknown as Response);

    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText("Money rotated into IT")).toBeInTheDocument();
    expect(await screen.findByText("Metals lagged.")).toBeInTheDocument();
  });

  it("shows a placeholder while the desk is thinking", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });

  it("shows an error when the desk refuses", async () => {
    mockRead({ headline: "unused", points: [], source: "ai" }, false);
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText(/couldn't read this board right now/)).toBeInTheDocument();
  });

  it("shows an error when the request rejects outright", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    render(<AiBoardRead feature="sectors" brief={brief} />);

    expect(await screen.findByText(/couldn't read this board right now/)).toBeInTheDocument();
  });

  // A 200 carrying no usable frame should leave the placeholder up, not render an empty panel.
  it("keeps waiting when the response carries no frames", async () => {
    global.fetch = jest.fn().mockResolvedValue(streamingResponse([""]));
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
