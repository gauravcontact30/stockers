"use client";

import { useState } from "react";
import type { DashboardSectionId } from "./dashboard-sidebar";

/**
 * The old landing-page "Support & onboarding" promised generic help — sign up, pick a plan, get
 * ideas — and named nothing a reader could actually click. Now that every board lives in this
 * workspace, the useful version of that section is a map of it: what each destination answers,
 * which one to start from, and a jump straight there.
 */

type Route = { id: DashboardSectionId; label: string };

type Step = {
  title: string;
  detail: string;
  routes: Route[];
};

const STEPS: Step[] = [
  {
    title: "Start with the day",
    detail:
      "Market Pulse is the one screen that answers “what is happening right now” — live indices, how many stocks are advancing against declining, and the sharpest moves in each direction.",
    routes: [
      { id: "market-pulse", label: "Open Market Pulse" },
      { id: "sectors", label: "See which sectors moved" },
    ],
  },
  {
    title: "Ask your own question",
    detail:
      "Intelligence Search is the one board where the question is yours rather than ours. Name a company and it reads what Indian publishers have written about it, then answers in points — each one carrying the report it came from, so you can check any line at its source.",
    routes: [{ id: "intel", label: "Open Intelligence Search" }],
  },
  {
    title: "Find something to look at",
    detail:
      "Three different ways in, depending on what you know. Search a company by name, ticker, scrip code or ISIN; follow the money into the heaviest-traded names; or read what companies filed with the exchange today.",
    routes: [
      { id: "directory", label: "Company Directory" },
      { id: "most-traded", label: "Most Traded" },
      { id: "stock-news", label: "Stocks in News" },
    ],
  },
  {
    title: "Let the screeners narrow it down",
    detail:
      "Each screener asks one question and answers it with a scored list: what looks strongest today, what is set up for tomorrow, and which pullbacks still have an intact longer trend behind them.",
    routes: [
      { id: "top-picks", label: "Top Picks" },
      { id: "buy-tomorrow", label: "Outperform Tomorrow" },
      { id: "dip-winners", label: "Dip Winners" },
    ],
  },
  {
    title: "Test the idea before you act",
    detail:
      "Research gives you one company in depth. Compare puts two or three side by side — same sector for a like-for-like contest, or across sectors to see which is actually carrying its weight — and states an outperform, hold or underperform for each.",
    routes: [
      { id: "research", label: "Stock Research" },
      { id: "compare", label: "Compare stocks" },
    ],
  },
  {
    title: "Look past single stocks",
    detail:
      "Funds spread a single decision across a whole basket, dividends pay you for holding, MTF lets you borrow against a position, and IPOs are the pipeline of what is about to list.",
    routes: [
      { id: "etf-board", label: "ETF Board" },
      { id: "dividends", label: "Dividends" },
      { id: "mtf", label: "MTF Watch" },
      { id: "ipos", label: "IPO Watch" },
    ],
  },
];

const FAQS: { question: string; answer: string }[] = [
  {
    question: "Where do these numbers come from?",
    answer:
      "Prices, breadth and listings come from the exchanges themselves — BSE's scrip master and official Bhavcopy, and NSE's live feeds for indices, turnover, filings, dividends, ETFs and IPOs. Nothing on a board is sampled, estimated or filled in.",
  },
  {
    question: "What exactly is the AI doing?",
    answer:
      "It writes, it does not decide. Every outperform/hold/underperform call is computed from measured returns over a week, a month, six months and a year; the model is handed that call and asked to explain it in a sentence. It is told never to contradict it. Where there is no key configured, the same explanation is composed from the numbers directly and the panel says so.",
  },
  {
    question: "Why does a section sometimes show data but no AI panel?",
    answer:
      "The exchange boards are public data and stay visible to everyone. Only the AI layer on top of them is part of a plan, so when a trial lapses the board keeps working and the AI panel is what locks.",
  },
  {
    question: "A logo is missing next to a stock. Is something broken?",
    answer:
      "No. Logos are looked up by the ticker the exchange publishes, and the long tail of smaller listed companies simply has none on file. Rather than show a guessed logo that might belong to another business, those rows get a lettered tile.",
  },
  {
    question: "Is any of this investment advice?",
    answer:
      "No. Every section says so in its own footnote, and it is meant literally — these are measurements and an explanation of them, not a recommendation to outperform or underperform anything.",
  },
];

function StepCard({ step, index, onOpen }: { step: Step; index: number; onOpen: (id: DashboardSectionId) => void }) {
  return (
    <li className="relative rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-emerald-500/40">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold tabular-nums text-white">
          {index + 1}
        </span>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-slate-900 dark:text-white">{step.title}</h4>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.detail}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {step.routes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => onOpen(route.id)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
              >
                {route.label} →
              </button>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{question}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500 ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>
      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{answer}</p>}
    </li>
  );
}

export function GettingStarted({ onOpen }: { onOpen: (id: DashboardSectionId) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-[32px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-6 shadow-[0_20px_60px_-30px_rgba(5,150,105,0.45)] transition-colors sm:p-8 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-slate-900 dark:to-slate-900">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
          Getting started
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
          Seventeen boards, one workspace — here is the order to read them in
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Everything the exchanges publish and everything the AI desk scores now lives behind the sidebar on the left. This
          page is the map: what each destination answers, and the route most people take through them.
        </p>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">A working route through the dashboard</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Each step opens where it points — nothing here is a dead end.
        </p>
        <ol className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {STEPS.map((step, index) => (
            <StepCard key={step.title} step={step} index={index} onOpen={onOpen} />
          ))}
        </ol>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Questions worth answering up front</h3>
        <ul className="mt-4 space-y-2">
          {FAQS.map((faq) => (
            <Faq key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </ul>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] transition-colors sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Still stuck?</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Tell us what you were trying to work out and which board you were on — that is usually enough for us to
              either point you at the right one or fix it. Plan changes, billing and access questions go to the same place.
            </p>
            <a
              href="mailto:support@stockers.ai"
              className="mt-4 inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Email support@stockers.ai
            </a>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Two things worth knowing</p>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Every board is bookmarkable.</span> The
                open section lives in the URL, so <span className="tabular-nums">/dashboard#dividends</span> lands straight
                on it and the back button walks between them.
              </li>
              <li>
                <span className="font-semibold text-slate-800 dark:text-slate-200">The sidebar collapses.</span> Use the
                chevron at its top to drop to an icon rail when you want the width; the choice is remembered.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
