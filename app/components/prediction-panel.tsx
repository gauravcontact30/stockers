"use client";

export function PredictionPanel({ symbol }: { symbol: string }) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Prediction view</p>
      <h3 className="mt-2 text-2xl font-semibold text-slate-900">{symbol} outlook</h3>
      <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-lg font-semibold text-slate-900">Bullish momentum outlook</p>
        <p className="mt-2 text-sm text-slate-600">
          Technical structure and macro sentiment suggest upside potential over the next trading window if support holds.
        </p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Support", value: "₹2,350" },
          { label: "Resistance", value: "₹2,540" },
          { label: "Confidence", value: "82%" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-1 font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
