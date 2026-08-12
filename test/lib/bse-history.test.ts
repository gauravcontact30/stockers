import type { Baseline } from "../../app/lib/bse-history";

if (typeof global.Request === "undefined") {
  global.Request = class Request {
    constructor(public input: string) {}
  } as unknown as typeof Request;
}

const { overallReturn, parseBhavcopyCloses, periodReturn } =
  require("../../app/lib/bse-history") as typeof import("../../app/lib/bse-history");

function currentBhavcopy(rows: string[]): string {
  const header =
    "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd";
  const filler = Array.from({ length: 501 }, (_, index) =>
    `2026-08-11,2026-08-11,CM,BSE,STK,FILL${index},INFILL${index},FILL${index},A,Filler ${index},1,1,1,1,1,1,1,1,1`,
  );
  return [header, ...rows, ...filler].join("\n");
}

describe("BSE historical closes", () => {
  it("indexes current Bhavcopy rows by token, ticker and ISIN", () => {
    const prices = parseBhavcopyCloses(
      currentBhavcopy([
        "2026-08-11,2026-08-11,CM,BSE,STK,123456,INE732I01013,ANGELONE,A,Angel One Ltd,2500,2520,2480,2510,2512,2490,1000,2510000,120",
      ]),
    );

    expect(prices?.get("123456")).toBe(2510);
    expect(prices?.get("ANGELONE")).toBe(2510);
    expect(prices?.get("INE732I01013")).toBe(2510);
  });

  it("calculates returns from any available identifier instead of requiring the scrip code key", () => {
    const baseline: Baseline = { date: "2026-08-04", prices: new Map([["ANGELONE", 2000]]) };
    const older: Baseline = { date: "2021-08-11", prices: new Map([["INE732I01013", 1000]]) };

    expect(periodReturn(["543235", "ANGELONE", "INE732I01013"], 2500, baseline)).toBe(25);
    expect(overallReturn(["543235", "ANGELONE", "INE732I01013"], 2500, [baseline, older])).toBe(25);
  });
});
