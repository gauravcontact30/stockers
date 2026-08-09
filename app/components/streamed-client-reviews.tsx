import { Suspense } from "react";
import { listClientReviews } from "../lib/client-reviews";
import { ClientReviewsCarousel } from "./client-reviews-carousel";

function ClientReviewsFallback() {
  return (
    <section className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b border-slate-200 bg-gradient-to-br from-rose-50 via-white to-emerald-50 p-6 sm:p-8 lg:border-r lg:border-b-0 dark:border-slate-800 dark:from-rose-500/10 dark:via-slate-900 dark:to-emerald-500/10">
          <div className="h-4 w-36 animate-pulse rounded-full bg-rose-100 dark:bg-rose-500/20" />
          <div className="mt-4 h-7 w-full max-w-sm animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
          <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="p-6 sm:p-8">
          <div className="min-h-[390px] rounded-3xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
              <div className="flex-1">
                <div className="h-4 w-44 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="mt-3 h-3 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              </div>
            </div>
            <div className="mt-10 space-y-3">
              <div className="h-4 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

async function ClientReviewsPayload() {
  const reviews = await listClientReviews();
  return <ClientReviewsCarousel initialReviews={reviews} />;
}

export function StreamedClientReviews() {
  return (
    <Suspense fallback={<ClientReviewsFallback />}>
      <ClientReviewsPayload />
    </Suspense>
  );
}
