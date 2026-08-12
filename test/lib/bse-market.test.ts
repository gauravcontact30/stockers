import type { BseTape } from "../../app/lib/bse-market";

if (typeof global.Request === "undefined") {
  global.Request = class Request {
    constructor(public input: string) {}
  } as unknown as typeof Request;
}

const { findBseTapeRow } = require("../../app/lib/bse-market") as typeof import("../../app/lib/bse-market");

const quote = {
  price: 2510,
  previousClose: 2490,
  change: 20,
  changePercent: 0.8032128514056225,
  open: 2500,
  dayHigh: 2520,
  dayLow: 2480,
  volume: 1000,
  turnoverCr: 0.251,
  trades: 120,
};

describe("BSE tape lookup", () => {
  it("finds a row through ticker aliases when the scrip-code key is absent", () => {
    const tape: BseTape = {
      sessionDate: "2026-08-11",
      rows: new Map([
        [
          "ANGELONE",
          {
            code: "123456",
            ticker: "ANGELONE",
            name: "Angel One Ltd",
            series: "A",
            quote,
          },
        ],
      ]),
    };

    expect(findBseTapeRow(tape, ["543235", "ANGELONE", "INE732I01013"])?.quote.price).toBe(2510);
  });
});
