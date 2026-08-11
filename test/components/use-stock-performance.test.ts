import { renderHook, waitFor } from "@testing-library/react";
import { useStockPerformance, type StockPerformance } from "../../app/components/use-stock-performance";

function performanceFor(symbol: string): StockPerformance {
  return {
    symbol,
    name: `${symbol} Ltd`,
    assetType: "stock",
    capTier: "Large",
    currency: "INR",
    price: 100,
    previousClose: 98,
    change: 2,
    oneDay: 2.04,
    oneWeek: 3,
    oneMonth: 4,
    threeMonth: 5,
    sixMonth: 6,
    oneYear: 7,
    threeYear: 8,
    fiveYear: 9,
    overall: 1000,
    overallSince: "2001-01-01",
    live: true,
    asOf: "2026-08-04T09:45:00.000Z",
    source: "Yahoo Finance",
  };
}

function mockFetch(handler: (url: string) => unknown) {
  const fetchMock = jest.fn(async (url: string) => ({ ok: true, json: async () => handler(String(url)) }) as Response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("useStockPerformance", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns nothing and never fetches for a null symbol", async () => {
    const fetchMock = mockFetch(() => ({}));
    const { result } = renderHook(() => useStockPerformance(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a symbol's returns and exposes them once resolved", async () => {
    mockFetch(() => ({ results: [performanceFor("BATCH_ONE")] }));
    const { result } = renderHook(() => useStockPerformance("BATCH_ONE"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.performance?.symbol).toBe("BATCH_ONE"));
    expect(result.current.loading).toBe(false);
    expect(result.current.performance?.oneYear).toBe(7);
  });

  it("renders an initial server value immediately while the background request is pending", () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const initial = performanceFor("BATCH_INITIAL");
    const { result } = renderHook(() => useStockPerformance("BATCH_INITIAL", initial));

    expect(result.current.loading).toBe(false);
    expect(result.current.performance).toBe(initial);
  });

  // The whole point of the batching layer: a landing page full of cards must not fire one
  // request per card.
  it("coalesces symbols raised in the same tick into a single request", async () => {
    const fetchMock = mockFetch(() => ({
      results: [performanceFor("BATCH_A"), performanceFor("BATCH_B"), performanceFor("BATCH_C")],
    }));

    const a = renderHook(() => useStockPerformance("BATCH_A"));
    const b = renderHook(() => useStockPerformance("BATCH_B"));
    const c = renderHook(() => useStockPerformance("BATCH_C"));

    await waitFor(() => expect(a.result.current.performance).not.toBeNull());
    await waitFor(() => expect(b.result.current.performance).not.toBeNull());
    await waitFor(() => expect(c.result.current.performance).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/market/performance?symbols=BATCH_A,BATCH_B,BATCH_C");
  });

  // Two cards for the same stock (top picks and dip winners both listing it, say) share one
  // pending promise rather than queueing the symbol twice.
  it("shares one request between callers of the same symbol", async () => {
    const fetchMock = mockFetch(() => ({ results: [performanceFor("BATCH_SHARED")] }));

    const first = renderHook(() => useStockPerformance("BATCH_SHARED"));
    const second = renderHook(() => useStockPerformance("BATCH_SHARED"));

    await waitFor(() => expect(first.result.current.performance).not.toBeNull());
    await waitFor(() => expect(second.result.current.performance).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/market/performance?symbols=BATCH_SHARED");
  });

  it("ignores a response that arrives after the caller unmounted", async () => {
    mockFetch(() => ({ results: [performanceFor("BATCH_UNMOUNT")] }));
    const { result, unmount } = renderHook(() => useStockPerformance("BATCH_UNMOUNT"));

    expect(result.current.loading).toBe(true);
    unmount();

    // Give the batch window and the request itself time to settle; a state update on the
    // unmounted hook would surface here as a React warning.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current.performance).toBeNull();
  });

  it("serves a symbol fetched earlier from cache without a second request", async () => {
    const fetchMock = mockFetch(() => ({ results: [performanceFor("BATCH_CACHED")] }));

    const first = renderHook(() => useStockPerformance("BATCH_CACHED"));
    await waitFor(() => expect(first.result.current.performance).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useStockPerformance("BATCH_CACHED"));
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.performance?.symbol).toBe("BATCH_CACHED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("paints a locally cached symbol immediately and revalidates it in the background", async () => {
    const stored = performanceFor("BATCH_STORED");
    window.localStorage.setItem(
      "stockers:performance-cache:v1",
      JSON.stringify({ savedAt: Date.now(), values: { BATCH_STORED: stored } }),
    );
    const fetchMock = mockFetch(() => ({ results: [{ ...stored, price: 111 }] }));

    const { result } = renderHook(() => useStockPerformance("BATCH_STORED"));

    expect(result.current.loading).toBe(false);
    expect(result.current.performance?.price).toBe(100);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.performance?.price).toBe(111));
  });

  it("keeps a locally cached symbol visible when background revalidation fails", async () => {
    const stored = performanceFor("BATCH_STALE");
    window.localStorage.setItem(
      "stockers:performance-cache:v1",
      JSON.stringify({ savedAt: Date.now(), values: { BATCH_STALE: stored } }),
    );
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useStockPerformance("BATCH_STALE"));

    expect(result.current.loading).toBe(false);
    expect(result.current.performance?.symbol).toBe("BATCH_STALE");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(result.current.performance?.symbol).toBe("BATCH_STALE");
  });

  it("resolves to null for a symbol the batch response omits", async () => {
    mockFetch(() => ({ results: [] }));
    const { result } = renderHook(() => useStockPerformance("BATCH_MISSING"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
  });

  it("resolves to null when the response has no results field at all", async () => {
    mockFetch(() => ({}));
    const { result } = renderHook(() => useStockPerformance("BATCH_NO_FIELD"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
  });

  it("degrades to null instead of throwing when the request fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    const { result } = renderHook(() => useStockPerformance("BATCH_NOTOK"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
  });

  it("degrades to null when the network rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useStockPerformance("BATCH_REJECT"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
  });

  it("swaps to the new symbol's data when the symbol prop changes", async () => {
    mockFetch((url) => ({
      results: url
        .split("symbols=")[1]
        .split(",")
        .map((symbol) => performanceFor(decodeURIComponent(symbol))),
    }));

    const { result, rerender } = renderHook(({ symbol }: { symbol: string | null }) => useStockPerformance(symbol), {
      initialProps: { symbol: "BATCH_FIRST" as string | null },
    });

    await waitFor(() => expect(result.current.performance?.symbol).toBe("BATCH_FIRST"));

    rerender({ symbol: "BATCH_SECOND" });
    await waitFor(() => expect(result.current.performance?.symbol).toBe("BATCH_SECOND"));

    rerender({ symbol: null });
    await waitFor(() => expect(result.current.performance).toBeNull());
  });
});
