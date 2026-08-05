"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalysisResponse } from "./ai-analysis-report";
import { AiReportModal } from "./ai-report-modal";

type IpoStatus = "upcoming" | "open" | "listing_soon";

type PipelineIpo = {
  id: string;
  company: string;
  sector: string;
  domain: string;
  exchange: string;
  summary: string;
  logo: string;
  status: IpoStatus;
  priceBandMin?: number;
  priceBandMax?: number;
  issueSizeCr?: number;
  openDate?: string;
  closeDate?: string;
  listingDate?: string;
};

type AnticipatedIpo = {
  company: string;
  sector: string;
  domain: string;
  note: string;
  logo: string;
};

type IposState = {
  ipos: PipelineIpo[];
  anticipated: AnticipatedIpo[];
  asOfDate: string;
  source: string;
};

const STATUS_META: Record<IpoStatus, { label: string; badge: string }> = {
  open: {
    label: "Open for subscription",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  listing_soon: {
    label: "Subscription closed · listing soon",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  },
  upcoming: {
    label: "Opening soon",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  },
};

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function IpoLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        {name.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external favicon host, not part of the Next/Image domain allowlist
    <img
      src={src}
      alt={`${name} logo`}
      width={40}
      height={40}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1.5 dark:border-slate-700"
    />
  );
}

export function IpoListings() {
  const [state, setState] = useState<IposState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<string | undefined>(undefined);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/market/ipos");
      if (!response.ok) throw new Error("Failed to load IPOs");
      const data = await response.json();
      setState(data);
      setError(null);
    } catch {
      setError("Couldn't reach the IPO data feed right now. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; setState only ever runs after the async fetch resolves, not synchronously in this callback.
    load();
  }, [load]);

  const handleSelect = async (company: string, logo: string) => {
    setSelected(company);
    setSelectedLogo(logo);
    setAnalysisLoading(true);
    setAnalysis(null);

    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: company }),
    });
    const data = await response.json();
    setAnalysisLoading(false);
    setAnalysis(data);
  };

  const ipos = state?.ipos ?? [];
  const anticipated = state?.anticipated ?? [];

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-400">IPO watch</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Open and upcoming IPOs</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Mainboard IPOs currently open for subscription or coming up next, plus widely-reported names still awaiting a filing
            window. Click any company for a full AI report — positive news, risks to watch, and a future-outlook call.
          </p>
        </div>
        <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-400">
          Snapshot as of {state?.asOfDate ?? "…"}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40" />
          ))}

        {!loading &&
          ipos.map((ipo) => {
            const isActive = selected === ipo.company;
            const status = STATUS_META[ipo.status];
            const openDate = formatDate(ipo.openDate);
            const closeDate = formatDate(ipo.closeDate);
            const listingDate = formatDate(ipo.listingDate);

            return (
              <button
                key={ipo.id}
                type="button"
                onClick={() => handleSelect(ipo.company, ipo.logo)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isActive
                    ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-400 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                    : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-indigo-500/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <IpoLogo src={ipo.logo} name={ipo.company} />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">{ipo.company}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{ipo.sector} · {ipo.exchange}</p>
                  </div>
                </div>

                <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${status.badge}`}>
                  {status.label}
                </span>

                <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {ipo.priceBandMin && ipo.priceBandMax && (
                    <p>
                      Price band: <span className="font-semibold text-slate-900 dark:text-white">₹{ipo.priceBandMin}–₹{ipo.priceBandMax}</span>
                      {ipo.issueSizeCr && ` · ₹${ipo.issueSizeCr.toLocaleString("en-IN")} Cr issue`}
                    </p>
                  )}
                  {openDate && closeDate && (
                    <p>
                      Subscription: {openDate} – {closeDate}
                    </p>
                  )}
                  {listingDate && <p>Tentative listing: {listingDate}</p>}
                </div>

                <p className="mt-3 line-clamp-3 text-xs text-slate-600 dark:text-slate-400">{ipo.summary}</p>
              </button>
            );
          })}

        {!loading && ipos.length === 0 && !error && (
          <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">No open or upcoming IPOs in the current snapshot.</p>
        )}
      </div>

      {!loading && anticipated.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">On the radar · no filing window yet</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {anticipated.map((ipo) => {
              const isActive = selected === ipo.company;
              return (
                <button
                  key={ipo.company}
                  type="button"
                  onClick={() => handleSelect(ipo.company, ipo.logo)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    isActive
                      ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-400 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-indigo-500/30"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <IpoLogo src={ipo.logo} name={ipo.company} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{ipo.company}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{ipo.sector}</p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{ipo.note}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        {state?.source ?? "Listing details are a manually curated snapshot, not a live IPO calendar."} · Not investment advice.
      </p>

      <AiReportModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        loading={analysisLoading}
        analysis={analysis}
        logoUrl={selectedLogo}
        companyName={selected ?? undefined}
      />
    </section>
  );
}
