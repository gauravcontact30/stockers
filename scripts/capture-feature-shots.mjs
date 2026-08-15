// Photographs each AI feature from the running application, for the landing page slider.
//
//   npm run build && npx next start -p 3100
//   node scripts/capture-feature-shots.mjs [origin]
//
// Writes `public/feature-shots/<key>.png` and rewrites `app/data/feature-shots.json`, which is the
// manifest `app/lib/feature-shots.ts` reads. Neither is meant to be hand-edited.
//
// ---------------------------------------------------------------------------
// Why the pictures are taken rather than drawn
// ---------------------------------------------------------------------------
//
// The slider advertises eighteen AI features. A designer's impression of each would be quicker and
// would be a claim about the product rather than a picture of it — and the first time a board was
// redesigned, the landing page would be quietly advertising something that no longer exists. These
// are photographs of the real thing: the script signs in, opens each dashboard section, waits for
// the board to finish loading, and captures the panel.
//
// That has a cost worth stating plainly: the shots are only as current as the last run. The
// manifest records `capturedAt` for exactly that reason, and re-running this after a redesign is
// the intended workflow.
//
// ---------------------------------------------------------------------------
// Point it at `next start`, never at `next dev`
// ---------------------------------------------------------------------------
//
// Dev compiles routes on demand, so the first visit to a section paints a skeleton for seconds and
// the capture would photograph the skeleton. The same rule `measure-vitals.mjs` follows.
//
// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------
//
// Every AI feature sits behind a plan, so the script has to be somebody. It signs in through the
// application's own `/api/auth/signin` — no back door, no token minted out of band — using:
//
//   SHOTS_EMAIL      an account on the target deployment
//   SHOTS_PASSWORD   its password
//
// The account needs Elite-level access to reach the Elite sections; an admin account has it, and so
// does a test account (`app/lib/admin-access.ts`). Sections the account cannot see are skipped with
// a note rather than captured as a paywall, because a picture of a paywall is not a picture of the
// feature.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import nextEnv from "@next/env";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The same `.env` loading `next dev` itself does, so this reads the environment the app reads.
nextEnv.loadEnvConfig(ROOT);

const origin = process.argv[2] ?? "http://localhost:3100";
const email = process.env.SHOTS_EMAIL;
const password = process.env.SHOTS_PASSWORD;

const OUT_DIR = join(ROOT, "public", "feature-shots");
const MANIFEST = join(ROOT, "app", "data", "feature-shots.json");

/**
 * The features to photograph, and where each one lives.
 *
 * Only the fourteen without a bespoke hero scene: the other four already have a drawn scene on the
 * slider carrying live figures, and a screenshot would be a second, worse version of it.
 *
 * Kept here rather than imported from `app/lib/hero-rotation.ts` because that is TypeScript and
 * this is a plain script — the same reason `build-catalogue.mjs` restates what it needs. The test
 * `test/lib/hero-rotation.test.ts` checks the two lists agree.
 */
const TARGETS = [
  { key: "market-pulse", path: "/market-pulse" },
  { key: "sectors", path: "/sector-trends" },
  { key: "dividends", path: "/dividends" },
  { key: "ipos", path: "/ipos" },
  { key: "etf-board", path: "/etf-board" },
  { key: "news", path: "/news" },
  { key: "buy-tomorrow", path: "/outperform-tomorrow" },
  { key: "portfolio", path: "/portfolio" },
  { key: "intel", path: "/intelligence-search" },
  { key: "etf-research", path: "/etf-research" },
  { key: "directory", path: "/company-directory" },
  { key: "most-traded", path: "/most-traded" },
  { key: "mtf", path: "/mtf-watch" },
  { key: "stock-news", path: "/stocks-in-news" },
];

/**
 * The capture viewport.
 *
 * Wide and short on purpose. The slider renders the shot into a landscape panel roughly half a
 * card wide, so a tall portrait capture would be scaled down until nothing in it was legible. This
 * is the top of the board at a readable density.
 */
const VIEWPORT = { width: 1400, height: 900 };

/** The slice of the page kept. Cropping here rather than in CSS keeps the file small. */
const CLIP = { x: 0, y: 0, width: VIEWPORT.width, height: 620 };

/** How long to let a board settle before photographing it. */
const SETTLE_MS = 6_000;

/** Signs in through the app's own endpoint and returns the session token. */
async function signIn() {
  const response = await fetch(`${origin}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Sign-in failed (${response.status}): ${body.error ?? "no reason given"}`);
  }

  const { token } = await response.json();
  if (!token) throw new Error("Sign-in returned no token.");
  return token;
}

/**
 * Whether the page is showing the feature or a paywall.
 *
 * A gate renders a plans prompt instead of the board. Capturing that would put a picture of a
 * locked door on the landing page, which is the opposite of the point.
 */
async function isGated(page) {
  const gate = page.locator("text=/Upgrade to|Your plan does not include|Subscribe to unlock/i").first();
  return (await gate.count()) > 0;
}

async function capture(context, target) {
  const page = await context.newPage();

  try {
    await page.goto(`${origin}${target.path}`, { waitUntil: "load", timeout: 60_000 });

    // The boards stream in behind the shell. `networkidle` is unreliable here because several
    // panels poll, so this waits a fixed settle instead — long enough for the exchange feeds the
    // page opened with to land.
    await page.waitForTimeout(SETTLE_MS);

    if (await isGated(page)) {
      return { key: target.key, skipped: "the account cannot see this feature" };
    }

    await mkdir(OUT_DIR, { recursive: true });
    const file = `${target.key}.png`;
    await page.screenshot({ path: join(OUT_DIR, file), clip: CLIP });

    return {
      key: target.key,
      shot: {
        src: `/feature-shots/${file}`,
        width: CLIP.width,
        height: CLIP.height,
        capturedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { key: target.key, skipped: String(error).split("\n")[0] };
  } finally {
    await page.close();
  }
}

if (!email || !password) {
  console.error("Set SHOTS_EMAIL and SHOTS_PASSWORD to an account that can see the AI features.");
  process.exit(1);
}

const token = await signIn();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });

// Both halves of how the app carries a session: the cookie rides along on same-origin requests,
// and the localStorage entry is what the client components read on mount.
const { hostname } = new URL(origin);
await context.addCookies([{ name: "stockers_session", value: token, domain: hostname, path: "/" }]);
await context.addInitScript((value) => {
  window.localStorage.setItem("stockers-auth", JSON.stringify({ token: value }));
}, token);

const shots = {};
const skipped = [];

for (const target of TARGETS) {
  const result = await capture(context, target);
  if (result.shot) {
    shots[result.key] = result.shot;
    console.log(`captured ${result.key}`);
  } else {
    skipped.push(result);
    console.log(`skipped  ${result.key} — ${result.skipped}`);
  }
}

await browser.close();

// Written whole rather than merged into what is there. A merge would silently keep a picture of a
// board that has since been removed, and the manifest is meant to describe this run.
await writeFile(MANIFEST, `${JSON.stringify({ capturedAt: new Date().toISOString(), shots }, null, 2)}\n`, "utf8");

console.log(`\n${Object.keys(shots).length} captured, ${skipped.length} skipped → ${MANIFEST}`);
