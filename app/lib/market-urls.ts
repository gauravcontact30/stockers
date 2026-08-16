// The API URLs the market boards ask for, built in one place.
//
// These used to sit inside the board components themselves, which was fine while the only caller
// was the browser. The landing page now resolves each board's opening payload on the server and
// hands it over with the URL it answers, and a `"use client"` module's functions cannot be called
// from the server — so the builders moved here, where both sides can reach them. The components
// re-export them, so every existing import still resolves.
//
// The page sizes live here too, for the same reason: the server has to ask the data layer for the
// same size the client would have asked the endpoint for, or the payload it prefetched would not
// be the page the board renders.

export type MoverDirection = "gainers" | "losers";
export type MoverTierKey = "all" | "large" | "mid" | "small";
export type MoverPeriodKey = "1d" | "1w" | "3m" | "6m" | "1y" | "3y" | "5y" | "overall";
/** The size of move a reader is willing to look at, as a percentage. "0" means show everything. */
export type MoverMoveKey = "0" | "2" | "5" | "10" | "20" | "50" | "100" | "200" | "300" | "500";

/**
 * Five a page, for the two whole-exchange boards — "every BSE stock that closed higher" and its
 * losing half.
 *
 * Was ten. These two sit near the bottom of a landing page that is already a long stack of boards,
 * and a ten-row table is a screen and a half on a phone before the next section starts. Five is the
 * page the tier and category boards above it already use, so the whole page turns at one rhythm
 * rather than this one being twice the others.
 *
 * Halving it halves the work behind a page turn as well: each row costs a sector lookup, so this is
 * five per turn rather than ten, and a correspondingly smaller response.
 *
 * Read by `buildMoversUrl` below *and* by the server prefetch in
 * `../components/streamed-boards.tsx`. It has to stay one constant — the server has to ask the data
 * layer for the same size the client asks the endpoint for, or the payload it prefetched is not the
 * page the board renders and the board refetches on mount.
 */
export const MOVERS_PAGE_SIZE = 5;

/**
 * Five a side inside an open category. Both boards sit next to each other in one accordion, so ten
 * rows already fill the panel — and each is paged on the server, so a shorter page is a smaller
 * response as well as a shorter scroll before the next category.
 */
export const CATEGORY_PAGE_SIZE = 5;

export function buildMoversUrl(
  tier: MoverTierKey,
  direction: MoverDirection,
  period: MoverPeriodKey,
  term: string,
  move: MoverMoveKey,
  page: number,
  /** Defaulted so every existing caller is unchanged; the tier panel asks for five. */
  pageSize: number = MOVERS_PAGE_SIZE,
) {
  const params = new URLSearchParams({
    tier,
    direction,
    period,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (term) params.set("q", term);
  if (move !== "0") params.set("min", move);
  return `/api/market/bse/movers?${params.toString()}`;
}

/**
 * The trending board's page size and URL, moved here for the same reason as the movers builders
 * above: the landing page resolves this board's opening payload on the server now, and the server
 * cannot call into `../components/bse-trending-board`, which is `"use client"`. That component
 * re-exports both, so every existing import still resolves.
 */
export const TRENDING_PAGE_SIZE = 10;

export type TrendingRankKey = "brokers" | "turnover" | "trades" | "volume";
/** `"all"` plus the platform and broker ids; kept loose here so this module pulls in no client code. */
export type TrendingFilterKey = string;

export function buildTrendingUrl(
  rank: TrendingRankKey,
  term: string,
  platform: TrendingFilterKey,
  broker: TrendingFilterKey,
  tier: MoverTierKey,
  move: string,
  page: number,
): string {
  const params = new URLSearchParams({ rank, page: String(page), pageSize: String(TRENDING_PAGE_SIZE) });
  if (term) params.set("q", term);
  if (platform !== "all") params.set("platform", platform);
  if (broker !== "all") params.set("broker", broker);
  if (tier !== "all") params.set("tier", tier);
  if (move !== "0") params.set("min", move);
  return `/api/market/bse/trending?${params.toString()}`;
}

export function buildSectorMoversUrl(category: string, direction: MoverDirection, page: number) {
  const params = new URLSearchParams({
    category,
    direction,
    page: String(page),
    pageSize: String(CATEGORY_PAGE_SIZE),
  });
  return `/api/market/bse/movers?${params.toString()}`;
}
