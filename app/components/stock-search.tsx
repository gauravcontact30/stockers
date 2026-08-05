"use client";

import { useMemo, useState } from "react";

const stockOptions = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy & Petrochemicals" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "Information Technology" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", name: "Infosys", sector: "Information Technology" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
];

export function StockSearch({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return stockOptions;
    return stockOptions.filter((entry) =>
      entry.symbol.toLowerCase().includes(value) || entry.name.toLowerCase().includes(value)
    );
  }, [query]);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <label className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Search stocks</label>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-3 w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none"
        placeholder="Type a company or symbol"
      />
      <div className="mt-3 space-y-2">
        {filtered.map((item) => (
          <button
            key={item.symbol}
            onClick={() => {
              onSelect(item.symbol);
              setQuery(item.symbol);
            }}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left"
          >
            <div>
              <p className="font-semibold text-slate-900">{item.symbol}</p>
              <p className="text-sm text-slate-600">{item.name}</p>
            </div>
            <span className="text-sm text-slate-500">{item.sector}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
