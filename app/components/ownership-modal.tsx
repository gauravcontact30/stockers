"use client";

import { useEffect, useState } from "react";
import type { Ownership, OwnerSlice } from "./ownership-board";
import { AppleModal } from "./apple-modal";
import { CompanyLogo } from "./company-logo";
import { PieChart, type Slice } from "./pie-chart";

/**
 * Who owns one company, as an interactive pie.
 *
 * Opened from a row on any of the market boards, so a reader who has just seen a company move can
 * ask who actually holds it without leaving the page. The figures are the company's own quarterly
 * filing — promoters, foreign portfolio investors, domestic institutions, government, individual
 * shareholders — read through the same `/api/market/shareholding` endpoint the ownership board uses.
 * Nothing here is inferred from price or volume.
 *
 * Fetched when it opens rather than with the board: a page of five rows would otherwise pull five
 * filings nobody had asked to see.
 */
export function OwnershipModal({ symbol, onClose }: { symbol: string | null; onClose: () => void }) {
  const [data, setData] = useState<Ownership | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/market/shareholding?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as Ownership & { error?: string };
        if (!response.ok) throw new Error(body.error || "No filing could be read for this company.");
        return body;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((failure: Error) => {
        if (controller.signal.aborted) return;
        setError(failure.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [symbol]);

  // Only the classes that actually hold something. A filing that reports 0% government holding is
  // reporting an absence, and a zero-width wedge is noise on the chart and a row of nothing in the
  // legend.
  const held: OwnerSlice[] = (data?.groups ?? []).filter((slice) => slice.percent > 0);

  const slices: Slice[] = held.map((slice) => ({
    key: slice.key,
    label: slice.label,
    value: slice.percent,
    meta: slice.holders ? `${slice.holders.toLocaleString("en-IN")} holders` : undefined,
  }));

  return (
    <AppleModal
      open={symbol !== null}
      onClose={onClose}
      label={symbol ? `Who owns ${symbol}` : "Shareholding"}
      header={
        <div className="flex items-center gap-3">
          {symbol && <CompanyLogo symbol={symbol} size={32} />}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{data?.company ?? symbol}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {data?.quarter ? `Shareholding as filed for ${data.quarter}` : "Shareholding, from the company's own filing"}
            </p>
          </div>
        </div>
      }
    >
      {loading && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Reading the filing...</p>}

      {error && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-4">
          {/* Percent of the register, so the centre reads "100%" of what the filing accounts for. */}
          <PieChart
            slices={slices}
            total="Shareholding"
            unit="%"
            empty="This company's latest filing does not break its register down."
          />

          {held.length > 0 && (
            <dl className="grid gap-1.5 sm:grid-cols-2">
              {held.map((slice) => (
                <div
                  key={slice.key}
                  className="flex items-baseline justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                >
                  <dt className="min-w-0 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {slice.label}
                  </dt>
                  <dd className="shrink-0 text-[12px] font-bold tabular-nums text-slate-900 dark:text-white">
                    {slice.percent.toFixed(2)}%
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Every figure is a category the filing itself reports. Nothing is inferred from price or volume.
          </p>
        </div>
      )}
    </AppleModal>
  );
}
