import { MIN_MESSAGE, LIMITS, parseEnquiry, resetRateLimit, withinRateLimit } from "../../app/lib/contact";

const valid = {
  name: "Aarav Sharma",
  email: "aarav@example.com",
  topic: "Support",
  message: "The one-year return on the movers board looks wrong for RELIANCE.",
};

beforeEach(() => resetRateLimit());

describe("parseEnquiry", () => {
  it("accepts a complete enquiry", () => {
    expect(parseEnquiry(valid)).toEqual({ enquiry: valid });
  });

  it("trims what the visitor typed", () => {
    const parsed = parseEnquiry({ ...valid, name: "  Aarav Sharma  ", email: " aarav@example.com " });
    expect("enquiry" in parsed && parsed.enquiry.name).toBe("Aarav Sharma");
    expect("enquiry" in parsed && parsed.enquiry.email).toBe("aarav@example.com");
  });

  it("names the field that is wrong rather than refusing generically", () => {
    expect(parseEnquiry({ ...valid, name: "  " })).toEqual({ error: "Please tell us your name." });
    expect(parseEnquiry({ ...valid, email: "not-an-address" })).toEqual({
      error: "That email address doesn't look right.",
    });
    expect(parseEnquiry({ ...valid, message: "hi" })).toEqual({
      error: `Please give us a little more detail — at least ${MIN_MESSAGE} characters.`,
    });
  });

  it("refuses a payload that is not an enquiry at all", () => {
    expect(parseEnquiry(null)).toEqual({ error: "Please tell us your name." });
    expect(parseEnquiry("nonsense")).toEqual({ error: "Please tell us your name." });
    expect(parseEnquiry({ name: 7, email: {}, message: [] })).toEqual({ error: "Please tell us your name." });
  });

  /**
   * The address pattern is deliberately permissive: plus-addressing, long new TLDs and unusual
   * local parts are all real, and rejecting them turns away real people. Only the shape is checked.
   */
  it("accepts the real addresses a stricter pattern would turn away", () => {
    for (const email of ["a+tag@example.co.in", "first.last@sub.domain.example", "x@y.io"]) {
      expect(parseEnquiry({ ...valid, email })).toHaveProperty("enquiry");
    }
  });

  it("falls back to Other for a topic it does not offer", () => {
    const parsed = parseEnquiry({ ...valid, topic: "Something else" });
    expect("enquiry" in parsed && parsed.enquiry.topic).toBe("Other");
  });

  // Clamped rather than rejected: someone who pastes an essay should still be heard.
  it("clamps an oversized message instead of refusing it", () => {
    const parsed = parseEnquiry({ ...valid, message: "x".repeat(LIMITS.message + 500) });
    expect("enquiry" in parsed && parsed.enquiry.message).toHaveLength(LIMITS.message);
  });

  // The honeypot is reported separately so the route can answer it with an ordinary success and
  // teach a crawler nothing about which field gave it away.
  it("flags a filled honeypot as a bot rather than as a validation error", () => {
    expect(parseEnquiry({ ...valid, company: "Acme Ltd" })).toEqual({ error: "Rejected.", honeypot: true });
  });

  it("ignores an empty honeypot, as a person leaves it", () => {
    expect(parseEnquiry({ ...valid, company: "   " })).toHaveProperty("enquiry");
  });
});

describe("withinRateLimit", () => {
  it("lets a sender through a few times and then holds them", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(withinRateLimit("aarav@example.com")).toBe(true);
    }
    expect(withinRateLimit("aarav@example.com")).toBe(false);
  });

  it("counts each sender separately", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) withinRateLimit("aarav@example.com");

    expect(withinRateLimit("aarav@example.com")).toBe(false);
    expect(withinRateLimit("someone@example.com")).toBe(true);
  });

  // The window rolls rather than resetting on the hour, so someone held at 10:59 is not still held
  // at 11:00 for messages they sent the previous afternoon.
  it("forgets attempts once the window has rolled past them", () => {
    const start = Date.now();
    for (let attempt = 0; attempt < 5; attempt += 1) withinRateLimit("aarav@example.com", start);

    expect(withinRateLimit("aarav@example.com", start + 60_000)).toBe(false);
    expect(withinRateLimit("aarav@example.com", start + 61 * 60_000)).toBe(true);
  });
});
