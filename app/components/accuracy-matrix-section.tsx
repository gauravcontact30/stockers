import { Suspense } from "react";
import { getAccuracyMetrics, type AccuracyMetrics } from "../lib/accuracy-matrix";
import { BseAccuracyLookup } from "./bse-accuracy-lookup";

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: string;
};

function formatDate(value: string | undefined): string {
  if (!value) return "Not generated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function MetricCard({ label, value, detail, tone }: MetricCardProps) {
  return (
    <div className={`rounded-3xl border p-5 shadow-[0_18px_50px_-34px_rgba(15,23,42,0.55)] ${tone}`}>
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{detail}</p>
    </div>
  );
}

function AccuracyFallback() {
  return (
    <section className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-38px_rgba(15,23,42,0.4)] dark:border-slate-800 dark:bg-slate-900 sm:p-8">
      <div className="h-4 w-44 animate-pulse rounded-full bg-emerald-100 dark:bg-emerald-500/20" />
      <div className="mt-4 h-7 w-full max-w-xl animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 h-8 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </section>
  );
}

export async function AccuracyMatrixSection() {
  const metrics = await getAccuracyMetrics();
  const hasPredictions = metrics.validPredictionRows > 0;

  return (
    <AccuracyMatrixView metrics={metrics} hasPredictions={hasPredictions} />
  );
}

function AccuracyMatrixView({ metrics, hasPredictions }: { metrics: AccuracyMetrics; hasPredictions: boolean }) {
  return (
    <section
      id="accuracy"
      className="scroll-mt-28 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_-38px_rgba(15,23,42,0.4)] transition-colors dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-6 sm:p-8 dark:border-slate-800 dark:from-emerald-500/10 dark:via-slate-900 dark:to-rose-500/10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
              Accuracy matrix
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              BSE stock coverage, exchange tape and prediction confidence in one check
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              The matrix verifies the identifiers needed for lookup and scoring, then lets you test a specific BSE-listed
              stock for catalogue completeness, latest Bhavcopy coverage and prediction availability.
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-white/80 p-4 text-sm text-slate-700 shadow-sm dark:border-rose-500/30 dark:bg-slate-950/50 dark:text-slate-300">
            <p className="font-semibold text-rose-700 dark:text-rose-300">Prediction accuracy is not claimed as 100%.</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Market outcomes need forward backtesting. Confidence is a 0-100 model score, not a guaranteed win rate.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-6 sm:p-8 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="BSE matrix coverage"
          value={`${metrics.bseMatrixCoverage}%`}
          detail={`${metrics.completeCatalogueRows.toLocaleString("en-IN")} of ${metrics.catalogueTotal.toLocaleString("en-IN")} listed rows include symbol, name, scrip code, Yahoo symbol, sector and cap tier.`}
          tone="border-emerald-200 bg-emerald-50/85 dark:border-emerald-500/30 dark:bg-emerald-500/10"
        />
        <MetricCard
          label="BSE stocks mapped"
          value={metrics.catalogueTotal.toLocaleString("en-IN")}
          detail={`${metrics.sectorsCovered} sector buckets with ${metrics.nseLinked.toLocaleString("en-IN")} NSE-linked and ${metrics.bseOnly.toLocaleString("en-IN")} BSE-only symbols.`}
          tone="border-sky-200 bg-sky-50/85 dark:border-sky-500/30 dark:bg-sky-500/10"
        />
        <MetricCard
          label="Prediction universe"
          value={`${metrics.predictionCoverage}%`}
          detail={`${metrics.validPredictionRows.toLocaleString("en-IN")} of ${metrics.predictionUniverse.toLocaleString("en-IN")} curated stocks have valid Bullish, Bearish or Neutral prediction rows.`}
          tone="border-amber-200 bg-amber-50/85 dark:border-amber-500/30 dark:bg-amber-500/10"
        />
        <MetricCard
          label="Prediction confidence"
          value={hasPredictions ? `${metrics.averageConfidence}% avg` : "Pending"}
          detail={
            hasPredictions
              ? `Highest current confidence is ${metrics.highestConfidence}%. Source: ${metrics.predictionSource}, generated ${formatDate(metrics.predictionGeneratedAt)}.`
              : "Prediction cache has not been generated for the current stock universe yet."
          }
          tone="border-rose-200 bg-rose-50/85 dark:border-rose-500/30 dark:bg-rose-500/10"
        />
      </div>

      <BseAccuracyLookup />

      <div className="grid gap-0 border-t border-slate-200 dark:border-slate-800 lg:grid-cols-3">
        {[
          {
            title: "Data matrix",
            body: "Every BSE row is checked for symbol, company name, scrip code, Yahoo ticker, sector and cap tier before it is counted as complete.",
          },
          {
            title: "Scoring matrix",
            body: "Stock-level checks add latest exchange-tape coverage from the BSE Bhavcopy where the scrip traded in the current session.",
          },
          {
            title: "Prediction result",
            body: "Curated prediction rows return Bullish, Bearish or Neutral with a confidence score; non-curated BSE names are clearly marked not covered.",
          },
        ].map((item, index) => (
          <div
            key={item.title}
            className={`p-6 sm:p-8 ${index > 0 ? "border-t border-slate-200 dark:border-slate-800 lg:border-t-0 lg:border-l" : ""}`}
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StreamedAccuracyMatrixSection() {
  return (
    <Suspense fallback={<AccuracyFallback />}>
      <AccuracyMatrixSection />
    </Suspense>
  );
}
