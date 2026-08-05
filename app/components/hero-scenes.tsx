function GridOverlay() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        opacity: 0.06,
      }}
    />
  );
}

function LightGridOverlay() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(15,23,42,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.6) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        opacity: 0.05,
      }}
    />
  );
}

// A faint photographic grain — texture, not a darkening overlay — so the flat vector shapes
// read as a captured photo rather than a clean UI render. Neutral blend, doesn't dim the scene.
function GrainTexture({ id }: { id: string }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] mix-blend-overlay">
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

function MagnifyingGlassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <circle cx="42" cy="42" r="26" stroke="currentColor" strokeWidth="6" />
      <line x1="61" y1="61" x2="90" y2="90" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

/* istanbul ignore next -- unreachable: every call site below always passes `rotate` explicitly, and this unexported helper has no other caller, so the default-value branch never executes */
function DiceLetter({ children, rotate = "" }: { children: string; rotate?: string }) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-black text-slate-800 shadow-[0_2px_4px_rgba(0,0,0,0.15)] ${rotate}`}
    >
      {children}
    </span>
  );
}

function CalculatorGraphic() {
  return (
    <div className="flex h-20 w-16 flex-col gap-1.5 rounded-xl border border-slate-300 bg-white p-1.5 shadow-lg">
      <div className="h-4 rounded bg-slate-800" />
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-2 w-2 rounded-full bg-amber-400" />
        ))}
      </div>
    </div>
  );
}

function buildCandles(count: number, startX: number, endX: number, baseY: number, topY: number) {
  const step = (endX - startX) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const x = startX + i * step;
    const progress = i / (count - 1);
    const trendY = baseY - progress * (baseY - topY);
    const bullish = i % 3 !== 1;
    const bodyHeight = 26 + ((i * 17) % 46);
    const bodyTop = trendY - bodyHeight / 2;
    const wickExtra = 14 + ((i * 11) % 20);
    return { x, bodyTop, bodyHeight, bullish, wickExtra };
  });
}

function Candles({ candles, opacity = 1 }: { candles: ReturnType<typeof buildCandles>; opacity?: number }) {
  return (
    <g opacity={opacity}>
      {candles.map((c, i) => (
        <g key={i}>
          <line
            x1={c.x}
            y1={c.bodyTop - c.wickExtra}
            x2={c.x}
            y2={c.bodyTop + c.bodyHeight + c.wickExtra}
            stroke={c.bullish ? "#34d399" : "#fb7185"}
            strokeWidth={2}
          />
          <rect x={c.x - 7} y={c.bodyTop} width={14} height={c.bodyHeight} fill={c.bullish ? "#34d399" : "#fb7185"} rx={2} />
        </g>
      ))}
    </g>
  );
}

const TICKERS = [
  "NIFTY 50  ▲ 1.24%",
  "SENSEX  ▲ 0.98%",
  "RELIANCE  ▲ 2.1%",
  "TCS  ▼ 0.6%",
  "HDFC BANK  ▲ 1.4%",
  "INFY  ▲ 0.9%",
  "BANK NIFTY  ▲ 1.1%",
  "ITC  ▼ 0.3%",
];

// Rendered live (not baked into the exported background image) so the tape keeps scrolling.
export function TickerTape() {
  const tickerRow = [...TICKERS, ...TICKERS];
  return (
    <div className="absolute inset-x-0 bottom-0 overflow-hidden border-t border-white/10 bg-black/30 py-2.5 backdrop-blur-sm">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-sm font-medium text-emerald-200/80">
        {tickerRow.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
    </div>
  );
}

const INDEX_STRIP: { label: string; value: string; up: boolean }[] = [
  { label: "NIFTY 50", value: "24,812 ▲0.8%", up: true },
  { label: "SENSEX", value: "81,204 ▲0.6%", up: true },
  { label: "BANK NIFTY", value: "52,340 ▲1.1%", up: true },
  { label: "USD/INR", value: "83.12 ▼0.1%", up: false },
  { label: "10Y G-SEC", value: "7.02%", up: true },
];

// A trading-terminal style index strip used across every hero scene so the top of the frame
// carries real market context and stays a consistent brand thread across all four slides.
function TopStatStrip() {
  return (
    <div className="absolute top-[6%] left-1/2 flex w-full -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-6">
      {INDEX_STRIP.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-300 backdrop-blur-sm"
        >
          <span className="text-slate-500">{item.label}</span>
          <span className={item.up ? "text-emerald-300" : "text-rose-300"}>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

const SENSEX_EVENTS = [
  { label: "COVID-19 crash", pct: "-38.0%", size: 78 },
  { label: "2022 rate hikes", pct: "-12.4%", size: 58 },
  { label: "2024 correction", pct: "-9.6%", size: 52 },
  { label: "Global fin. crisis", pct: "-61.0%", size: 90 },
];

// "Charts, magnifying glass, and a tablet with a headline" — a research-desk flat-lay of
// India-specific clippings: an AI-generated pattern, not a real photo, standing in for one.
export function ResearchDeskScene() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-slate-100 via-white to-emerald-50">
      <LightGridOverlay />
      <TopStatStrip />

      <div className="absolute top-[18%] left-[5%] w-[300px] -rotate-3 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(15,23,42,0.25)]">
        <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">Market watch</p>
        <p className="mt-1 text-base leading-snug font-bold text-slate-900">Has Sensex priced in the rate cut?</p>
        <svg viewBox="0 0 200 70" className="mt-3 h-14 w-full">
          <polyline points="0,50 30,45 55,30 80,35 110,15 140,20 170,8 200,5" fill="none" stroke="#059669" strokeWidth="2.5" />
          <polyline points="0,60 30,58 55,55 80,52 110,48 140,44 170,40 200,38" fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="3 3" />
        </svg>
        <div className="mt-2 flex gap-3 text-[10px] font-semibold">
          <span className="flex items-center gap-1 text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> SENSEX
          </span>
          <span className="flex items-center gap-1 text-rose-500">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> INDIA VIX
          </span>
        </div>
      </div>

      <MagnifyingGlassIcon className="absolute top-[14%] left-[36%] h-20 w-20 rotate-12 text-slate-700/60" />

      <div className="absolute top-[7%] right-[6%] w-[260px] rotate-2 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(15,23,42,0.25)]">
        <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">FII / DII flows &amp; volatility</p>
        <svg viewBox="0 0 200 70" className="mt-2 h-14 w-full">
          <polyline points="0,20 25,35 50,18 75,40 100,25 125,45 150,20 175,30 200,10" fill="none" stroke="#dc2626" strokeWidth="2.5" />
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">India VIX vs. FII net flows, daily</p>
      </div>

      <div className="absolute top-[40%] left-[38%] w-[300px] rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]">
        <p className="text-[10px] font-bold tracking-wide text-emerald-400 uppercase">Stockers.AI</p>
        <p className="mt-2 text-lg leading-tight font-black text-white">
          THE 2025
          <br />
          SENSEX RALLY
        </p>
        <div className="mt-3 flex h-16 items-end gap-1.5">
          {[30, 42, 55, 68, 80, 92, 100].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <div className="absolute bottom-[7%] left-[5%] w-[52%] max-w-[560px] rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]">
        <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">Sensex drawdowns &amp; recovery</p>
        <div className="mt-3 flex flex-wrap gap-5">
          {SENSEX_EVENTS.map((e) => (
            <div key={e.label} className="text-center">
              <div
                className="mx-auto flex items-center justify-center rounded-full border-2 border-emerald-500/60 text-xs font-bold text-white"
                style={{ width: e.size, height: e.size }}
              >
                {e.pct}
              </div>
              <p className="mt-1.5 max-w-[84px] text-[9px] text-slate-400">{e.label}</p>
            </div>
          ))}
        </div>
      </div>

      <GrainTexture id="grain-desk" />
    </div>
  );
}

const LAPTOP_TICKERS = [
  { symbol: "SENSEX", pct: "+0.71%", up: true },
  { symbol: "NIFTY 50", pct: "+0.68%", up: true },
  { symbol: "BANK NIFTY", pct: "+0.54%", up: true },
  { symbol: "INDIA VIX", pct: "-2.43%", up: false },
  { symbol: "RELIANCE", pct: "+1.24%", up: true },
  { symbol: "TCS", pct: "-0.62%", up: false },
  { symbol: "HDFCBANK", pct: "+1.05%", up: true },
];

// "Laptop showing a live index chart" — a SENSEX chart turning from red to green inside a
// CSS/SVG laptop mockup, with a live ticker rail alongside, on the same striped dark backdrop
// as the reference photo.
export function TradingLaptopScene() {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-950 to-slate-900"
      style={{
        backgroundImage: "repeating-linear-gradient(115deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, transparent 2px, transparent 34px)",
      }}
    >
      <GridOverlay />
      <div className="absolute -top-20 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <TopStatStrip />

      <div className="absolute top-1/2 left-1/2 w-[64%] max-w-[760px] -translate-x-1/2 -translate-y-[44%]">
        <div className="overflow-hidden rounded-t-2xl border-[10px] border-b-0 border-slate-800 bg-slate-950 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5">
            <p className="text-xs font-semibold text-slate-300">SENSEX · 1D · Stockers.AI</p>
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">LIVE</span>
          </div>
          <div className="flex bg-white">
            <svg viewBox="0 0 560 260" className="h-56 flex-1" preserveAspectRatio="none">
              <polyline
                points="0,150 40,165 80,140 120,175 160,155 200,190 240,160 280,120"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2.5"
              />
              <polygon points="0,150 40,165 80,140 120,175 160,155 200,190 240,160 280,120 280,260 0,260" fill="#dc2626" fillOpacity="0.08" />
              <polyline points="280,120 320,135 360,95 400,110 440,70 480,85 520,45 560,55" fill="none" stroke="#059669" strokeWidth="2.5" />
              <polygon points="280,120 320,135 360,95 400,110 440,70 480,85 520,45 560,55 560,260 280,260" fill="#059669" fillOpacity="0.12" />
            </svg>
            <div className="w-44 shrink-0 border-l border-slate-200 bg-slate-50 p-2.5">
              {LAPTOP_TICKERS.map((t) => (
                <div key={t.symbol} className="flex items-center justify-between border-b border-slate-200 py-1.5 last:border-0">
                  <span className="text-[10px] font-semibold text-slate-700">{t.symbol}</span>
                  <span className={`text-[10px] font-bold ${t.up ? "text-emerald-600" : "text-rose-600"}`}>{t.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div
          className="h-4 bg-gradient-to-b from-slate-700 to-slate-900"
          style={{ clipPath: "polygon(4% 0, 96% 0, 100% 100%, 0% 100%)" }}
        />

        <div className="mt-1 scale-y-[-1] opacity-[0.12] blur-[2px]">
          <div className="h-32 overflow-hidden rounded-t-2xl border-[10px] border-b-0 border-slate-800 bg-white" />
        </div>
      </div>

      <GrainTexture id="grain-laptop" />
    </div>
  );
}

const BSE_TICKERS: { code: string; symbol: string; price: string; pct: string; up: boolean }[] = [
  { code: "500325", symbol: "RELIANCE", price: "2847.50", pct: "1.24", up: true },
  { code: "532540", symbol: "TCS", price: "3912.20", pct: "0.62", up: false },
  { code: "500180", symbol: "HDFCBANK", price: "1678.90", pct: "1.05", up: true },
  { code: "500209", symbol: "INFY", price: "1542.30", pct: "0.88", up: true },
  { code: "532174", symbol: "ICICIBANK", price: "1284.60", pct: "0.71", up: true },
  { code: "500112", symbol: "SBIN", price: "812.40", pct: "1.63", up: true },
  { code: "500875", symbol: "ITC", price: "412.60", pct: "0.34", up: false },
  { code: "500696", symbol: "HINDUNILVR", price: "2456.80", pct: "0.28", up: true },
  { code: "500034", symbol: "BAJFINANCE", price: "1141.20", pct: "8.32", up: true },
  { code: "500510", symbol: "LT", price: "3624.40", pct: "0.95", up: true },
  { code: "532500", symbol: "MARUTI", price: "14234.00", pct: "0.32", up: true },
  { code: "500820", symbol: "ASIANPAINT", price: "2298.50", pct: "0.44", up: false },
  { code: "500247", symbol: "KOTAKBANK", price: "1789.30", pct: "0.58", up: true },
  { code: "532215", symbol: "AXISBANK", price: "1156.70", pct: "0.81", up: true },
  { code: "507685", symbol: "WIPRO", price: "289.40", pct: "0.52", up: false },
  { code: "524715", symbol: "SUNPHARMA", price: "1834.20", pct: "0.67", up: true },
  { code: "500470", symbol: "TATASTEEL", price: "162.35", pct: "1.02", up: true },
  { code: "532555", symbol: "NTPC", price: "412.10", pct: "0.39", up: true },
  { code: "500312", symbol: "ONGC", price: "268.90", pct: "0.71", up: false },
  { code: "512599", symbol: "ADANIENT", price: "2456.30", pct: "1.88", up: true },
  { code: "532454", symbol: "BHARTIARTL", price: "1678.20", pct: "0.94", up: true },
  { code: "500520", symbol: "M&M", price: "3398.50", pct: "3.50", up: true },
  { code: "532538", symbol: "ULTRACEMCO", price: "11845.60", pct: "0.61", up: false },
  { code: "500114", symbol: "TITAN", price: "3214.80", pct: "2.10", up: true },
  { code: "532898", symbol: "POWERGRID", price: "312.45", pct: "0.48", up: true },
];

// "Exchange ticker board with scrip codes and red/green LED prices" — reskinned with real
// BSE scrip codes and an S&P BSE Sensex headline instead of the Tokyo exchange board it echoes.
export function BseTickerBoardScene() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div
        className="absolute inset-0 opacity-40"
        style={{ backgroundImage: "radial-gradient(circle at 30% 15%, rgba(16,185,129,0.15), transparent 45%)" }}
      />

      <div className="absolute top-[7%] left-1/2 -translate-x-1/2 text-center">
        <p className="text-xs font-bold tracking-[0.4em] text-emerald-400">BSE · BOMBAY STOCK EXCHANGE</p>
        <p className="mt-2 text-3xl font-black tracking-wide text-white" style={{ textShadow: "0 0 20px rgba(52,211,153,0.6)" }}>
          S&amp;P BSE SENSEX <span className="text-emerald-400">85,978.25</span>{" "}
          <span className="text-xl text-emerald-400">▲ 0.71%</span>
        </p>
      </div>

      <div className="absolute top-[22%] right-[4%] bottom-[6%] left-[4%] grid grid-cols-5 gap-2">
        {BSE_TICKERS.map((t) => (
          <div key={t.code} className="flex flex-col justify-center rounded border border-white/10 bg-white/[0.02] px-3 py-2">
            <p className="font-mono text-[10px] text-slate-500">{t.code}</p>
            <p className="truncate font-mono text-sm font-bold text-slate-200">{t.symbol}</p>
            <div className="mt-1 flex items-baseline justify-between">
              <span
                className={`font-mono text-xl font-black ${t.up ? "text-emerald-400" : "text-rose-500"}`}
                style={{ textShadow: t.up ? "0 0 8px rgba(52,211,153,0.7)" : "0 0 8px rgba(251,113,133,0.7)" }}
              >
                {t.price}
              </span>
              <span className={`font-mono text-xs font-bold ${t.up ? "text-emerald-400" : "text-rose-500"}`}>
                {t.up ? "▲" : "▼"}
                {t.pct}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <GrainTexture id="grain-ticker" />
    </div>
  );
}

// "Magnifying glass over an annotated candlestick chart, dice letters, a calculator" — the
// trade-plan/backtest aesthetic, re-annotated for a Nifty 50 setup and spelling out BSE.
export function MarketAnalysisScene() {
  const candles = buildCandles(9, 60, 640, 260, 60);

  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-emerald-50">
      <LightGridOverlay />
      <TopStatStrip />

      <div className="absolute top-[19%] left-[5%] w-[62%] max-w-[720px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Nifty 50 · 15 min · Technical scan</p>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Bullish setup</span>
        </div>
        <svg viewBox="0 0 700 300" className="mt-2 h-56 w-full">
          <Candles candles={candles} />
          <line x1="60" y1="180" x2="640" y2="180" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1" />
          <text x="645" y="184" fontSize="11" fill="#64748b">
            Support
          </text>
          <path d="M280 200 L280 140 L340 140" stroke="#059669" strokeWidth="1.5" fill="none" />
          <text x="285" y="132" fontSize="11" fontWeight="bold" fill="#059669">
            Entry
          </text>
          <path d="M480 90 L480 60 L540 60" stroke="#059669" strokeWidth="1.5" fill="none" />
          <text x="485" y="52" fontSize="11" fontWeight="bold" fill="#059669">
            Win! +2.4R
          </text>
        </svg>
      </div>

      <MagnifyingGlassIcon className="absolute top-[24%] left-[13%] h-32 w-32 -rotate-6 text-slate-900/15" />

      <div className="absolute right-[6%] bottom-[12%] flex items-center gap-3">
        <DiceLetter rotate="-rotate-6">B</DiceLetter>
        <DiceLetter rotate="rotate-3">S</DiceLetter>
        <DiceLetter rotate="-rotate-2">E</DiceLetter>
        <CalculatorGraphic />
      </div>

      <div className="absolute bottom-[9%] left-[5%] w-[300px] rounded-xl border border-slate-200 bg-white/90 p-3 shadow-lg">
        <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">AI risk read</p>
        <p className="mt-1 text-sm font-semibold text-slate-800">Reward-to-risk 2.4x on this setup</p>
      </div>

      <GrainTexture id="grain-analysis" />
    </div>
  );
}
