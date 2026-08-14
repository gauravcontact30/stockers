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

/** Ten a page: a readable list, and ten sector lookups rather than fifty per page turn. */
export const MOVERS_PAGE_SIZE = 10;

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

export function buildSectorMoversUrl(category: string, direction: MoverDirection, page: number) {
  const params = new URLSearchParams({
    category,
    direction,
    page: String(page),
    pageSize: String(CATEGORY_PAGE_SIZE),
  });
  return `/api/market/bse/movers?${params.toString()}`;
}
