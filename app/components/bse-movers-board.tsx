"use client";

import { useEffect, useRef, useState } from "react";
import {
  MOVERS_PAGE_SIZE,
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
  formatQuantity,
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

/** The return window the board is ranked by. */
export type PeriodKey = MoverPeriodKey;

// Longest first, because that is the order a trader reads a return table in — and "Overall" leads
// because it is what the board opens on.
const PERIOD_OPTIONS: { key: PeriodKey; label: string; short: string }[] = [
  { key: "overall", label: "Overall return", short: "Overall" },
  { key: "5y", label: "5 years", short: "5Y" },
  { key: "3y", label: "3 years", short: "3Y" },
  { key: "1y", label: "1 year", short: "1Y" },
  { key: "6m", label: "6 months", short: "6M" },
  { key: "3m", label: "3 months", short: "3M" },
  { key: "1w", label: "1 week", short: "1W" },
  { key: "1d", label: "1 day", short: "1D" },
];

const PERIOD_LABEL: Record<PeriodKey, string> = Object.fromEntries(
  PERIOD_OPTIONS.map((option) => [option.key, option.short]),
) as Record<PeriodKey, string>;

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

const PAGE_SIZE = MOVERS_PAGE_SIZE;

// Long enough that typing a company name is one request rather than one per keystroke — the same
// settle the company directory uses.
const SEARCH_DEBOUNCE_MS = 350;


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
}: {
  input: string;
  onInput: (next: string) => void;
  onPick: (ticker: string) => void;
  suggestions: RankedMoverRow[];
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
          {suggestions.map((row) => (
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
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{row.ticker}</span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{row.name}</span>
                </span>
                <span className={`shrink-0 text-xs font-bold tabular-nums ${toneFor(row.changePercent)}`}>
                  {formatSignedPercent(row.changePercent)}
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

/** The columns, with the return column named after whichever period the board is ranked by. */
function columnsFor(period: PeriodKey): { label: string; align: string }[] {
  return [
    { label: "#", align: "text-left" },
    { label: "Company", align: "text-left" },
    { label: "Tier", align: "text-left" },
    { label: "Price", align: "text-right" },
    { label: `Return · ${PERIOD_LABEL[period]}`, align: "text-right" },
    { label: "Day change", align: "text-right" },
    { label: "Day %", align: "text-right" },
    { label: "Day range", align: "text-right" },
    { label: "Volume", align: "text-right" },
    { label: "Turnover", align: "text-right" },
    { label: "Market cap", align: "text-right" },
  ];
}

/** One stock, priced and classified, as a row of a movers table. */
export function MoverTableRow({ row, rank }: { row: RankedMoverRow; rank: number }) {
  return (
    <tr className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-950/50">
      <td className="py-2.5 pr-3 text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">{rank}</td>

      {/* The sector belongs to the company, so it sits with the company's name rather than in a
          column of its own — one less column to scroll past, and the pill reads as a label on the
          row it describes. */}
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2.5">
          <CompanyLogo symbol={row.ticker} size={32} />
          <div className="min-w-0">
            <StockDetailTrigger symbol={row.ticker}>
              <p className="font-semibold text-slate-900 underline-offset-2 hover:underline dark:text-white">{row.ticker}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {row.name} · {row.code}
              </p>
            </StockDetailTrigger>
            {row.sector && (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${sectorTone(row.sector)}`}>
                {row.sector}
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="py-2.5 pr-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        {row.capTier ?? "—"}
        {row.rank !== null && <span className="ml-1 text-slate-400 dark:text-slate-500">#{row.rank}</span>}
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

      <td className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${toneFor(row.change)}`}>
        {formatRupee(row.change)}
      </td>

      <td className="py-2.5 pr-3 text-right">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${chipFor(row.changePercent)}`}>
          {formatSignedPercent(row.changePercent)}
        </span>
      </td>

      <td className="py-2.5 pr-3 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {formatRupee(row.dayLow)} – {formatRupee(row.dayHigh)}
      </td>

      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
        {formatQuantity(row.volume)}
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
  // The board opens on the whole story rather than today's noise: ranked by overall return, the
  // top of the list is what has actually compounded, not what happened to be bid up this morning.
  const [period, setPeriod] = useState<PeriodKey>("overall");
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

  const { data, loading, error } = useMarketFeed<BseMoverPage>(
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
          {data ? `${data.total.toLocaleString("en-IN")} ${voice.closed}` : "Loading BSE…"}
        </div>
      }
    >
      <div className="mt-6 flex flex-col gap-3">
        <DirectionTabs value={direction} onChange={setDirection} />

        {/* Search, both filters and the reset on one line — the controls are a toolbar, not a
            second section competing with the table for the reader's attention. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/50">
          <MoverSearch input={input} onInput={setInput} onPick={(ticker) => { setInput(ticker); setTerm(ticker); }} suggestions={rows} />
          <FilterSelect label="Return" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
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
                {period === "1d" ? formatDayDate(data.sessionDate) : PERIOD_LABEL[period].toLowerCase()}
                {period !== "1d" && data.periodFrom && ` (measured from ${formatDayDate(data.periodFrom)})`} · sorted by{" "}
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
            <table className="w-full min-w-260 border-collapse text-left text-sm">
              <caption className="sr-only">
                BSE stocks that {voice.closed}, ranked by percentage change, {voice.order}
              </caption>
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  {columnsFor(period).map((column) => (
                    <th key={column.label} scope="col" className={`py-2 pr-3 font-medium ${column.align}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
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
        Prices, volumes and turnover from BSE&apos;s official Bhavcopy for {formatDayDate(data?.sessionDate)}; market caps,
        listings and cap tiers from BSE&apos;s scrip master, tiered by SEBI&apos;s rule — top 100 by market capitalisation
        are large cap, the next 150 mid cap, the remainder small cap. Non-equity instruments (ETFs, REITs, rights
        entitlements, g-secs) are excluded so they cannot crowd out a real mover · not investment advice.
      </SectionFootnote>
    </MarketSection>
  );
}
