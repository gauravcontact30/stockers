"use client";

export type BseAiResearchMetricCard = {
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "good" | "bad" | "watch";
};

export type BseAiResearchMetricsView = {
  title: string;
  subtitle: string;
  asOf: string;
  source: string;
  trend: string;
  risk: string;
  confidence: string;
  summary: string;
  metrics: BseAiResearchMetricCard[];
  signals: string[];
  warnings: string[];
  actionItems: string[];
};

const toneClass: Record<BseAiResearchMetricCard["tone"], string> = {
  neutral: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white",
  good: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100",
  bad: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100",
  watch: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100",
};

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BseAiResearchMetricsClient({ view }: { view: BseAiResearchMetricsView }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">BSE AI research metrics</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{view.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{view.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {view.trend}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            Risk {view.risk}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            Confidence {view.confidence}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.metrics.map((metric) => (
          <article key={metric.label} className={`rounded-lg border p-3 ${toneClass[metric.tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-xs opacity-75">{metric.hint}</p>
          </article>
        ))}
      </div>

      <p className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        {view.summary}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ListBlock title="Signals" items={view.signals} />
        <ListBlock title="Warnings" items={view.warnings} />
        <ListBlock title="Next checks" items={view.actionItems} />
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
        As of {view.asOf}. {view.source}. Not investment advice.
      </p>
    </section>
  );
}
