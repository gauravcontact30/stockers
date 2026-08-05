import { renderHook, waitFor } from "@testing-library/react";
import { usePerformance, useCompetitors, type Performance, type CompetitorsData } from "../../app/components/use-stock-insights";

const performanceFixture: Performance = {
  assetType: "stock",
  capTier: "Large",
  oneWeek: 2.3,
  oneMonth: -1.1,
  threeMonth: 4.2,
  sixMonth: 9.5,
  oneYear: 12.4,
  threeYear: 30.1,
  fiveYear: 80.2,
  overall: 120.7,
};

const competitorsFixture: CompetitorsData = {
  symbol: "TCS",
  group: "IT Services",
  groupType: "sector",
  peers: [{ symbol: "TCS", name: "Tata Consultancy", logo: "logo.png", price: 100, changePercent: 1, isSelf: true }],
};

function mockFetchOnce(ok: boolean, data?: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(data),
  });
}

describe("usePerformance", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("returns null performance and not loading when symbol is null", () => {
    const { result } = renderHook(() => usePerformance(null));
    expect(result.current.performance).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches and stores performance on success", async () => {
    mockFetchOnce(true, performanceFixture);
    const { result } = renderHook(() => usePerformance("PERF_SUCCESS"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.performance).toEqual(performanceFixture);
    expect(global.fetch).toHaveBeenCalledWith(`/api/market/performance?symbol=PERF_SUCCESS`);
  });

  it("leaves performance null when the response is not ok", async () => {
    mockFetchOnce(false);
    const { result } = renderHook(() => usePerformance("PERF_NOTOK"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
  });

  it("leaves performance null when fetch rejects", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => usePerformance("PERF_REJECT"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toBeNull();
  });

  it("serves from cache on a second mount for the same symbol without refetching", async () => {
    mockFetchOnce(true, performanceFixture);
    const first = renderHook(() => usePerformance("PERF_CACHE"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.performance).toEqual(performanceFixture);

    const callsAfterFirst = (global.fetch as jest.Mock).mock.calls.length;

    const second = renderHook(() => usePerformance("PERF_CACHE"));
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.performance).toEqual(performanceFixture);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(callsAfterFirst);
  });

  it("re-fetches when the symbol prop changes, and clears when it becomes null", async () => {
    mockFetchOnce(true, performanceFixture);
    const { result, rerender } = renderHook(({ symbol }: { symbol: string | null }) => usePerformance(symbol), {
      initialProps: { symbol: "PERF_CHANGE_A" as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.performance).toEqual(performanceFixture);

    rerender({ symbol: null });
    expect(result.current.performance).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("ignores a stale response for a since-changed symbol (cancelled branch)", async () => {
    let resolveStaleFetch: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => (resolveStaleFetch = resolve)));

    const { result, rerender } = renderHook(({ symbol }: { symbol: string }) => usePerformance(symbol), {
      initialProps: { symbol: "PERF_CANCEL_A" },
    });
    expect(result.current.loading).toBe(true);

    // Switching symbols before A's request settles marks it cancelled and kicks off B's fetch.
    mockFetchOnce(true, performanceFixture);
    rerender({ symbol: "PERF_CANCEL_B" });
    await waitFor(() => expect(result.current.performance).toEqual(performanceFixture));
    expect(result.current.loading).toBe(false);

    // Now let the stale A request resolve with different data. The cancelled guard must stop
    // it from clobbering B's already-settled state.
    const staleData = { ...performanceFixture, oneWeek: 999 };
    resolveStaleFetch({ ok: true, json: () => Promise.resolve(staleData) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.performance).toEqual(performanceFixture);
    expect(result.current.loading).toBe(false);
  });
});

describe("useCompetitors", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("returns null competitors and not loading when symbol is null", () => {
    const { result } = renderHook(() => useCompetitors(null));
    expect(result.current.competitors).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches and stores competitors on success", async () => {
    mockFetchOnce(true, competitorsFixture);
    const { result } = renderHook(() => useCompetitors("COMP_SUCCESS"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.competitors).toEqual(competitorsFixture);
    expect(global.fetch).toHaveBeenCalledWith(`/api/market/competitors?symbol=COMP_SUCCESS`);
  });

  it("leaves competitors null when the response is not ok", async () => {
    mockFetchOnce(false);
    const { result } = renderHook(() => useCompetitors("COMP_NOTOK"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.competitors).toBeNull();
  });

  it("leaves competitors null when fetch rejects", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useCompetitors("COMP_REJECT"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.competitors).toBeNull();
  });

  it("serves from cache (including a cached null) on a second mount without refetching", async () => {
    mockFetchOnce(false);
    const first = renderHook(() => useCompetitors("COMP_CACHE_NULL"));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.competitors).toBeNull();

    const callsAfterFirst = (global.fetch as jest.Mock).mock.calls.length;

    const second = renderHook(() => useCompetitors("COMP_CACHE_NULL"));
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.competitors).toBeNull();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(callsAfterFirst);
  });

  it("re-fetches when the symbol prop changes, and clears when it becomes null", async () => {
    mockFetchOnce(true, competitorsFixture);
    const { result, rerender } = renderHook(({ symbol }: { symbol: string | null }) => useCompetitors(symbol), {
      initialProps: { symbol: "COMP_CHANGE_A" as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.competitors).toEqual(competitorsFixture);

    rerender({ symbol: null });
    expect(result.current.competitors).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("ignores a stale response for a since-changed symbol (cancelled branch)", async () => {
    let resolveStaleFetch: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => (resolveStaleFetch = resolve)));

    const { result, rerender } = renderHook(({ symbol }: { symbol: string }) => useCompetitors(symbol), {
      initialProps: { symbol: "COMP_CANCEL_A" },
    });
    expect(result.current.loading).toBe(true);

    // Switching symbols before A's request settles marks it cancelled and kicks off B's fetch.
    mockFetchOnce(true, competitorsFixture);
    rerender({ symbol: "COMP_CANCEL_B" });
    await waitFor(() => expect(result.current.competitors).toEqual(competitorsFixture));
    expect(result.current.loading).toBe(false);

    // Now let the stale A request resolve with different data. The cancelled guard must stop
    // it from clobbering B's already-settled state.
    const staleData = { ...competitorsFixture, group: "Something Else" };
    resolveStaleFetch({ ok: true, json: () => Promise.resolve(staleData) });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.competitors).toEqual(competitorsFixture);
    expect(result.current.loading).toBe(false);
  });
});
