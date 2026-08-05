"use client";

export function PortfolioCard() {
  const holdings = [
    { name: "Reliance", weight: 30, outlook: "Positive" },
    { name: "HDFC Bank", weight: 25, outlook: "Stable" },
    { name: "Infosys", weight: 20, outlook: "Moderate" },
    { name: "TCS", weight: 25, outlook: "Positive" },
  ];

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Portfolio view</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">AI guided position mix</h3>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          Risk balanced
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {holdings.map((holding) => (
          <div key={holding.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">{holding.name}</span>
              <span className="text-sm text-slate-600">{holding.weight}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${holding.weight}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-600">Outlook: {holding.outlook}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
