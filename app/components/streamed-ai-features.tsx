// The AI features section, streamed into the landing page.
//
// Same argument as ./streamed-boards, applied to the one section on this page whose content comes
// from the database rather than from an exchange. `readFeatureLocks` is a Supabase round trip, and
// it sits between the hero and every board below it — so it goes behind its own boundary and the
// rest of the page flushes without waiting for it.

import { Suspense } from "react";
import { AiFeaturesPayload } from "./ai-features-showcase";
import { SectionSkeleton } from "./market-section";

/** The section's own chrome around a skeleton, so the streamed-in cards do not shift the page. */
export function AiFeaturesFallback() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-40 animate-pulse rounded-full bg-violet-100 dark:bg-violet-500/20" />
      <div className="mt-3 h-8 w-full max-w-xl animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-2 h-4 w-full max-w-2xl animate-pulse rounded-full bg-slate-50 dark:bg-slate-800/70" />
      <SectionSkeleton rows={3} height="h-28" />
    </section>
  );
}

export function StreamedAiFeatures() {
  return (
    <Suspense fallback={<AiFeaturesFallback />}>
      <AiFeaturesPayload />
    </Suspense>
  );
}
