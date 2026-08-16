import { cacheLife } from "next/cache";
import { dailyPicks } from "../lib/daily-picks";
// From the neutral module rather than from ./bse-accuracy-lookup, which is `"use client"`: a value
// imported across that boundary arrives as a client reference and fails at prerender, not at build.
import { FALLBACK_EXAMPLES } from "../lib/suggestion-defaults";
import { BseAccuracyLookup } from "./bse-accuracy-lookup";

/**
 * The accuracy lookup, with the day's suggested companies resolved on the server.
 *
 * `"use cache"` rather than a plain `async` component, and that is the whole reason this file grew
 * a directive. Under Cache Components an uncached async component is a dynamic hole resolved per
 * request, which would have taken this section out of the landing page's prerender — a heavy price
 * for deciding what six chips should say. Cached, it stays part of the prerendered shell.
 *
 * The `board` profile, not `market`: these chips turn over once a day, so refreshing them every
 * sixty seconds would be pure churn. Five minutes is far more often than they can actually change
 * and is what keeps the day-rollover prompt — `dailyPicks` reads the clock, so the picks only
 * change once this entry is regenerated on or after midnight IST.
 *
 * No `<Suspense>` around it, deliberately. `dailyPicks` reads one JSON file off disk and never goes
 * to the network (see its own note), so there is nothing here worth streaming — a boundary would
 * add a fallback frame to a section that resolves instantly.
 */
export async function AccuracyMatrixSection() {
  "use cache";
  cacheLife("board");

  const examples = await dailyPicks({ count: 6, fallback: FALLBACK_EXAMPLES }).catch(() => []);

  return (
    <section
      id="accuracy"
      className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(15,23,42,0.4)] transition-colors dark:border-slate-800 dark:bg-slate-900"
    >
      <BseAccuracyLookup examples={examples.length ? examples : FALLBACK_EXAMPLES} />
    </section>
  );
}
