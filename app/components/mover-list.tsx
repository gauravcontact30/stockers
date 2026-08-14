"use client";

import type { BseMoverPage } from "../lib/bse-market";
import { formatPercent, moveTone } from "../lib/market-format";
import { CapTierBadge } from "./cap-tier-badge";
import { CompanyLogo } from "./company-logo";
import { SectorPill } from "./sector-pill";
import { DataTable, type Column } from "./data-table";
import { useStockDetail } from "./stock-detail-provider";

/**
 * One ranked list, paged five at a time, with its own search.
 *
 * A Client Component in its own file, and it has to be: the columns below carry `cell` and
 * `sortValue` *functions*, and functions cannot cross the server/client boundary. Declaring these
 * inside the server-rendered board built cleanly, passed every test — jsdom renders everything as a
 * client — and then failed at prerender with "Functions cannot be passed directly to Client
 * Components". Building the columns on this side of the line is what fixes that; the board passes
 * only rows and strings.
 *
 * Through `DataTable` rather than a hand-rolled list, because it already answers the four questions
 * this needs answered — page, search, suggest, clear — and answers them the way every other table
 * on the site does. Suggestions are drawn from the tickers and names actually in the list, so the
 * box never offers a company this ranking does not contain.
 */
export function MoverList({
  rows,
  empty,
  caption,
  pageSize,
}: {
  rows: BseMoverPage["rows"];
  empty: string;
  caption: string;
  pageSize: number;
}) {
  // Clicking a row opens the full detail sheet — performance across every window the archive
  // reaches, its category and cap tier, how it compares with the strongest performers in that
  // category, and who holds it. It used to open a shareholding-only sheet, which answered the
  // second question a reader has about a stock that just moved without answering the first.
  //
  // Through the app-wide provider rather than local state, so two rows in two different cards can
  // never end up with two sheets stacked on each other.
  const { openStock } = useStockDetail();
  const onOpen = (symbol: string) => openStock(symbol);

  const columns: Column<BseMoverPage["rows"][number]>[] = [
    {
      key: "company",
      header: "Company",
      cell: (row) => (
        <button
          type="button"
          onClick={() => onOpen(row.ticker)}
          className="flex w-full items-center gap-2 text-left transition hover:opacity-80"
          aria-label={`Open ${row.ticker} detail`}
        >
          <CompanyLogo symbol={row.ticker} size={20} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-semibold leading-tight text-slate-900 dark:text-white">
                {row.ticker}
              </span>
              <CapTierBadge raw={row.capTier} />
            </span>
            <span className="block truncate text-[9px] leading-tight text-slate-500 dark:text-slate-400">{row.name}</span>
            {/* The industry the exchange files it under: two companies up the same amount are a
                very different story if one is a bank and the other a smelter. */}
            <SectorPill sector={row.sector} className="mt-0.5" />
          </span>
        </button>
      ),
      sortValue: (row) => row.ticker,
    },
    {
      key: "move",
      header: "Move",
      align: "right",
      cell: (row) => (
        <span className={`text-[11px] font-bold tabular-nums ${moveTone(row.returnPercent)}`}>
          {formatPercent(row.returnPercent)}
        </span>
      ),
      sortValue: (row) => row.returnPercent,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.code}
      caption={caption}
      pageSize={pageSize}
      minWidth={240}
      empty={empty}
      searchFields={(row) => [row.ticker, row.name]}
      searchPlaceholder="Search a company"
      searchLabel={`Search ${caption.toLowerCase()}`}
      // No per-row wash and no per-row border colour: white rows on a white card, separated by the
      // table's own divider. The rows carried a rotating tint and then a rotating outline, and both
      // read as decoration competing with the only colour on the row that means anything — the
      // direction of the move.
      rowClassName={() => "bg-white dark:bg-slate-900"}
    />
  );
}
