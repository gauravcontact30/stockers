// jsdom, plus the Web platform globals jsdom does not implement but Node does.
//
// Why this exists: importing `next/cache` — which any server component using `use cache`,
// `cacheLife` or `cacheTag` must do — pulls in Next's `unstable-cache` module, and that reaches
// `patch-fetch`, which references `Request` at module scope. jsdom has no `Request`, so the import
// throws `ReferenceError: Request is not defined` and the whole suite fails to load before a single
// test runs. It is not the component that is broken; it is the environment that is missing a global
// every browser has had for years.
//
// jest-environment-jsdom builds its own vm realm, so Node's `Request` is not visible inside it even
// though the process has one. The bridge is to copy the constructors across after the realm is
// built. This is the same argument as the `TextEncoder`/`ResizeObserver` patches in jest.setup.ts,
// just at the point in the lifecycle where a *module-scope* reference can still see them —
// setupFilesAfterEach runs too late for an import that throws while loading.
//
// `fetch` is deliberately NOT in the list. jest.setup.ts installs a `fetch` that rejects loudly so
// a test that forgets to mock one fails with a clear message; handing it Node's real `fetch`
// instead would let an unmocked test quietly reach the live BSE.

const JSDOMEnvironment = require("jest-environment-jsdom").default;

/**
 * Constructors and types the Web-standard `Request`/`Response` pair needs to be usable, and which
 * jsdom omits. Everything here is copied by reference from the Node realm, so it behaves exactly as
 * it does on the server side of the app.
 */
const WEB_GLOBALS = [
  "Request",
  "Response",
  "Headers",
  "FormData",
  "Blob",
  "File",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "AbortController",
  "AbortSignal",
  "structuredClone",
];

class JsdomWithWebApis extends JSDOMEnvironment {
  constructor(config, context) {
    super(config, context);

    for (const name of WEB_GLOBALS) {
      // Never overwrite something jsdom does provide — its own implementation is the one the rest
      // of the DOM in this realm is wired to.
      if (this.global[name] === undefined && globalThis[name] !== undefined) {
        this.global[name] = globalThis[name];
      }
    }
  }
}

module.exports = JsdomWithWebApis;
