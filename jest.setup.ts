import "@testing-library/jest-dom";

// jsdom doesn't implement matchMedia — several components/hooks probe it defensively.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// jsdom implements window.scrollTo as a stub that logs "not implemented" — replace with a
// silent jest.fn() so back-to-top's click handler doesn't spam test output.
window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Every component under test that fetches data is responsible for mocking the specific
// response it needs; this default just guarantees `fetch` always exists in jsdom and fails
// loudly (rejected promise) instead of throwing "fetch is not defined" when a test forgets to
// stub it.
if (!global.fetch) {
  global.fetch = jest.fn(() => Promise.reject(new Error("fetch was not mocked for this test"))) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
