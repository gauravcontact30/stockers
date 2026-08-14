// Measures the Core Web Vitals of a running build, so a claim about performance can be checked
// rather than asserted.
//
//   node scripts/measure-vitals.mjs [origin] [runs]
//
// Defaults to http://localhost:3100 and 3 runs per page. Point it at a `next start` build, not at
// `next dev`: dev compiles on demand and its numbers describe the compiler, not the site.
//
// What it reports, per page, as the median of the runs:
//
//   TTFB  time to first byte — how long the server took before the browser had anything
//   FCP   first contentful paint — when something appeared
//   LCP   largest contentful paint — when the main thing appeared. A Core Web Vital.
//   CLS   cumulative layout shift — how much the page moved under the reader. A Core Web Vital.
//   TBT   total blocking time — main-thread work over 50ms, the lab stand-in for INP
//   JS    bytes of script the page actually downloaded
//
// The median rather than the mean: one slow cold run should not be able to move the figure, and
// with three runs the median is the middle one rather than an average of a warm-up and two real
// measurements.

import { chromium } from "playwright";

const origin = process.argv[2] ?? "http://localhost:3100";
const runs = Number(process.argv[3] ?? 3);

/** The pages worth measuring: the landing page, and the two heaviest routes behind it. */
const PAGES = ["/", "/news", "/dashboard"];

/**
 * Collected in the page rather than from the CDP performance domain, because these are the same
 * observers the browser reports the real user metrics from — LCP as the last entry before the page
 * is hidden, CLS as the sum of unexpected shifts, TBT from long tasks.
 */
const COLLECT = `
new Promise((resolve) => {
  const state = { lcp: 0, cls: 0, tbt: 0 };

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.lcp = Math.max(state.lcp, entry.startTime);
  }).observe({ type: "largest-contentful-paint", buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // Shifts the reader caused by clicking or typing are expected and do not count.
      if (!entry.hadRecentInput) state.cls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.tbt += Math.max(0, entry.duration - 50);
  }).observe({ type: "longtask", buffered: true });

  // Long enough for the boards on this site to stream in and for their layout to settle.
  setTimeout(() => {
    const nav = performance.getEntriesByType("navigation")[0] ?? {};
    const paint = performance.getEntriesByName("first-contentful-paint")[0];

    resolve({
      ttfb: nav.responseStart ?? 0,
      fcp: paint ? paint.startTime : 0,
      lcp: state.lcp,
      cls: state.cls,
      tbt: state.tbt,
    });
  }, 6000);
})
`;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(browser, path) {
  const samples = [];

  for (let run = 0; run < runs; run++) {
    // A fresh context each run: a warm HTTP cache would measure the second visit, and the figure
    // that matters is what somebody arriving for the first time waits through.
    const context = await browser.newContext();
    const page = await context.newPage();

    let scriptBytes = 0;
    page.on("response", async (response) => {
      if (!response.url().endsWith(".js") && !response.url().includes("/_next/static/chunks/")) return;
      try {
        const body = await response.body();
        scriptBytes += body.length;
      } catch {
        // A response that was served from a redirect or aborted has no body to size. Skipping it
        // undercounts by nothing that was actually downloaded.
      }
    });

    await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 60_000 });
    const vitals = await page.evaluate(COLLECT);

    samples.push({ ...vitals, js: scriptBytes });
    await context.close();
  }

  return {
    path,
    ttfb: Math.round(median(samples.map((s) => s.ttfb))),
    fcp: Math.round(median(samples.map((s) => s.fcp))),
    lcp: Math.round(median(samples.map((s) => s.lcp))),
    cls: Number(median(samples.map((s) => s.cls)).toFixed(4)),
    tbt: Math.round(median(samples.map((s) => s.tbt))),
    jsKb: Math.round(median(samples.map((s) => s.js)) / 1024),
  };
}

const browser = await chromium.launch();
const results = [];

for (const path of PAGES) {
  try {
    results.push(await measure(browser, path));
  } catch (error) {
    results.push({ path, error: String(error).split("\n")[0] });
  }
}

await browser.close();

console.log(JSON.stringify({ origin, runs, at: new Date().toISOString(), results }, null, 2));
