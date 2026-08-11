import "@testing-library/jest-dom";
import os from "node:os";
import path from "node:path";

// The account store gets its own file per worker, before any suite imports it.
//
// `app/lib/store` resolves its path once at module scope, and two suites exercise it. Jest runs
// suites in parallel workers, so pointed at the one real `app/data/users.json` they interleave:
// one suite's `writeFile("[]")` lands in the middle of the other's test and both fail, on a
// different assertion each run. Suites sharing a worker run one after another and are already
// bracketed by their own setup, so per-worker is as much separation as is needed — and it keeps a
// test run from being one truncation away from the developer's own accounts.
process.env.STOCKERS_USERS_FILE = path.join(
  os.tmpdir(),
  `stockers-test-users-${process.env.JEST_WORKER_ID ?? "0"}.json`,
);

// And the account store must not be pointed at a real Supabase project by a developer's .env.
//
// next/jest loads .env the same way `next dev` does, so the moment real credentials are put there
// — which is the whole point of them — every suite that exercises the store would stop testing the
// JSON file and start reading, writing and DELETING rows in a live database. That is a test run
// that costs real accounts, and it fails or passes depending on the network.
//
// Cleared here, once, before any suite imports `app/lib/store`. The two suites that do test the
// Supabase backend set these themselves and restore them afterwards, so they are unaffected.
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

// Same reasoning for the app's own origin. Suites assert on the links the mailer builds, and a
// developer who points APP_URL at the live domain to reproduce something would otherwise find the
// mailer tests failing for reasons that have nothing to do with their change.
delete process.env.APP_URL;
delete process.env.NEXT_PUBLIC_APP_URL;

// jsdom doesn't implement matchMedia — several components/hooks probe it defensively.
if (typeof window !== "undefined" && !window.matchMedia) {
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
if (typeof window !== "undefined") {
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo;
}

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

// jsdom ships no TextEncoder/TextDecoder, though every browser and Node have had them for years.
// The AI board read decodes a streamed response body with them, so without these it cannot be
// exercised under test at all. Taken from Node's own `util`, which is the same implementation the
// server side of the app uses.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";

global.TextEncoder ??= NodeTextEncoder as unknown as typeof TextEncoder;
global.TextDecoder ??= NodeTextDecoder as unknown as typeof TextDecoder;

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
