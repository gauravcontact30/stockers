"use client";

const bars = [42, 76, 58, 84, 63, 90];

export function AnalyticsPanel() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Analytics</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Signal strength by week</h3>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          Trend view
        </div>
      </div>
      <div className="mt-6 flex h-48 items-end gap-3">
        {bars.map((bar, index) => (
          <div key={index} className="flex flex-1 flex-col items-center gap-2">
            <div className="w-full rounded-t-2xl bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ height: `${bar}%` }} />
            <span className="text-sm text-slate-500">W{index + 1}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
