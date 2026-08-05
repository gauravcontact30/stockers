"use client";

import { useEffect, useState } from "react";

type NewsItem = {
  title: string;
  summary: string;
  sentiment: string;
};

export function MarketNews() {
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    fetch("/api/news")
      .then((response) => response.json())
      .then((data) => setNews(data));
  }, []);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">Market news</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Current market pulse</h3>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          Live-style feed
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {news.map((item) => (
          <article key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-slate-900">{item.title}</h4>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700">
                {item.sentiment}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
