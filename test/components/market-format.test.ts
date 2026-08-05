import {
  chipFor,
  formatCrore,
  formatDayDate,
  formatQuantity,
  formatRupee,
  formatSignedPercent,
  relativeAge,
  sectorTone,
  toneFor,
} from "../../app/components/market-format";

describe("formatRupee", () => {
  it("groups digits in the Indian style", () => {
    // 12,34,567.89 — lakh/crore grouping, not the western 1,234,567.89.
    expect(formatRupee(1234567.89)).toBe("₹12,34,567.89");
    expect(formatRupee(41.5)).toBe("₹41.50");
  });

  it("honours a custom precision", () => {
    expect(formatRupee(41.5, 0)).toBe("₹42");
  });

  it.each([[null], [undefined], [Number.NaN]])("renders %s as an em dash", (value) => {
    expect(formatRupee(value as number | null)).toBe("—");
  });
});

describe("formatSignedPercent", () => {
  it("always carries a sign", () => {
    expect(formatSignedPercent(7.6)).toBe("+7.60%");
    expect(formatSignedPercent(-0.78)).toBe("-0.78%");
    expect(formatSignedPercent(0)).toBe("+0.00%");
  });

  it("renders a missing value as an em dash", () => {
    expect(formatSignedPercent(null)).toBe("—");
    expect(formatSignedPercent(Number.NaN)).toBe("—");
  });
});

describe("formatCrore", () => {
  // Indian market turnover is quoted in crore (10^7) and lakh (10^5), never in raw digits.
  it("uses crore above a crore and drops decimals once it passes 100", () => {
    expect(formatCrore(11130953074.22)).toBe("₹1,113 Cr");
    expect(formatCrore(3.5e7)).toBe("₹3.5 Cr");
  });

  it("falls back to lakh below a crore", () => {
    expect(formatCrore(5e5)).toBe("₹5 L");
  });

  it("renders a missing value as an em dash", () => {
    expect(formatCrore(null)).toBe("—");
    expect(formatCrore(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatQuantity", () => {
  it("scales share counts into crore and lakh", () => {
    expect(formatQuantity(268151122)).toBe("26.82 Cr");
    expect(formatQuantity(500000)).toBe("5.00 L");
    expect(formatQuantity(4200)).toBe("4,200");
  });

  it("renders a missing value as an em dash", () => {
    expect(formatQuantity(null)).toBe("—");
    expect(formatQuantity(Number.NaN)).toBe("—");
  });
});

describe("toneFor and chipFor", () => {
  it("colours gains green, losses red and flat neutral", () => {
    expect(toneFor(1)).toContain("emerald");
    expect(toneFor(-1)).toContain("rose");
    expect(toneFor(0)).toContain("slate");
    expect(chipFor(1)).toContain("emerald");
    expect(chipFor(-1)).toContain("rose");
    expect(chipFor(0)).toContain("slate");
  });

  it("falls back to a muted tone when there is no number", () => {
    expect(toneFor(null)).toContain("slate");
    expect(toneFor(Number.NaN)).toContain("slate");
    expect(chipFor(null)).toContain("slate");
    expect(chipFor(Number.NaN)).toContain("slate");
  });
});

describe("sectorTone", () => {
  // The same industry must read the same way in every section, so the hash has to be stable.
  it("returns the same class for the same sector every time", () => {
    expect(sectorTone("Banking")).toBe(sectorTone("Banking"));
  });

  it("spreads different sectors across the palette", () => {
    const tones = new Set(["Banking", "IT", "Pharma", "Realty", "Metals", "Energy"].map(sectorTone));
    expect(tones.size).toBeGreaterThan(1);
  });

  it("handles an empty sector name", () => {
    expect(typeof sectorTone("")).toBe("string");
  });
});

describe("relativeAge", () => {
  const now = new Date("2026-08-05T12:00:00.000Z").getTime();

  it.each([
    [0, "just now"],
    [20, "20m ago"],
    [200, "3h ago"],
    [3000, "2d ago"],
  ])("renders %s minutes ago as %s", (minutesAgo, expected) => {
    expect(relativeAge(new Date(now - minutesAgo * 60_000).toISOString(), now)).toBe(expected);
  });

  it("returns an empty string when there is no usable timestamp", () => {
    expect(relativeAge(null, now)).toBe("");
    expect(relativeAge(undefined, now)).toBe("");
    expect(relativeAge("not-a-date", now)).toBe("");
  });

  it("defaults to the current clock", () => {
    expect(relativeAge(new Date().toISOString())).toBe("just now");
  });
});

describe("formatDayDate", () => {
  it("renders an ISO date in Indian day-month-year form", () => {
    expect(formatDayDate("2026-08-07")).toBe("7 Aug 2026");
  });

  it("renders a missing or unparseable date as an em dash", () => {
    expect(formatDayDate(null)).toBe("—");
    expect(formatDayDate(undefined)).toBe("—");
    expect(formatDayDate("nonsense")).toBe("—");
  });
});
