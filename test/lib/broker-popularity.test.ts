// `next/cache` reaches for a global Request the moment app/lib/cache is loaded, so the shim has to
// be in place before that import runs — which is why the module below is required, not imported.
if (typeof global.Request === "undefined") {
  global.Request = class Request {
    constructor(public input: string) {}
  } as unknown as typeof Request;
}

const { fetchGrowwMostBought } = require("../../app/lib/broker-popularity") as typeof import("../../app/lib/broker-popularity");
const { BROKERS, PUBLISHING_BROKERS } = require("../../app/lib/brokers") as typeof import("../../app/lib/brokers");

/** The shape Groww embeds in its own page, trimmed to the fields that are read. */
function page(stocks: unknown[], { nonce = true } = {}): string {
  const open = nonce
    ? '<script id="__NEXT_DATA__" type="application/json" nonce="abc123" crossorigin="anonymous">'
    : '<script id="__NEXT_DATA__" type="application/json">';
  return `<html><body><div>markup</div>${open}${JSON.stringify({ props: { pageProps: { stocks } } })}</script></body></html>`;
}

function stock(company: Record<string, unknown>) {
  return { company, stats: { ltp: 100 } };
}

function respond(body: string, ok = true) {
  global.fetch = jest.fn(async () => ({ ok, text: async () => body })) as unknown as typeof fetch;
}

describe("tracked brokers", () => {
  it("tracks the five largest retail platforms in order of active clients", () => {
    expect(BROKERS.map((broker) => broker.name)).toEqual(["Groww", "Zerodha", "Angel One", "Upstox", "ICICI Direct"]);
    expect(BROKERS.map((broker) => broker.standing)).toEqual([1, 2, 3, 4, 5]);
  });

  it("says why each non-publishing broker carries no data rather than dropping it", () => {
    for (const broker of BROKERS.filter((each) => each.feed === null)) {
      expect(broker.unavailable).toBeTruthy();
    }
    // Only Groww publishes anything public, and under its own wording.
    expect(PUBLISHING_BROKERS.map((each) => each.id)).toEqual(["groww"]);
    expect(PUBLISHING_BROKERS[0].feed?.label).toBe("Most bought on Groww");
  });
});

describe("Groww most-bought list", () => {
  it("reads scrip codes and placings from the page's embedded payload", async () => {
    respond(
      page([
        stock({ bseScriptCode: "530843", isin: "INE509F01029", companyName: "Cupid" }),
        stock({ bseScriptCode: "524404", isin: "INE750C01026", companyName: "Marksans Pharma" }),
      ]),
    );

    expect(await fetchGrowwMostBought()).toEqual([
      { code: "530843", isin: "INE509F01029", name: "Cupid", rank: 1 },
      { code: "524404", isin: "INE750C01026", name: "Marksans Pharma", rank: 2 },
    ]);
  });

  it("reads the tag whether or not it carries a nonce", async () => {
    respond(page([stock({ bseScriptCode: "500180", isin: "INE040A01034", companyName: "HDFC Bank" })], { nonce: false }));

    expect(await fetchGrowwMostBought()).toHaveLength(1);
  });

  it("drops an entry with no BSE scrip code, which is how the list carries ETFs", async () => {
    respond(
      page([
        stock({ bseScriptCode: "", isin: "INF277KA1976", companyName: "Tata Gold ETF" }),
        stock({ isin: "INE509F01029", companyName: "No Code Ltd" }),
        stock({ bseScriptCode: "530843", isin: "INE509F01029", companyName: "Cupid" }),
      ]),
    );

    const entries = await fetchGrowwMostBought();

    expect(entries.map((entry) => entry.code)).toEqual(["530843"]);
    // The placing is the position on Groww's list, so dropping rows above it must not renumber it.
    expect(entries[0].rank).toBe(3);
  });

  it("refuses a non-scalar where a scrip code belongs rather than stringifying it", async () => {
    respond(page([stock({ bseScriptCode: { nested: true }, isin: "INE1", companyName: "Odd Ltd" })]));

    expect(await fetchGrowwMostBought()).toEqual([]);
  });

  it("accepts a numeric scrip code, which the payload has been seen to use", async () => {
    respond(page([stock({ bseScriptCode: 530843, isin: "INE509F01029", companyName: "Cupid" })]));

    expect((await fetchGrowwMostBought())[0].code).toBe("530843");
  });

  it("degrades to an empty list on a failed request, absent tag, or unusable payload", async () => {
    respond("anything", false);
    expect(await fetchGrowwMostBought()).toEqual([]);

    respond("<html><body>no embedded json here</body></html>");
    expect(await fetchGrowwMostBought()).toEqual([]);

    respond('<script id="__NEXT_DATA__" type="application/json">{not json}</script>');
    expect(await fetchGrowwMostBought()).toEqual([]);

    respond(page([]).replace('"stocks":[]', '"stocks":null'));
    expect(await fetchGrowwMostBought()).toEqual([]);

    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await fetchGrowwMostBought()).toEqual([]);
  });
});
