"use client";

const symbols = [
  { ticker: "RELIANCE", sentiment: "Bullish", change: "+2.4%" },
  { ticker: "HDFCBANK", sentiment: "Stable", change: "+0.6%" },
  { ticker: "TCS", sentiment: "Positive", change: "+1.1%" },
  { ticker: "INFY", sentiment: "Cautious", change: "-0.3%" },
];

export function WatchlistCard() {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Watchlist</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">AI suggested positions</h3>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          Updated today
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {symbols.map((item) => (
          <div key={item.ticker} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="font-semibold text-slate-900">{item.ticker}</p>
              <p className="text-sm text-slate-600">{item.sentiment}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">{item.change}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
