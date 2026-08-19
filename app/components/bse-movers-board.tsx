"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  buildMoversUrl,
  type MoverDirection as MoverDirectionType,
  type MoverMoveKey,
  type MoverPeriodKey,
  type MoverTierKey,
} from "../lib/market-urls";
import { CompanyLogo } from "./company-logo";
import { StockDetailTrigger } from "./stock-detail-provider";
import {
  chipFor,
  formatCrore,
  formatDayDate,
  formatRupee,
  formatSignedPercent,
  sectorTone,
  toneFor,
} from "./market-format";
import {
  MarketSection,
  Pager,
  SectionError,
  SectionFootnote,
  SectionSkeleton,
  useMarketFeed,
  type Prefetched,
  type Paged,
} from "./market-section";

export type BseCapTier = "Large" | "Mid" | "Small";

export type BseMoverRow = {
  code: string;
  ticker: string;
  name: string;
  group: string;
  capTier: BseCapTier | null;
  rank: number | null;
  marketCapCr: number | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnoverCr: number | null;
};

/**
 * A mover with the return the board ranked it by.
 *
 * Separate from BseMoverRow because the company directory shares that shape and has no period to
 * rank over — only this board asks the endpoint for a return.
 */
export type RankedMoverRow = BseMoverRow & {
  /** Null when the company has no history that far back: a 2024 listing has no five-year return,
   *  and calling that 0% would be a lie. */
  returnPercent: number | null;
};

export type BseMoverPage = {
  rows: RankedMoverRow[];
  period: PeriodKey;
  /** The session the return is measured from. */
  periodFrom: string | null;
  /** Every stock that moved this way on the exchange, not a trimmed top ten. */
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  sessionDate: string | null;
};

// Re-exported from ../lib/market-urls, where the server can reach them too; every existing import
// of these from this module still resolves.
export { buildMoversUrl };
export type MoverDirection = MoverDirectionType;

type TierKey = MoverTierKey;
type MoveKey = MoverMoveKey;

const TIER_OPTIONS: { key: TierKey; label: string }[] = [
  { key: "all", label: "Whole exchange" },
  { key: "large", label: "Large cap" },
  { key: "mid", label: "Mid cap" },
  { key: "small", label: "Small cap" },
];

/** The return window a payload was ranked by. Wider than what this board offers — see below. */
export type PeriodKey = MoverPeriodKey;

/**
 * The windows the % Return column can be measured over, shortest first.
 *
 * A ladder of five, where there were eight. "Overall" ranked the whole exchange by returns since
 * listing, which is what floated +81,286% scrips to the top of a board people read for what to
 * trade; 1D and 1W duplicated the Day % column at one and five sessions. What is left is the span
 * a position is actually held over.
 *
 * `1m` is new to the URL layer but not to the data: ../lib/bse-history has kept a one-month
 * baseline in HISTORY_PERIODS all along, and only the endpoint's whitelist turned the request away.
 */
const PERIOD_OPTIONS = [
  { key: "1m", label: "1 month", short: "1M" },
  { key: "6m", label: "6 months", short: "6M" },
  { key: "1y", label: "1 year", short: "1Y" },
  { key: "3y", label: "3 years", short: "3Y" },
  { key: "5y", label: "5 years", short: "5Y" },
] as const satisfies readonly { key: MoverPeriodKey; label: string; short: string }[];

/** What the board can be set to, as against what a payload may carry. */
type BoardPeriod = (typeof PERIOD_OPTIONS)[number]["key"];

/** The window the board opens on: long enough to mean something, short enough to still be a trade. */
const DEFAULT_PERIOD: BoardPeriod = "1y";

const PERIOD_LABEL: Record<BoardPeriod, string> = Object.fromEntries(
  PERIOD_OPTIONS.map((option) => [option.key, option.short]),
) as Record<BoardPeriod, string>;

// A threshold on the size of the return, applied to whichever tab is open — over one session 20%
// picks the stocks that hit the upper circuit on the gainers board and the lower circuit on the
// losers. The ladder runs well past 20% because a multi-year return routinely does, and because
// scrips without a circuit filter move in multiples even in a day.
const MOVE_OPTIONS: { key: MoveKey; label: string }[] = [
  { key: "0", label: "Any move" },
  { key: "2", label: "2% or more" },
  { key: "5", label: "5% or more" },
  { key: "10", label: "10% or more" },
  { key: "20", label: "20% or more" },
  { key: "50", label: "50% or more" },
  { key: "100", label: "100% or more" },
  { key: "200", label: "200% or more" },
  { key: "300", label: "300% or more" },
  { key: "500", label: "500% or more" },
];

// Long enough that typing a company name is one request rather than one per keystroke — the same
// settle the company directory uses.
const SEARCH_DEBOUNCE_MS = 350;

function sectorIconKind(sector: string | null): "bank" | "bolt" | "chip" | "bag" | "cross" | "diamond" | "nodes" | "grid" {
  const text = (sector ?? "").toLowerCase();
  if (text.includes("financial") || text.includes("bank")) return "bank";
  if (text.includes("energy") || text.includes("oil") || text.includes("power")) return "bolt";
  if (text.includes("technology") || text.includes("telecom")) return "chip";
  if (text.includes("consumer") || text.includes("retail")) return "bag";
  if (text.includes("health") || text.includes("pharma")) return "cross";
  if (text.includes("commodit") || text.includes("metal") || text.includes("chemical")) return "diamond";
  if (text.includes("services") || text.includes("logistics")) return "nodes";
  return "grid";
}

function SectorIcon({ sector }: { sector: string | null }) {
  const kind = sectorIconKind(sector);
  const paths = {
    bank: <path d="M3 8h14M5 8v7m4-7v7m4-7v7M4 15h12M10 3l7 4H3l7-4Z" />,
    bolt: <path d="M11 2 4 11h5l-1 7 8-10h-5l0-6Z" />,
    chip: <path d="M6 6h8v8H6zM4 8H2m2 4H2m16-4h-2m2 4h-2M8 4V2m4 2V2M8 18v-2m4 2v-2" />,
    bag: <path d="M5 7h10l1 10H4L5 7Zm3 0a2 2 0 0 1 4 0" />,
    cross: <path d="M8 3h4v5h5v4h-5v5H8v-5H3V8h5V3Z" />,
    diamond: <path d="m10 2 7 8-7 8-7-8 7-8Z" />,
    nodes: <path d="M5 7a3 3 0 1 0 0.01 0ZM15 4a2 2 0 1 0 0.01 0ZM15 14a2 2 0 1 0 0.01 0ZM7.5 8.2l5.5-3M7.5 11.8l5.5 3" />,
    grid: <path d="M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z" />,
  } satisfies Record<ReturnType<typeof sectorIconKind>, ReactNode>;

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      {paths[kind]}
    </svg>
  );
}

function CategoryPill({ sector }: { sector: string | null }) {
  const label = sector ?? "Unclassified";

  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sector ? sectorTone(sector) : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>
      <SectorIcon sector={sector} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function SegmentRankPill({ rank }: { rank: number }) {
  return (
    <span
      aria-label={`Rank ${rank} in this segment`}
      title={`Rank ${rank} in this segment`}
      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black tabular-nums text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      #{rank}
    </span>
  );
}


/** Everything each tab says about itself, so the two differ in copy and colour, not in code. */
const VOICE: Record<
  MoverDirection,
  {
    tab: string;
    eyebrow: string;
    eyebrowClass: string;
    tabClass: string;
    title: string;
    blurb: string;
    asideClass: string;
    closed: string;
    /** How the count line reads once a period other than the session is being ranked. */
    over: string;
    order: string;
    unit: string;
    empty: string;
    noMatch: string;
  }
> = {
  gainers: {
    tab: "Most Gainers",
    eyebrow: "Most gainers",
    eyebrowClass: "text-emerald-600 dark:text-emerald-400",
    tabClass: "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-500",
    title: "Every BSE stock that closed higher",
    blurb:
      "Not a top ten — every gainer on the exchange, ordered by the size of the move and paged ten at a time. The search reaches every listed company, whichever way it moved today; the filters narrow what the list shows.",
    asideClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
    closed: "closed higher",
    over: "up over",
    order: "biggest gain first",
    unit: "gainers",
    empty: "Nothing closed higher this session — the whole exchange was flat or lower.",
    noMatch: "No listed company matches this search and these filters.",
  },
  losers: {
    tab: "Most Losers",
    eyebrow: "Most losers",
    eyebrowClass: "text-rose-600 dark:text-rose-400",
    tabClass: "border-rose-500 bg-rose-500 text-white dark:border-rose-400 dark:bg-rose-500",
    title: "Every BSE stock that closed lower",
    blurb:
      "The other half of the session, searched, filtered and paged on its own: every decliner on the exchange, deepest fall first, with the sector and cap tier each one belongs to.",
    asideClass: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",
    closed: "closed lower",
    over: "down over",
    order: "deepest fall first",
    unit: "losers",
    empty: "Nothing closed lower this session — the whole exchange was flat or higher.",
    noMatch: "No listed company matches this search and these filters.",
  },
};

const DIRECTIONS: MoverDirection[] = ["gainers", "losers"];

/**
 * The two halves of the session as two tabs.
 *
 * Deliberately not the shared PillTabs: these are the board's subject, not a filter on it, so the
 * selected tab carries the colour of what it shows — green for the risers, red for the fallers —
 * rather than the neutral slate every other filter row uses.
 */
function DirectionTabs({ value, onChange }: { value: MoverDirection; onChange: (next: MoverDirection) => void }) {
  return (
    <div role="tablist" aria-label="Direction" className="flex gap-2 rounded-full bg-slate-100 p-1 dark:bg-slate-950/60">
      {DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          role="tab"
          aria-selected={direction === value}
          onClick={() => onChange(direction)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
            direction === value
              ? VOICE[direction].tabClass
              : "border-transparent text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
          }`}
        >
          {VOICE[direction].tab}
        </button>
      ))}
    </div>
  );
}

/**
 * Search over the list on screen, with the matches offered as a dropdown.
 *
 * The suggestions are the search result itself — the sharpest matching moves, already fetched —
 * rather than a second lookup against a different index. Picking one pins the list to that ticker,
 * which is the quickest way to answer "what did this one do today" without leaving the board.
 */
function MoverSearch({
  input,
  onInput,
  onPick,
  suggestions,
  rankOffset,
}: {
  input: string;
  onInput: (next: string) => void;
  onPick: (ticker: string) => void;
  suggestions: RankedMoverRow[];
  rankOffset: number;
}) {
  const [open, setOpen] = useState(false);
  const showList = open && input.trim().length > 0 && suggestions.length > 0;

  return (
    <div
      className="relative min-w-56 flex-1"
      onBlur={(event) => {
        // Only a click outside the whole control closes it; moving focus from the input onto one of
        // its own options must not dismiss the option before it can be chosen.
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor="mover-search" className="sr-only">
        Search these movers
      </label>
      <input
        id="mover-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls="mover-search-results"
        aria-autocomplete="list"
        value={input}
        onChange={(event) => {
          onInput(event.target.value);
          setOpen(true);
        }}
        // Focus opens it on the way in; click reopens it after an Escape, when the box already has
        // focus and no focus event will fire again.
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search name, ticker or code"
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />

      {showList && (
        <ul
          id="mover-search-results"
          role="listbox"
          aria-label="Matching stocks"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {suggestions.map((row, index) => (
            <li key={row.code} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick(row.ticker);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo symbol={row.ticker} size={30} />
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.ticker}</span>
                      <SegmentRankPill rank={rankOffset + index + 1} />
                    </span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.name}</span>
                    <span className="mt-1 block max-w-44">
                      <CategoryPill sector={row.sector} />
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-xs font-bold tabular-nums ${toneFor(row.changePercent)}`}>
                    {formatSignedPercent(row.changePercent)}
                  </span>
                  {row.capTier && <span className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500">{row.capTier} cap</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One filter, as a labelled select.
 *
 * A row of pills per filter was two rows of buttons before a single stock was on screen. A select
 * states the same choice in one control the width of its longest option, which is what lets the
 * search box, both filters and the reset sit on one line.
 */
function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <label className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="cursor-pointer bg-transparent py-1 text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key} className="text-slate-900">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The columns, with the return column named after whichever period the board is ranked by.
 *
 * Seven, down from eleven, and the four that went were not showing anything the remaining seven
 * do not already say:
 *
 *  - Day change in rupees restated Day % in the unit nobody compares stocks in. ₹29.65 means
 *    nothing across two share prices; +4.99% is the comparison a reader was making anyway.
 *  - Day range printed both ends of the session as text — the widest column on the board, and the
 *    close is already in Price.
 *  - Volume and Turnover are the same fact twice, and turnover is the honest one: 2,376 shares
 *    reads as a number until you notice it is ₹55.8 L, and 1 share reads as a number until you
 *    notice it is ₹0. Rupees traded is what says whether a move can be traded at all.
 *  - Tier had a column to itself for one word, and carried the scrip's market-cap rank ("#529")
 *    which is exchange bookkeeping, not something anyone trades on. The word moved into the
 *    company cell as a pill; the rank went.
 *
 * The scrip code went the same way, out of the company cell: BSE keys its own pages by it, but a
 * reader looking at SWANDEF is not looking for 533107.
 *
 * The return column is named "% Return" flat rather than "Return · 5Y", because the window is no
 * longer something the header reports — it is something the header asks for. See `PeriodPicker`.
 */
const COLUMNS: { key: string; label: string; align: string }[] = [
  { key: "rank", label: "#", align: "text-left" },
  { key: "company", label: "Company", align: "text-left" },
  { key: "price", label: "Price", align: "text-right" },
  { key: "return", label: "% Return", align: "text-right" },
  { key: "day", label: "Day %", align: "text-right" },
  { key: "turnover", label: "Turnover", align: "text-right" },
  { key: "marketCap", label: "Market cap", align: "text-right" },
];

/**
 * The window the % Return column is measured over, as a control inside the column it rewrites.
 *
 * It used to be a "Return" select in the toolbar above, one of four filters in a row — which put
 * the thing the whole board is ranked by as far from its own numbers as the layout allowed. The
 * header said "Return · Overall" and the way to change it was somewhere else entirely. Here the
 * two are the same control: the dropdown sits in the cell whose figures it changes, so switching
 * 1Y to 5Y is one movement in the place the reader is already looking.
 */
function PeriodPicker({ value, onChange }: { value: BoardPeriod; onChange: (next: BoardPeriod) => void }) {
  return (
    <select
      aria-label="Return period"
      value={value}
      onChange={(event) => onChange(event.target.value as BoardPeriod)}
      className="cursor-pointer rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 outline-none transition hover:border-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500"
    >
      {PERIOD_OPTIONS.map((option) => (
        <option key={option.key} value={option.key} className="text-slate-900">
          {option.short}
        </option>
      ))}
    </select>
  );
}

/** The cap tier as a pill, beside the sector it sits with — one word, not a column. */
function TierPill({ tier }: { tier: BseCapTier | null }) {
  if (!tier) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {tier} cap
    </span>
  );
}

/**
 * One stock as a row of a movers table: who it is, what it costs, what it did, and whether the
 * move is tradeable.
 *
 * That last one is why turnover survived the trim while volume did not. This board ranks the whole
 * exchange by return, which floats scrips to the top that nobody can actually buy — a name up
 * 27,935% on a single share changing hands is a rounding artefact of a dead order book, not a
 * trade. A share count hides that behind a plausible-looking number; rupees traded does not.
 */
export function MoverTableRow({ row, rank }: { row: RankedMoverRow; rank: number }) {
  return (
    <tr className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-950/50">
      <td className="py-2.5 pr-3">
        <SegmentRankPill rank={rank} />
      </td>

      {/* Sector and tier belong to the company, so they sit with its name rather than in columns of
          their own — two fewer columns to scroll past, and the pills read as labels on the row they
          describe. */}
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5">
          <CompanyLogo symbol={row.ticker} size={32} />
          <div className="min-w-0">
            <StockDetailTrigger symbol={row.ticker}>
              <p className="font-semibold text-slate-900 underline-offset-2 hover:underline dark:text-white">{row.ticker}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{row.name}</p>
            </StockDetailTrigger>
            <span className="mt-1 flex max-w-64 flex-wrap items-center gap-1">
              <CategoryPill sector={row.sector} />
              <TierPill tier={row.capTier} />
            </span>
          </div>
        </div>
      </td>

      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
        {formatRupee(row.price)}
      </td>

      {/* The column the board is ranked by, so it carries the weight the day's move used to. */}
      <td className="py-2.5 pr-3 text-right">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${chipFor(row.returnPercent)}`}>
          {formatSignedPercent(row.returnPercent)}
        </span>
      </td>

      <td className="py-2.5 pr-3 text-right">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(row.changePercent)}`}>
          {formatSignedPercent(row.changePercent)}
        </span>
      </td>

      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
        {/* Turnover and market cap both arrive in crore; formatCrore takes rupees, so they go back. */}
        {row.turnoverCr === null ? "—" : formatCrore(row.turnoverCr * 1e7)}
      </td>

      <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
        {row.marketCapCr === null ? "—" : formatCrore(row.marketCapCr * 1e7)}
      </td>
    </tr>
  );
}

/**
 * The whole session, both ways, behind two tabs.
 *
 * Gainers and losers are two separate questions, so they are two tabs over one table rather than
 * two columns of a shared one — a reader working down the decliners is reading the market falling,
 * not glancing at a sidebar. Each tab is its own list: switching tabs, or cap tiers, opens that
 * list at its sharpest move rather than at whatever page number the last one was on.
 *
 * Nothing is trimmed to a headline ten. Every stock that moved is pageable, in descending order of
 * the move — which on a 4,900-scrip exchange is the only way a small cap up 14% is ever seen beside
 * the index heavyweights. Ranking and paging happen on the server: the list runs to thousands of
 * rows and each row's sector costs an upstream call, so only the twenty-five on screen are resolved.
 */
export function BseMoversBoard({ prefetched }: { prefetched?: Prefetched<BseMoverPage> }) {
  const [direction, setDirection] = useState<MoverDirection>("gainers");
  const [tier, setTier] = useState<TierKey>("all");
  // One year: long enough that the ranking is about the business rather than this morning's tape,
  // short enough that it is still a holding period rather than a listing history.
  const [period, setPeriod] = useState<BoardPeriod>(DEFAULT_PERIOD);
  const [move, setMove] = useState<MoveKey>("0");
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const voice = VOICE[direction];

  // The search box settles before it becomes a request. On mount there is nothing to settle, so
  // the first render does not queue one.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) {
      typed.current = true;
      return;
    }

    const timer = setTimeout(() => setTerm(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // The list being paged is identified by the tab, the tier, the search and the move filter
  // together. Change any of them and the reader is looking at a different list, so the page is
  // derived back to 1 rather than reset in an effect — page thirty of the large-cap gainers is not
  // a place to land in a two-page search result, and the new list never renders at the stale page
  // first.
  const listKey = `${tier}|${direction}|${period}|${term}|${move}`;
  const [cursor, setCursor] = useState({ key: listKey, page: 1 });
  const page = cursor.key === listKey ? cursor.page : 1;

  const { data, loading, updating, error } = useMarketFeed<BseMoverPage>(
    buildMoversUrl(tier, direction, period, term, move, page),
    prefetched,
  );
  const rows = data?.rows ?? [];

  // Judged on what is typed rather than on what has settled, so the button lights up with the
  // first keystroke instead of a third of a second later.
  const filtered = input.trim().length > 0 || tier !== "all" || move !== "0";

  const clearFilters = () => {
    setInput("");
    setTerm("");
    setTier("all");
    setMove("0");
  };

  const paged: Paged<RankedMoverRow> = {
    page: data?.page ?? 1,
    pages: data?.pages ?? 1,
    slice: rows,
    setPage: (next) => setCursor({ key: listKey, page: next }),
    from: data && rows.length ? (data.page - 1) * data.pageSize + 1 : 0,
    to: data ? (data.page - 1) * data.pageSize + rows.length : 0,
    total: data?.total ?? 0,
  };

  return (
    <MarketSection
      id="bse-movers"
      eyebrow={voice.eyebrow}
      eyebrowClass={voice.eyebrowClass}
      title={voice.title}
      blurb={voice.blurb}
      aside={
        <div className={`rounded-full border px-3 py-2 text-sm font-medium ${voice.asideClass}`}>
          {updating ? "Updating…" : data ? `${data.total.toLocaleString("en-IN")} ${voice.closed}` : "Loading BSE…"}
        </div>
      }
    >
      <div className="mt-6 flex flex-col gap-3">
        <DirectionTabs value={direction} onChange={setDirection} />

        {/* Search, both filters and the reset on one line — the controls are a toolbar, not a
            second section competing with the table for the reader's attention. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/50">
          <MoverSearch
            input={input}
            onInput={setInput}
            onPick={(ticker) => {
              setInput(ticker);
              setTerm(ticker);
            }}
            suggestions={rows}
            rankOffset={paged.from > 0 ? paged.from - 1 : 0}
          />
          <FilterSelect label="Tier" value={tier} options={TIER_OPTIONS} onChange={setTier} />
          <FilterSelect label="Move" value={move} options={MOVE_OPTIONS} onChange={setMove} />
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtered}
            className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
          >
            Clear filters
          </button>
        </div>

        {data && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{data.total.toLocaleString("en-IN")}</span>{" "}
            {term ? (
              // Searching leaves the tab behind: it looks through every listed company, so saying
              // "of those that closed higher" here would be a lie about what was searched.
              <>
                listed companies match “{term}” — searched across the whole exchange, whichever way they went ·
                sorted by % change, {voice.order}
              </>
            ) : (
              <>
                {filtered ? "stocks match these filters, of those" : "stocks in all"} {voice.over}{" "}
                {PERIOD_LABEL[period].toLowerCase()}
                {data.periodFrom && ` (measured from ${formatDayDate(data.periodFrom)})`} · sorted by{" "}
                {PERIOD_LABEL[period]} return, {voice.order}
              </>
            )}{" "}
            · ten a page
          </p>
        )}
      </div>

      {error && <SectionError message={error} />}
      {loading && <SectionSkeleton rows={5} height="h-12" />}

      {!loading && rows.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-180 border-collapse text-left text-sm">
              <caption className="sr-only">
                BSE stocks that {voice.closed}, ranked by percentage change, {voice.order}
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  {COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className={`py-2 pr-3 font-medium ${column.align}`}>
                      {column.key === "return" ? (
                        <span className="inline-flex items-center gap-1.5">
                          {column.label}
                          <PeriodPicker value={period} onChange={setPeriod} />
                        </span>
                      ) : (
                        column.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              {/* The rows dim and go inert while a changed filter is in flight — they are still the
                  last figures the server confirmed, but they answer the previous question, so they
                  are shown as being replaced rather than as the answer to the controls above. The
                  header is deliberately outside this: the period picker lives up there, and a
                  control that goes dead while its own request is in flight cannot be corrected. */}
              <tbody
                className={`transition-opacity ${updating ? "pointer-events-none opacity-45" : "opacity-100"}`}
                aria-busy={updating}
              >
                {rows.map((row, index) => (
                  // Ranks run on across pages: the first row of page two is the 26th sharpest move.
                  <MoverTableRow key={row.code} row={row} rank={paged.from + index} />
                ))}
              </tbody>
            </table>
          </div>

          <Pager paged={paged} unit={voice.unit} />
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        // A filtered list that comes back empty is a different message from a tier that simply had
        // no move: the first is fixable from here, so it says how.
        <div className="mt-5 flex flex-col items-start gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered ? voice.noMatch : voice.empty}</p>
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-500 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-400"
            >
              Clear filters and show everything
            </button>
          )}
        </div>
      )}

      <SectionFootnote>
        Prices and turnover from BSE&apos;s official Bhavcopy for {formatDayDate(data?.sessionDate)}; market caps,
        listings and cap tiers from BSE&apos;s scrip master, tiered by SEBI&apos;s rule — top 100 by market capitalisation
        are large cap, the next 150 mid cap, the remainder small cap. Non-equity instruments (ETFs, REITs, rights
        entitlements, g-secs) are excluded so they cannot crowd out a real mover · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
