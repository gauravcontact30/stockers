"use client";

// The two strips that frame every slide: the rail across the top and the tape along the foot.
//
// Both used to be constants in `./hero-scenes` — a rail of five invented index levels and a tape of
// eight invented quotes, two of them showing falls. They were the only figures in the hero that
// nobody had measured, and they appeared on all four slides, above and below every real number on
// the page.
//
// What they carry now is one list: the week's strongest large caps, each with its own logo, its own
// name, and the weekly return that put it there. Resolved on the server (see
// `../lib/hero-trios#topWeeklyGainers`) and handed down through context rather than through props,
// because the strips are drawn by `SceneCard` — four levels below the carousel, and shared by every
// scene, so prop-drilling would mean threading the same list through each of them.
//
// The default is an empty list and the strips render nothing when they get one. That is deliberate:
// there is no fallback row here, because the only fallback available would be an invented one.

import { useEffect, useId, useMemo, useRef, useState, createContext, useContext } from "react";
import { CompanyLogo } from "./company-logo";
import { formatSignedPercent } from "./market-format";
import { SectorPill } from "./sector-pill";
import type { ScenePalette } from "./hero-scenes";

/** One company on a strip. Structurally the server's `HeroTickerRow`. */
export type HeroTickerStock = {
  symbol: string;
  name: string;
  weekPercent: number;
  sector?: string | null;
  direction?: "gainer" | "loser";
  returnPercent?: number;
  returns?: Partial<Record<TickerPeriodKey, number | null>>;
};

const HeroTickerContext = createContext<readonly HeroTickerStock[]>([]);

export function HeroTickerProvider({
  stocks = [],
  children,
}: {
  stocks?: readonly HeroTickerStock[];
  children: React.ReactNode;
}) {
  return <HeroTickerContext.Provider value={stocks}>{children}</HeroTickerContext.Provider>;
}

export function useHeroTicker() {
  return useContext(HeroTickerContext);
}

/** How many fit each strip. The rail wraps, so it takes fewer than the tape, which scrolls. */
const RAIL_COUNT = 5;
const RAIL_ROTATE_MS = 1_000;
const RAIL_NAME_MAX = 24;

const UP_TEXT = "text-emerald-600";
const DOWN_TEXT = "text-rose-600";
const MUTED_TEXT = "text-slate-400";
const PILL_TONES = [
  "border-emerald-200 bg-emerald-50 text-emerald-900",
  "border-sky-200 bg-sky-50 text-sky-900",
  "border-violet-200 bg-violet-50 text-violet-900",
  "border-amber-200 bg-amber-50 text-amber-900",
  "border-rose-200 bg-rose-50 text-rose-900",
  "border-teal-200 bg-teal-50 text-teal-900",
] as const;

const RAIL_PERIODS = ["1d", "1w", "3m", "6m", "1y", "3y", "5y", "overall"] as const;

type RailMoverRow = {
  ticker: string;
  name: string;
  sector: string | null;
  returnPercent: number | null;
};

type RailMoverPayload = {
  rows?: RailMoverRow[];
};

function pillTone(index: number): string {
  return PILL_TONES[index % PILL_TONES.length];
}

function shortStockName(name: string, symbol: string): string {
  if (name.length <= RAIL_NAME_MAX) return name;

  const compact = name
    .replace(/\bCorporation\b/gi, "Corp")
    .replace(/\bIndustries\b/gi, "Inds")
    .replace(/\bTechnologies\b/gi, "Tech")
    .replace(/\bElectronics\b/gi, "Elec")
    .replace(/\bInternational\b/gi, "Intl")
    .replace(/\b(?:Limited|Ltd\.?)\b/gi, "")
    .replace(/\bIndia\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base = compact || symbol;
  if (base.length <= RAIL_NAME_MAX) return base;

  const clipped = base.slice(0, RAIL_NAME_MAX - 3).trim();
  const wordClipped = clipped.replace(/\s+\S*$/, "").trim();
  return `${wordClipped.length >= 12 ? wordClipped : clipped}...`;
}

type TickerPeriodKey = "oneWeek" | "threeMonth" | "sixMonth" | "oneYear" | "threeYear" | "fiveYear" | "overall";

const TICKER_PERIODS: { key: TickerPeriodKey; label: string }[] = [
  { key: "oneWeek", label: "1W" },
  { key: "threeMonth", label: "3M" },
  { key: "sixMonth", label: "6M" },
  { key: "oneYear", label: "1Y" },
  { key: "threeYear", label: "3Y" },
  { key: "fiveYear", label: "5Y" },
  { key: "overall", label: "Overall" },
];

function returnFor(stock: HeroTickerStock, key: TickerPeriodKey): number | null {
  if (key === "oneWeek") return stock.returns?.oneWeek ?? stock.weekPercent;
  return stock.returns?.[key] ?? null;
}

function validReturnPeriods(stock: HeroTickerStock) {
  return TICKER_PERIODS.map((period) => ({ ...period, value: returnFor(stock, period.key) })).filter(
    (period): period is { key: TickerPeriodKey; label: string; value: number } =>
      typeof period.value === "number" && Number.isFinite(period.value),
  );
}

function signedPercent(percent: number | null): string {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return "";
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function returnTone(percent: number | null): string {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return MUTED_TEXT;
  return percent >= 0 ? UP_TEXT : DOWN_TEXT;
}

function railMove(stock: HeroTickerStock): number {
  return stock.returnPercent ?? stock.weekPercent;
}

function railDirection(stock: HeroTickerStock): "gainer" | "loser" {
  if (stock.direction) return stock.direction;
  return railMove(stock) < 0 ? "loser" : "gainer";
}

function railLabel(stock: HeroTickerStock): string {
  const direction = railDirection(stock);
  return `${direction === "gainer" ? "Gainer" : "Loser"} ${formatSignedPercent(railMove(stock))}`;
}

function railMoveTone(stock: HeroTickerStock): string {
  return railDirection(stock) === "gainer" ? "text-emerald-600" : "text-rose-600";
}

function compactRailLabel(stock: HeroTickerStock, periodLabel?: string, percent?: number | null): string {
  const value = typeof percent === "number" && Number.isFinite(percent) ? percent : railMove(stock);
  const direction = value < 0 ? "Loss" : railDirection(stock) === "loser" ? "Loss" : "Gain";
  return `${direction}${periodLabel ? ` ${periodLabel}` : ""} ${periodLabel ? signedPercent(value) : formatSignedPercent(value)}`;
}

function StockRibbonCard({
  stock,
  index,
  duplicate = false,
  eager = false,
  showReturnSelector = false,
  selectedPeriod = "oneWeek",
  onSelectedPeriodChange,
  idPrefix = "hero-return",
  className = "",
}: {
  stock: HeroTickerStock;
  index: number;
  duplicate?: boolean;
  eager?: boolean;
  showReturnSelector?: boolean;
  selectedPeriod?: TickerPeriodKey;
  onSelectedPeriodChange?: (symbol: string, period: TickerPeriodKey) => void;
  idPrefix?: string;
  className?: string;
}) {
  const periods = validReturnPeriods(stock);
  const selected = periods.some((period) => period.key === selectedPeriod) ? selectedPeriod : (periods[0]?.key ?? "oneWeek");
  const selectedValue = periods.find((period) => period.key === selected)?.value ?? returnFor(stock, selected);
  const selectedLabel = periods.find((period) => period.key === selected)?.label ?? "1W";
  const statusPeriod = showReturnSelector ? selectedLabel : undefined;
  const statusValue = showReturnSelector ? selectedValue : railMove(stock);
  const selectId = `${idPrefix}-${stock.symbol}-${duplicate ? "copy" : "main"}`;

  return (
    <span
      className={`inline-grid ${showReturnSelector ? "min-h-[104px]" : "min-h-[76px]"} w-fit max-w-[90vw] shrink-0 grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5 overflow-hidden rounded-2xl border px-3 py-2.5 shadow-[0_14px_35px_-24px_rgba(15,23,42,0.65)] ring-1 ring-white/70 ${pillTone(index)} ${className}`}
      title={`${stock.name} (${stock.symbol}) ${stock.sector ?? ""} ${railLabel(stock)}`}
      aria-hidden={duplicate}
    >
      <CompanyLogo symbol={stock.symbol} size={46} eager={eager} preferReal />
      <span className="min-w-0 max-w-[190px]">
        <span className="block truncate text-[15px] leading-tight font-black tracking-normal">{shortStockName(stock.name, stock.symbol)}</span>
        <span className="mt-0.5 block truncate text-[10px] leading-none font-black uppercase text-slate-500">{stock.symbol}</span>
      </span>
      <span className="col-start-2 flex min-w-0 items-center gap-1.5">
        <SectorPill sector={stock.sector} className="min-w-0 max-w-[108px] px-2 py-0.5 text-[9px]" />
        <span className={`shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black tabular-nums shadow-sm ${returnTone(statusValue)}`}>
          {compactRailLabel(stock, statusPeriod, statusValue)}
        </span>
      </span>
      {showReturnSelector && periods.length > 0 ? (
        <span className="col-start-2 grid min-w-0 grid-cols-[64px_auto] items-center gap-1.5 pt-0.5">
          <label className="sr-only" htmlFor={selectId}>
            Return period for {stock.symbol}
          </label>
          <select
            id={selectId}
            value={selected}
            disabled={duplicate}
            tabIndex={duplicate ? -1 : undefined}
            onChange={(event) => onSelectedPeriodChange?.(stock.symbol, event.currentTarget.value as TickerPeriodKey)}
            className="min-w-0 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[10px] font-black text-slate-700 shadow-sm outline-none focus:border-emerald-400 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-100"
          >
            {periods.map((period) => (
              <option key={period.key} value={period.key}>
                {period.label}
              </option>
            ))}
          </select>
          <span className="min-w-0 truncate rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-black shadow-sm">
            <span className="text-slate-500">{selectedLabel}</span>{" "}
            <span className={`tabular-nums ${returnTone(selectedValue)}`}>{signedPercent(selectedValue)}</span>
          </span>
          <span aria-hidden="true" className="hidden">
            {weekLabel(Math.abs(railMove(stock)))}
          </span>
        </span>
      ) : (
        <span aria-hidden="true" className="hidden">
          {weekLabel(Math.abs(railMove(stock)))}
        </span>
      )}
    </span>
  );
}

function railFetchUrl(cycle: number): string {
  const direction = cycle % 2 === 0 ? "gainers" : "losers";
  const period = RAIL_PERIODS[cycle % RAIL_PERIODS.length];
  const page = (cycle % 4) + 1;
  return `/api/market/bse/movers?tier=all&direction=${direction}&period=${period}&page=${page}&pageSize=${RAIL_COUNT}`;
}

function stocksFromPayload(payload: RailMoverPayload, direction: "gainer" | "loser"): HeroTickerStock[] {
  return (payload.rows ?? []).flatMap((row) => {
    if (typeof row.returnPercent !== "number" || !Number.isFinite(row.returnPercent)) return [];
    return [
      {
        symbol: row.ticker,
        name: row.name,
        sector: row.sector,
        direction,
        returnPercent: row.returnPercent,
        weekPercent: Math.abs(row.returnPercent),
      },
    ];
  });
}

/**
 * A weekly return, always signed.
 *
 * Everything on these strips is a gain, so the arrow never points down — but the sign is written
 * anyway rather than left to the colour, which a reader who cannot separate the two would lose.
 */
export function weekLabel(percent: number): string {
  return `▲ ${percent.toFixed(2)}%`;
}

/**
 * The stock ribbon below the slider.
 *
 * It used to sit inside every carousel slide as a stacked card rail. Below the slider it can be a
 * one-line rotating ribbon of wider cards. The row refreshes every second and then
 * swaps to the next BSE mover set.
 */
export function TopMoversRail({ palette }: { palette: ScenePalette }) {
  const initial = useHeroTicker();
  const [stocks, setStocks] = useState<readonly HeroTickerStock[]>(initial);
  const cycle = useRef(0);
  const lastGood = useRef<readonly HeroTickerStock[]>(initial);

  useEffect(() => {
    setStocks(initial);
    lastGood.current = initial;
  }, [initial]);

  useEffect(() => {
    if (initial.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const rotate = async () => {
      cycle.current += 1;
      const direction = cycle.current % 2 === 0 ? "gainer" : "loser";

      try {
        const response = await fetch(railFetchUrl(cycle.current), { cache: "no-store" });
        if (!response.ok) throw new Error(`BSE movers responded with ${response.status}`);
        const next = stocksFromPayload((await response.json()) as RailMoverPayload, direction);
        if (!cancelled && next.length > 0) {
          lastGood.current = next;
          setStocks(next);
        }
      } catch {
        if (!cancelled) setStocks(lastGood.current);
      } finally {
        if (!cancelled) timer = setTimeout(rotate, RAIL_ROTATE_MS);
      }
    };

    timer = setTimeout(rotate, RAIL_ROTATE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initial]);

  const visible = useMemo(() => stocks.slice(0, RAIL_COUNT), [stocks]);
  if (visible.length === 0) return null;

  return (
    <div
      className={`overflow-hidden rounded-2xl border px-3 py-2.5 ${palette.rail}`}
      aria-label="BSE listed stocks rotating ribbon refreshing every 1000 milliseconds"
    >
      <div className="flex w-max animate-hero-rail-marquee gap-3 text-[12px] font-semibold whitespace-nowrap">
        {[0, 1].map((pass) =>
          visible.map((stock, index) => (
            <StockRibbonCard
              key={`${pass}-${stock.symbol}`}
              stock={stock}
              index={index}
              duplicate={pass === 1}
              eager={pass === 0}
            />
          )),
        )}
      </div>
    </div>
  );
}

/**
 * The scrolling tape along the foot of every card.
 *
 * The full company name here, where the strip scrolls and length costs nothing. The row is rendered
 * twice so the marquee loops without a visible seam, which means every logo and every name appears
 * twice in the DOM — the duplicate half is hidden from assistive technology rather than read out a
 * second time.
 */
export function TopMoversTape({ palette }: { palette: ScenePalette }) {
  const stocks = useHeroTicker();
  const idPrefix = useId();
  const [selectedPeriods, setSelectedPeriods] = useState<Record<string, TickerPeriodKey>>({});
  if (stocks.length === 0) return null;

  const setSelectedPeriod = (symbol: string, period: TickerPeriodKey) => {
    setSelectedPeriods((previous) => ({ ...previous, [symbol]: period }));
  };

  return (
    <div
      className={`hover-pause-marquee overflow-hidden rounded-2xl border px-3 py-2.5 shadow-sm ${palette.tape}`}
      aria-label="BSE stock ribbon rotating continuously; hover to pause"
    >
      <div className="flex w-max animate-hero-ribbon-marquee gap-3 text-[12px] font-semibold whitespace-nowrap">
        {[0, 1].map((pass) =>
          stocks.map((stock, index) => (
            <StockRibbonCard
              key={`${pass}-${stock.symbol}`}
              stock={stock}
              index={index}
              duplicate={pass === 1}
              eager={pass === 0 && index < 3}
              showReturnSelector
              selectedPeriod={selectedPeriods[stock.symbol] ?? "oneWeek"}
              onSelectedPeriodChange={setSelectedPeriod}
              idPrefix={idPrefix}
            />
          )),
        )}
      </div>
    </div>
  );
}
