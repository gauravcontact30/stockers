import {
  composeRead,
  deltaOf,
  frameFromLine,
  framesOf,
  parseBrief,
  readSseChunk,
  type BoardBrief,
} from "../../app/lib/board-read";

const brief: BoardBrief = {
  subject: "Every NSE sectoral index, ranked by today's move",
  question: "Which way did money rotate today?",
  facts: [
    { label: "Sectors advancing", value: "9 of 15" },
    { label: "Leader", value: "NIFTY IT" },
  ],
  highlights: ["NIFTY IT: +1.20% today", "NIFTY METAL: −0.80% today"],
};

describe("parseBrief", () => {
  it("accepts a brief carrying a subject, a question and some figures", () => {
    expect(parseBrief(brief)).toEqual(brief);
  });

  it("refuses one with no subject, no question or nothing measured", () => {
    expect(parseBrief(null)).toBeNull();
    expect(parseBrief({ ...brief, subject: "" })).toBeNull();
    expect(parseBrief({ ...brief, question: "" })).toBeNull();
    expect(parseBrief({ ...brief, facts: [], highlights: [] })).toBeNull();
  });

  // A brief arrives from the browser, so it is clamped before it reaches a model: this is the
  // section's own rendered figures coming back to be narrated, not an open prompt channel.
  it("clamps a brief that arrives oversized", () => {
    const parsed = parseBrief({
      subject: "s".repeat(500),
      question: "q",
      facts: Array.from({ length: 40 }, () => ({ label: "l", value: "v" })),
      highlights: Array.from({ length: 40 }, () => "h"),
    });

    expect(parsed?.subject).toHaveLength(200);
    expect(parsed?.facts).toHaveLength(12);
    expect(parsed?.highlights).toHaveLength(8);
  });

  it("drops facts that are missing a label or a value", () => {
    const parsed = parseBrief({ ...brief, facts: [{ label: "", value: "v" }, { label: "l", value: "" }] });
    expect(parsed?.facts).toEqual([]);
  });
});

describe("composeRead", () => {
  it("arranges the board's own figures into the shape the model would have returned", () => {
    const read = composeRead(brief);

    expect(read).toEqual({
      headline: "Sectors advancing: 9 of 15",
      points: ["NIFTY IT: +1.20% today", "NIFTY METAL: −0.80% today", "Leader: NIFTY IT"],
      source: "heuristic",
    });
  });

  it("leads on a highlight when the board carries no figures", () => {
    const read = composeRead({ ...brief, facts: [] });
    expect(read.headline).toBe("NIFTY IT: +1.20% today");
  });
});

describe("frameFromLine", () => {
  it("reads the headline off its prefix, whatever its case", () => {
    expect(frameFromLine("HEADLINE: Money rotated into IT")).toEqual({
      type: "headline",
      text: "Money rotated into IT",
    });
    expect(frameFromLine("Headline:  Money rotated into IT  ")).toEqual({
      type: "headline",
      text: "Money rotated into IT",
    });
  });

  // Models are inconsistent about which bullet character they reach for, and the difference is
  // not worth losing a point over.
  it("reads a point off any of the bullets a model reaches for", () => {
    expect(frameFromLine("- Nine of fifteen rose.")).toEqual({ type: "point", text: "Nine of fifteen rose." });
    expect(frameFromLine("* Nine of fifteen rose.")).toEqual({ type: "point", text: "Nine of fifteen rose." });
    expect(frameFromLine("• Nine of fifteen rose.")).toEqual({ type: "point", text: "Nine of fifteen rose." });
  });

  it("ignores blank lines, bare prose and empty bullets", () => {
    expect(frameFromLine("")).toBeNull();
    expect(frameFromLine("   ")).toBeNull();
    expect(frameFromLine("Here is my analysis:")).toBeNull();
    expect(frameFromLine("HEADLINE:   ")).toBeNull();
    expect(frameFromLine("-   ")).toBeNull();
  });
});

describe("framesOf", () => {
  it("decomposes a finished read into the frames it would have streamed as", () => {
    expect(framesOf({ headline: "H", points: ["a", "b"], source: "ai" })).toEqual([
      { type: "headline", text: "H" },
      { type: "point", text: "a" },
      { type: "point", text: "b" },
      { type: "done", source: "ai" },
    ]);
  });
});

describe("readSseChunk", () => {
  it("pulls the data payloads out, dropping the stream's own bookkeeping", () => {
    const { payloads, rest } = readSseChunk('data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n');

    expect(payloads).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe("");
  });

  /**
   * A chunk boundary lands wherever the network puts it, including mid-line. The remainder is
   * handed back so the caller can feed it in again with the next chunk — without this, every
   * payload unlucky enough to straddle a boundary would be silently lost.
   */
  it("hands back the half-line at the end so the next chunk can complete it", () => {
    const first = readSseChunk('data: {"a":1}\n\ndata: {"b":');
    expect(first.payloads).toEqual(['{"a":1}']);
    expect(first.rest).toBe('data: {"b":');

    const second = readSseChunk(`${first.rest}2}\n\n`);
    expect(second.payloads).toEqual(['{"b":2}']);
  });

  it("ignores lines that are not data at all", () => {
    const { payloads } = readSseChunk(": keep-alive\nevent: ping\ndata: {\"a\":1}\n\n");
    expect(payloads).toEqual(['{"a":1}']);
  });
});

describe("deltaOf", () => {
  it("takes the text out of a payload", () => {
    expect(deltaOf('{"choices":[{"delta":{"content":"Money "}}]}')).toBe("Money ");
  });

  it("returns nothing for a payload carrying no text, or none this understands", () => {
    expect(deltaOf('{"choices":[{"delta":{}}]}')).toBe("");
    expect(deltaOf('{"choices":[]}')).toBe("");
    expect(deltaOf('{"choices":[{"delta":{"content":null}}]}')).toBe("");
    expect(deltaOf("not json at all")).toBe("");
  });
});
