"use client";

import { useEffect, useRef, useState } from "react";
import type { BseMoverPage } from "../lib/bse-market";
import { formatPercent, moveTone } from "../lib/market-format";
import { buildMoversUrl, type MoverDirection, type MoverTierKey } from "../lib/market-urls";
import { CapTierBadge } from "./cap-tier-badge";
import { CompanyLogo } from "./company-logo";
import { SectorPill } from "./sector-pill";
import { useStockDetail } from "./stock-detail-provider";
import { pageWindow, useMarketFeed, type Prefetched } from "./market-section";
import { StockCombobox } from "./stock-combobox";

/**
 * One cap tier's gainers and losers, over the whole exchange.
 *
 * Ranking, searching and paging all happen on the server. That is the only way this can honestly
 * claim to cover "almost all" of the BSE: the small-cap tier alone runs to thousands of scrips, and
 * shipping two thousand rows to the browser so it could show five of them would cost more than
 * everything the rest of this page saves. `/api/market/bse/movers` already ranks the full tier and
 * hands back one page, so a reader can walk the entire list five at a time and the browser never
 * holds more than five.
 *
 * The tier is chosen once and governs both cards, so "Large cap" means the large-cap gainers and
 * the large-cap losers and nothing else is on screen.
 */

/** Five a page, as asked — and five sector lookups per page turn rather than fifty. */
const PAGE_SIZE = 5;

const TIERS: { key: Exclude<MoverTierKey, "all">; label: string; blurb: string }[] = [
  { key: "large", label: "Large cap", blurb: "The exchange's hundred biggest companies by market value." },
  { key: "mid", label: "Mid cap", blurb: "Ranks 101 to 250, as SEBI defines the tier." },
  { key: "small", label: "Small cap", blurb: "Everything below rank 250 — most of the exchange by count." },
];

const SIDES: {
  direction: MoverDirection;
  title: string;
  chrome: string;
  accent: string;
  empty: string;
}[] = [
  {
    direction: "gainers",
    title: "Top gainers",
    chrome: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/25 dark:bg-emerald-500/10",
    accent: "text-emerald-700 dark:text-emerald-300",
    empty: "Nothing higher in this tier today.",
  },
  {
    direction: "losers",
    title: "Top losers",
    chrome: "border-rose-200 bg-rose-50/70 dark:border-rose-500/25 dark:bg-rose-500/10",
    accent: "text-rose-700 dark:text-rose-300",
    empty: "Nothing lower in this tier today.",
  },
];

/** How long the search box settles before it becomes a request. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * One company.
 *
 * A white row on a white card, separated by its own rounding and spacing. These rows carried a
 * rotating wash and then a rotating outline; both read as decoration competing with the only colour
 * on the line that carries meaning, which is the direction of the move. The rank number is the
 * row's place in the whole ranking, not on the page, so paging reads as one continuous list.
 */
function Row({ row, rank }: { row: BseMoverPage["rows"][number]; rank: number }) {
  // The whole row opens the company's detail sheet, the same as every other board on the site.
  // These two cards were the exception: a reader who saw a stock at the top of Top Gainers had no
  // way to ask why from here, and had to go and find the company somewhere else on the page.
  const { openStock } = useStockDetail();

  return (
    <li>
      <button
        type="button"
        onClick={() => openStock(row.ticker)}
        aria-label={`Open ${row.ticker} detail`}
        className="flex w-full items-center gap-2 rounded-xl bg-white px-2 py-1.5 text-left transition-colors hover:brightness-[0.98] dark:bg-slate-900"
      >
        <span className="w-5 shrink-0 text-right text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
          {rank}
        </span>
        <CompanyLogo symbol={row.ticker} size={22} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold text-slate-900 dark:text-white">{row.ticker}</span>
            <CapTierBadge raw={row.capTier} />
          </span>
          <span className="block truncate text-[9px] text-slate-500 dark:text-slate-400">{row.name}</span>
          {/* The industry the exchange files it under. Two companies moving the same amount are a
              very different story if one is a bank and the other a smelter. */}
          <SectorPill sector={row.sector} className="mt-0.5" />
        </span>
        <span className={`shrink-0 text-[11px] font-bold tabular-nums ${moveTone(row.returnPercent)}`}>
          {formatPercent(row.returnPercent)}
        </span>
      </button>
    </li>
  );
}

function SideCard({
  tier,
  direction,
  title,
  chrome,
  accent,
  empty,
  prefetched,
}: {
  tier: Exclude<MoverTierKey, "all">;
  direction: MoverDirection;
  title: string;
  chrome: string;
  accent: string;
  empty: string;
  /**
   * This side's opening page, resolved on the server. Null for every card except the two the
   * landing page opens on — see ./streamed-tier-movers.
   */
  prefetched?: Prefetched<BseMoverPage>;
}) {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);

  // The box settles before it becomes a request.
  //
  // The first run is skipped, and that is not a micro-optimisation: the effect also resets the page,
  // so a mount-time run left a timer that fired 300ms later and snapped the reader back to page one
  // if they had turned a page in the meantime. Same guard, same reason, as `BseMoversBoard`.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) {
      typed.current = true;
      return;
    }

    const timer = setTimeout(() => {
      setTerm(input.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // Changing tier is a different list, so page thirty of the large caps is not a place to land in
  // a two-page small-cap result.
  useEffect(() => {
    setPage(1);
  }, [tier]);

  const { data, loading, error } = useMarketFeed<BseMoverPage>(
    buildMoversUrl(tier, direction, "1d", term, "0", page, PAGE_SIZE),
    prefetched,
  );

  const rows = data?.rows ?? [];
  const pages = data?.pages ?? 1;
  const total = data?.total ?? 0;
  const current = Math.min(page, pages);

  return (
    <section className={`flex flex-col rounded-3xl border p-4 ${chrome}`} aria-label={`${title} — ${tier}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accent}`}>{title}</p>
        <p className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          {total.toLocaleString("en-IN")} companies
        </p>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          {/* The same picker the rest of the site searches with: every suggestion carries the
              company's own logo, its name and its last traded price, drawn from the whole
              catalogue rather than from the five rows currently on screen. */}
          <StockCombobox
            value={input}
            onChange={setInput}
            onSelect={setInput}
            placeholder="Search a company"
          />
        </div>
        {input !== "" && (
          <button
            type="button"
            onClick={() => setInput("")}
            className="h-10 shrink-0 rounded-xl border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}

      {!error && rows.length === 0 && !loading && (
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          {term ? `Nothing in this tier matches "${term}".` : empty}
        </p>
      )}

      {/* Held at reduced opacity while the next page loads rather than blanked to a skeleton: no
          layout jump, and the figures never flash away between page turns. */}
      <ol className={`mt-2 flex flex-1 flex-col gap-1 transition-opacity ${loading ? "opacity-50" : "opacity-100"}`}>
        {rows.map((row, index) => (
          <Row key={row.code} row={row} rank={(current - 1) * PAGE_SIZE + index + 1} />
        ))}
      </ol>

      {pages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
            Page {current} of {pages.toLocaleString("en-IN")}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Prev
            </button>
            {pageWindow(current, pages).map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => setPage(number)}
                aria-current={number === current ? "page" : undefined}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tabular-nums transition ${
                  number === current
                    ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {number}
              </button>
            ))}
            <button
              type="button"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function TierMovers({
  prefetched,
}: {
  /**
   * The opening tier's two sides, resolved on the server and keyed by direction.
   *
   * Only the tier the board opens on is seeded. Switching to mid or small cap is a question the
   * server was never asked, so those cards fetch as they always did.
   */
  prefetched?: { gainers: Prefetched<BseMoverPage>; losers: Prefetched<BseMoverPage> };
} = {}) {
  const [tier, setTier] = useState<Exclude<MoverTierKey, "all">>("large");
  const chosen = TIERS.find((entry) => entry.key === tier) ?? TIERS[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Cap tier" className="flex flex-wrap gap-1.5">
          {TIERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTier(entry.key)}
              aria-pressed={tier === entry.key}
              className={`h-9 rounded-full border px-4 text-xs font-semibold transition ${
                tier === entry.key
                  ? "border-transparent bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{chosen.blurb}</p>
      </div>

      {/* Both sides of the chosen tier, each on its own card with its own search and its own pages.
          Keyed by tier so switching gives each card fresh state rather than carrying page nine of
          the large caps into a small-cap list. */}
      <div className="grid gap-3 xl:grid-cols-2">
        {SIDES.map((side) => (
          <SideCard
            key={`${tier}-${side.direction}`}
            tier={tier}
            direction={side.direction}
            title={side.title}
            chrome={side.chrome}
            accent={side.accent}
            empty={side.empty}
            prefetched={prefetched?.[side.direction]}
          />
        ))}
      </div>
    </div>
  );
}

export { PAGE_SIZE as TIER_MOVERS_PAGE_SIZE };
