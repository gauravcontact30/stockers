import { bseCatalogue } from "../../app/lib/bse-catalogue";
import { searchIndex, suggestStocks } from "../../app/lib/stock-search";
import { indianStocks } from "../../app/lib/indian-stocks";

describe("verified BSE listings", () => {
  it("adds AU Bank and Angel One with their BSE scrip codes", () => {
    const catalogue = bseCatalogue();

    expect(catalogue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "AUBANK", name: "AU Small Finance Bank Ltd", scripCode: "540611", yahooSymbol: "AUBANK.NS" }),
        expect.objectContaining({ symbol: "ANGELONE", name: "Angel One Ltd", scripCode: "543235", yahooSymbol: "ANGELONE.NS" }),
      ]),
    );
  });

  it("surfaces their curated metadata, real-logo domain, and performance-ready symbols across search", () => {
    expect(indianStocks.find((stock) => stock.symbol === "AUBANK")).toEqual(
      expect.objectContaining({ name: "AU Small Finance Bank", domain: "aubank.in", capTier: "Mid" }),
    );
    expect(indianStocks.find((stock) => stock.symbol === "ANGELONE")).toEqual(
      expect.objectContaining({ name: "Angel One", domain: "angelone.in", capTier: "Small" }),
    );

    expect(searchIndex().find((hit) => hit.symbol === "AUBANK")).toEqual(
      expect.objectContaining({ sector: "Banking", scripCode: "540611", curated: true }),
    );
    expect(searchIndex().find((hit) => hit.symbol === "ANGELONE")).toEqual(
      expect.objectContaining({ sector: "NBFC & Financial Services", scripCode: "543235", curated: true }),
    );
    expect(suggestStocks("543235").hits[0]).toEqual(expect.objectContaining({ symbol: "ANGELONE" }));
  });

  it("does not add Zerodha as a BSE-listed equity", () => {
    expect(bseCatalogue().some((entry) => entry.symbol === "ZERODHA" || entry.name === "Zerodha")).toBe(false);
    expect(searchIndex().some((hit) => hit.symbol === "ZERODHA" || hit.name === "Zerodha")).toBe(false);
  });
});
