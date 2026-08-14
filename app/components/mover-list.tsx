"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { BseMoverPage } from "../lib/bse-market";
import { formatPercent, moveTone, rowTint, sectorLabel } from "../lib/market-format";
import { CapTierBadge } from "./cap-tier-badge";
import { CompanyLogo } from "./company-logo";
import { DataTable, type Column } from "./data-table";

/**
 * The shareholding sheet, loaded the first time a row is opened.
 *
 * Split out because it pulls the pie chart and the modal shell behind it, and most readers of a
 * movers list never open one — see ./use-once-open for why a dynamic import only pays off when the
 * component is kept out of the tree until it is wanted.
 */
const OwnershipModal = dynamic(() => import("./ownership-modal").then((module) => module.OwnershipModal));

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
  // Which company's shareholding sheet is open, if any. Held here rather than in each row so two
  // rows can never open two sheets on top of each other.
  const [open, setOpen] = useState<string | null>(null);
  const onOpen = (symbol: string) => setOpen(symbol);

  const columns: Column<BseMoverPage["rows"][number]>[] = [
    {
      key: "company",
      header: "Company",
      cell: (row) => (
        <button
          type="button"
          onClick={() => onOpen(row.ticker)}
          className="flex w-full items-center gap-2 text-left transition hover:opacity-80"
          aria-label={`Who owns ${row.ticker}`}
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
            {sectorLabel(row.sector) && (
              <span className="block truncate text-[9px] font-semibold leading-tight text-slate-400 dark:text-slate-500">
                {sectorLabel(row.sector)}
              </span>
            )}
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
    <>
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
      // A pale wash per row so five companies read as five rows rather than one block. Tracks
      // position, never direction — the move already has a colour of its own.
        rowClassName={(_row, index) => rowTint(index)}
      />
      {open && <OwnershipModal symbol={open} onClose={() => setOpen(null)} />}
    </>
  );
}
