"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PeerGroup } from "../api/portfolio/peers/route";
import { formatMoney, formatPercent, toneFor } from "../lib/portfolio-metrics";
import {
  DEFAULT_FILTERS,
  filterMovers,
  filtersAreDefault,
  inCategory,
  moversBrief,
  paginate,
  PERIODS,
  rankAmongPeers,
  returnOf,
  sortMovers,
  splitMovers,
  versusPeers,
  type CompetitorRow,
  type MoverCategory,
  type MoverFilters,
  type MoverRow,
  type MoverSplit,
  type PeriodKey,
} from "../lib/portfolio-movers";
import { AiBoardRead } from "./ai-board-read";
import { AiGate } from "./ai-gate";
import { CompanyLogo } from "./company-logo";
import { CARD, EmptyPanel, ErrorNote, FIELD, LABEL, PanelHeading } from "./portfolio-chrome";
import { StockDetailTrigger } from "./stock-detail-provider";
import { authHeaders } from "./subscription-provider";
import { useWatchlist } from "./watchlist-card";

/**
 * Your top movers.
 *
 * Four cards and a table, over the two lists a reader keeps: the stocks they own, and the stocks
 * they are thinking about. Those are never mixed, because they are not the same news. A gainer in
 * the book is money already made; a gainer on the watchlist is an entry that just got more
 * expensive. Ranking them together would flatten the one distinction the reader most needs.
 *
 * The table underneath is the detail behind the cards: every stock in both lists, filterable,
 * searchable and paged, with each name placed against its own sector peers. That last column is
 * the point of the whole board — a holding up 4% on a day its sector is up 6% is not a winner, it
 * is a laggard in a rising sector, and no amount of green on a card will say so.
 */

type MoversPayload = { rows: MoverRow[]; generatedAt: string };

const SOURCE_BADGE: Record<MoverRow["source"], { label: string; style: string }> = {
  holding: { label: "Held", style: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  watchlist: { label: "Watching", style: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  both: { label: "Held + watching", style: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
};

// ---------------------------------------------------------------------------
// The four cards
// ---------------------------------------------------------------------------

function MoverLine({ row, period }: { row: MoverRow; period: PeriodKey }) {
  return (
    <li className="flex items-center gap-2.5 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <CompanyLogo symbol={row.symbol} size={24} />
      <div className="min-w-0 flex-1">
        <StockDetailTrigger symbol={row.symbol}>
          <span className="text-xs font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
            {row.symbol}
          </span>
        </StockDetailTrigger>
        <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{row.name ?? "—"}</p>
      </div>
      <div className="text-right">
        <p className={`font-mono text-xs font-bold tabular-nums ${toneFor(returnOf(row, period))}`}>
          {formatPercent(returnOf(row, period))}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{formatMoney(row.price)}</p>
      </div>
    </li>
  );
}

/** Which half of the split is on screen. */
type Side = "gainers" | "losers";

const SIDE_ACCENT: Record<Side, string> = {
  gainers: "border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  losers: "border-rose-200 bg-rose-50/60 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
};

/**
 * One side of one list.
 *
 * A tab and a dropdown rather than four cards at once. Four was a wall — two of them were always
 * the answer to a question the reader was not asking, and on a phone it was a column of sixteen
 * tickers to scroll past. Choosing the side and the list means the panel shows one thing, and the
 * counts on the tabs still say what is behind the other.
 */
function MoversPanel({
  side,
  category,
  split,
  period,
}: {
  side: Side;
  category: MoverCategory;
  split: MoverSplit;
  period: PeriodKey;
}) {
  const rows = side === "gainers" ? split.gainers : split.losers;
  const noun = category === "holdings" ? "holdings" : "watchlist stocks";
  const measured = split.gainers.length + split.losers.length + split.flat;

  return (
    <div className={`rounded-2xl border p-4 ${SIDE_ACCENT[side]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold">
          {side === "gainers" ? "Gainers" : "Losers"} · {category === "holdings" ? "Holdings" : "Watchlist"}
        </h4>
        <p className="text-[11px] opacity-80">
          {rows.length} of {measured} measured {noun}
        </p>
      </div>

      <p className="mt-0.5 text-[11px] opacity-80">
        {category === "holdings"
          ? side === "gainers"
            ? "Up on what you own — money already made."
            : "Down on what you own — the ones to look at."
          : side === "gainers"
            ? "Up on what you are watching — an entry getting more expensive."
            : "Down on what you are watching — an entry getting cheaper."}
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-[11px] italic opacity-70">
          No {noun} are {side === "gainers" ? "up" : "down"} over this window.
        </p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <MoverLine key={row.symbol} row={row} period={period} />
          ))}
        </ul>
      )}

      {split.unpriced > 0 && (
        <p className="mt-2 text-[10px] opacity-70">
          {split.unpriced} {noun} had no return over this window and are not counted either way.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/** The peer cells: how the sector did, and where this stock ranked inside it. */
function PeerCell({ row, period }: { row: MoverRow; period: PeriodKey }) {
  if (row.competitors.length === 0) {
    return (
      <span className="text-[10px] text-slate-400 dark:text-slate-500">
        {row.sector ? "No peers priced" : "Not classified"}
      </span>
    );
  }

  const gap = versusPeers(row, period);

  return (
    <div>
      <div className="flex flex-wrap justify-end gap-1">
        {row.competitors.slice(0, 4).map((peer) => (
          <span
            key={peer.symbol}
            title={`${peer.name} · ${formatPercent(peer.changePercent)}`}
            className="rounded-full border border-slate-200 px-1.5 py-0.5 font-mono text-[9px] font-bold dark:border-slate-700"
          >
            <span className="text-slate-500 dark:text-slate-400">{peer.symbol}</span>{" "}
            <span className={toneFor(peer.changePercent)}>{formatPercent(peer.changePercent)}</span>
          </span>
        ))}
      </div>
      {gap !== null && (
        <p className={`mt-1 text-[10px] font-semibold ${toneFor(gap)}`}>
          {gap >= 0 ? "Beating" : "Lagging"} the sector by {Math.abs(gap).toFixed(2)}pt
        </p>
      )}
    </div>
  );
}

function RankCell({ row }: { row: MoverRow }) {
  if (row.rank === null) return <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>;

  const top = row.rank === 1;
  const bottom = row.rank === row.peerCount;

  return (
    <div>
      <span
        className={`inline-block rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
          top
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
            : bottom
              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        #{row.rank}
      </span>
      <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">of {row.peerCount}</p>
    </div>
  );
}

function DividendCell({ row }: { row: MoverRow }) {
  if (!row.dividend) return <span className="text-[10px] text-slate-400 dark:text-slate-500">None declared</span>;

  return (
    <div>
      <p className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
        {row.dividend.amount === null ? "Declared" : `${formatMoney(row.dividend.amount)}/sh`}
      </p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        {row.dividend.kind}
        {row.dividend.exDate ? ` · ${row.dividend.upcoming ? "ex " : "went ex "}${row.dividend.exDate}` : ""}
      </p>
    </div>
  );
}

export function PortfolioMoversBoard() {
  const watchlist = useWatchlist();
  const [payload, setPayload] = useState<MoversPayload | null>(null);
  const [peerGroups, setPeerGroups] = useState<Map<string, PeerGroup>>(() => new Map());
  const [filters, setFilters] = useState<MoverFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  /** Which side of the split the cards panel is showing, and for which of the two lists. */
  const [side, setSide] = useState<Side>("gainers");
  const [cardCategory, setCardCategory] = useState<MoverCategory>("holdings");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Joined rather than passed as an array so the effect below re-runs when the list changes rather
  // than on every render that rebuilds an equal array.
  const watchParam = (watchlist ?? []).join(",");

  useEffect(() => {
    // `null` means the browser has not read localStorage yet. Fetching now would ask for the
    // holdings without the watchlist and then immediately ask again.
    if (watchlist === null) return;

    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/portfolio/movers?watch=${encodeURIComponent(watchParam)}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data?.error ?? "Couldn't load your movers.");
          return;
        }
        setPayload(data);
        setError(null);
      } catch {
        if (!controller.signal.aborted) setError("Couldn't reach the market feed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [watchParam, watchlist]);

  const rows = useMemo(() => payload?.rows ?? [], [payload]);

  // Filtering, sorting and paging all happen here rather than on the server: both lists together
  // are at most sixty rows, they are already in the browser, and doing it locally means a filter
  // applies as fast as it can be typed.
  const visible = useMemo(() => {
    const filtered = filterMovers(rows, filters);
    return paginate(sortMovers(filtered, filters), page);
  }, [rows, filters, page]);

  // Peers are fetched for the page on screen only — see the note on /api/portfolio/peers.
  const pageSymbols = visible.rows.map((row) => row.symbol).join(",");

  const loadPeers = useCallback(async (symbols: string, signal: AbortSignal) => {
    if (!symbols) return;
    try {
      const response = await fetch(`/api/portfolio/peers?symbols=${encodeURIComponent(symbols)}`, {
        headers: authHeaders(),
        signal,
      });
      if (!response.ok) return;
      const data = (await response.json()) as { groups?: PeerGroup[] };
      setPeerGroups((current) => {
        const next = new Map(current);
        for (const group of data.groups ?? []) next.set(group.symbol, group);
        return next;
      });
    } catch {
      // A peer lookup that fails leaves those two columns empty, which the cells already handle.
      // It is context on the rows, not the rows themselves, so it must not surface as an error.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-page-change; every setState runs after the await.
    loadPeers(pageSymbols, controller.signal);
    return () => controller.abort();
  }, [pageSymbols, loadPeers]);

  /**
   * The visible rows with their peer context folded in.
   *
   * Recomputed against the selected period rather than refetched: the peer endpoint returns all
   * five windows, so changing the period re-ranks from what the browser already has.
   */
  const enriched = useMemo(
    () =>
      visible.rows.map((row): MoverRow => {
        const group = peerGroups.get(row.symbol);
        if (!group) return row;

        const competitors: CompetitorRow[] = group.peers.map((peer) => ({
          symbol: peer.symbol,
          name: peer.name,
          price: peer.price,
          changePercent: peer.returns[filters.period] ?? null,
          isSelf: false,
        }));

        const { rank, peerCount, peerAverage } = rankAmongPeers(returnOf(row, filters.period), competitors);
        return { ...row, competitors, rank, peerCount, peerAverage, sector: row.sector ?? group.sector };
      }),
    [visible.rows, peerGroups, filters.period],
  );

  // The chosen list, split. Eight a side rather than five: with only one list on screen there is
  // room to show more of it before the table below has to be reached for.
  const cardSplit = useMemo(() => splitMovers(rows, cardCategory, filters.period, 8), [rows, cardCategory, filters.period]);
  const brief = useMemo(() => moversBrief(rows, filters.period), [rows, filters.period]);

  const set = <K extends keyof MoverFilters>(key: K, value: MoverFilters[K]) => {
    // Any change to what is being filtered invalidates the page number: staying on page three of a
    // result set that now has one page would show an empty table.
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const heldCount = rows.filter((row) => inCategory(row, "holdings")).length;
  const watchedCount = rows.filter((row) => inCategory(row, "watchlist")).length;

  if (loading) return <p className={LABEL}>Loading your movers…</p>;

  if (error) return <ErrorNote>{error}</ErrorNote>;

  if (rows.length === 0) {
    return (
      <EmptyPanel>
        Nothing to rank yet. Add a holding above, or put a stock on your watchlist, and this board splits both lists into
        what is running and what is falling — with each name measured against its own sector.
      </EmptyPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="Your top movers"
          blurb="Your holdings and your watchlist, split into gainers and losers. Two lists, kept apart — a gainer you own is money made, a gainer you are watching is an entry getting dearer."
          aside={
            <div className="flex flex-wrap gap-1">
              {PERIODS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => set("period", entry.key)}
                  aria-pressed={filters.period === entry.key}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    filters.period === entry.key
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-200 text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          }
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {/* Two tabs, and the count of each behind its label — so choosing a side is an informed
              click rather than a guess at which one has anything in it. */}
          <div
            role="tablist"
            aria-label="Gainers or losers"
            className="inline-flex rounded-full border border-slate-200 p-1 dark:border-slate-700"
          >
            {(["gainers", "losers"] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={side === entry}
                onClick={() => setSide(entry)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize transition ${
                  side === entry
                    ? entry === "gainers"
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {entry}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {entry === "gainers" ? cardSplit.gainers.length : cardSplit.losers.length}
                </span>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Showing
            <select
              value={cardCategory}
              onChange={(event) => setCardCategory(event.target.value as MoverCategory)}
              aria-label="Which list to show"
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none ring-emerald-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="holdings">Holdings ({heldCount})</option>
              <option value="watchlist">Watchlist ({watchedCount})</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <MoversPanel side={side} category={cardCategory} split={cardSplit} period={filters.period} />
        </div>

        {cardCategory === "watchlist" && watchedCount === 0 && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Your watchlist is empty — add stocks to it from the watchlist card on the dashboard overview.
          </p>
        )}

        <AiGate feature="portfolio" label="AI portfolio review">
          <AiBoardRead feature="portfolio" brief={brief} />
        </AiGate>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The detail table                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section className={`${CARD} p-5`}>
        <PanelHeading
          title="Every stock in both lists"
          blurb="Filter, search and page through the detail behind the cards — including how each name is doing against its own sector."
          aside={
            !filtersAreDefault(filters) ? (
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  // The period is a view of the data rather than a filter on it, so it survives a
                  // clear: a reader looking at one-year returns did not ask to go back to today.
                  setFilters((current) => ({ ...DEFAULT_FILTERS, period: current.period, sort: current.sort }));
                }}
                className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className={`${LABEL} lg:col-span-2`}>
            Search
            <input
              type="search"
              value={filters.q}
              onChange={(event) => set("q", event.target.value)}
              placeholder="Ticker, company or sector"
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            />
          </label>

          <label className={LABEL}>
            List
            <select
              value={filters.category}
              onChange={(event) => set("category", event.target.value as MoverFilters["category"])}
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            >
              <option value="all">Both lists</option>
              <option value="holdings">Holdings only</option>
              <option value="watchlist">Watchlist only</option>
            </select>
          </label>

          <label className={LABEL}>
            Direction
            <select
              value={filters.direction}
              onChange={(event) => set("direction", event.target.value as MoverFilters["direction"])}
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            >
              <option value="all">Gainers and losers</option>
              <option value="gainers">Gainers only</option>
              <option value="losers">Losers only</option>
            </select>
          </label>

          <label className={LABEL}>
            Cap tier
            <select
              value={filters.tier}
              onChange={(event) => set("tier", event.target.value as MoverFilters["tier"])}
              className={`mt-1 ${FIELD} normal-case tracking-normal`}
            >
              <option value="all">Every tier</option>
              <option value="Large">Large cap</option>
              <option value="Mid">Mid cap</option>
              <option value="Small">Small cap</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={filters.dividendOnly}
              onChange={(event) => set("dividendOnly", event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Only stocks with a declared dividend
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            Sort by
            <select
              value={filters.sort}
              onChange={(event) => set("sort", event.target.value as MoverFilters["sort"])}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="return">Return</option>
              <option value="rank">Sector rank</option>
              <option value="price">Price</option>
              <option value="value">Position value</option>
              <option value="symbol">Ticker</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => set("direction_sort", filters.direction_sort === "desc" ? "asc" : "desc")}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {filters.direction_sort === "desc" ? "Best first ↓" : "Worst first ↑"}
          </button>
        </div>

        {visible.total === 0 ? (
          <div className="mt-4">
            <EmptyPanel>Nothing in either list matches those filters. Clearing them brings every stock back.</EmptyPanel>
          </div>
        ) : (
          <>
            {/* The table scrolls inside its own box rather than the page: nine columns will not fit
                a phone, and a body that scrolls sideways takes the filters off screen with it. */}
            <div className="mt-4 -mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={`pb-2 text-left ${LABEL}`}>Stock</th>
                    <th className={`pb-2 text-right ${LABEL}`}>Price</th>
                    <th className={`pb-2 text-right ${LABEL}`}>Dividend</th>
                    {PERIODS.map((entry) => (
                      <th
                        key={entry.key}
                        className={`pb-2 text-right ${LABEL} ${entry.key === filters.period ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                      >
                        {entry.label}
                      </th>
                    ))}
                    <th className={`pb-2 text-right ${LABEL}`}>Sector peers</th>
                    <th className={`pb-2 text-right ${LABEL}`}>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((row) => (
                    <tr key={row.symbol} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <CompanyLogo symbol={row.symbol} size={28} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <StockDetailTrigger symbol={row.symbol}>
                                <span className="text-xs font-bold text-slate-900 underline-offset-2 hover:underline dark:text-white">
                                  {row.symbol}
                                </span>
                              </StockDetailTrigger>
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${SOURCE_BADGE[row.source].style}`}>
                                {SOURCE_BADGE[row.source].label}
                              </span>
                            </div>
                            <p className="max-w-[13rem] truncate text-[10px] text-slate-400 dark:text-slate-500">
                              {row.name ?? "—"}
                              {row.capTier ? ` · ${row.capTier} cap` : ""}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 text-right">
                        <p className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatMoney(row.price)}
                        </p>
                        {row.value !== null && (
                          <p className="font-mono text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                            {formatMoney(row.value)} held
                          </p>
                        )}
                      </td>

                      <td className="py-3 text-right">
                        <DividendCell row={row} />
                      </td>

                      {PERIODS.map((entry) => (
                        <td key={entry.key} className="py-3 text-right">
                          <span
                            className={`font-mono text-xs tabular-nums ${toneFor(returnOf(row, entry.key))} ${
                              entry.key === filters.period ? "font-bold" : "font-medium opacity-70"
                            }`}
                          >
                            {formatPercent(returnOf(row, entry.key))}
                          </span>
                        </td>
                      ))}

                      <td className="py-3 text-right">
                        <PeerCell row={row} period={filters.period} />
                      </td>

                      <td className="py-3 text-right">
                        <RankCell row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {(visible.page - 1) * visible.pageSize + 1}–
                {Math.min(visible.page * visible.pageSize, visible.total)} of {visible.total}
                {visible.total !== rows.length ? ` (filtered from ${rows.length})` : ""}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={visible.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Previous
                </button>
                <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  Page {visible.page} of {visible.pages}
                </span>
                <button
                  type="button"
                  disabled={visible.page >= visible.pages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          Sector peers are drawn from the hand-classified catalogue, so a scrip outside it shows no rank rather than a
          made-up one. Returns are measured from exchange closes.
        </p>
      </section>
    </div>
  );
}
