import { Suspense } from "react";
import { listClientReviews } from "../lib/client-reviews";
import { ClientReviewsCarousel } from "./client-reviews-carousel";

function ClientReviewsFallback() {
  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white p-5 sm:p-7 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-32 animate-pulse rounded-full bg-emerald-100 dark:bg-emerald-500/20" />
      <div className="mt-3 h-6 w-72 max-w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="h-2.5 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function ClientReviewsPayload() {
  return <ClientReviewsCarousel reviews={await listClientReviews()} />;
}

export function StreamedClientReviews() {
  return (
    <Suspense fallback={<ClientReviewsFallback />}>
      <ClientReviewsPayload />
    </Suspense>
  );
}
