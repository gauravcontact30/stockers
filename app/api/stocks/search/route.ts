import { NextResponse } from "next/server";
import { cacheHeaders } from "../../../lib/cache";
import { ALL_SECTORS, findStock, searchStocks } from "../../../lib/stock-search";

// The answer depends entirely on the query string, so this has to be rendered per request.
// It was `force-static` first, and that is a trap: Next renders the handler once at build time
// with no search params, then serves that one response to every caller — so the box returned the
// same alphabetical list whatever was typed into it. The data itself is a generated module in
// memory, so per-request costs a string scan and no I/O.
export const dynamic = "force-dynamic";

/**
 * Search every listed company.
 *
 * `?symbol=` resolves one ticker to its name and sector — the browser stores a watchlist as bare
 * symbols and needs somewhere to look them up. Otherwise `?q=` and `?sector=` search the whole
 * exchange, and an empty `q` answers with the hand-classified catalogue rather than 4,950 rows.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  // The catalogue is a generated module that only changes when the app is rebuilt, so a given
  // query has the same answer for the life of the deployment. An hour at the edge turns the
  // search box — which fires on nearly every keystroke — into a lookup that mostly never reaches
  // this process at all. Public: the answer depends on the query and on nothing about the reader.
  const headers = cacheHeaders(3600);

  const symbol = params.get("symbol");
  if (symbol) {
    return NextResponse.json({ stock: findStock(symbol) }, { headers });
  }

  return NextResponse.json(searchStocks(params.get("q") ?? "", params.get("sector") ?? ALL_SECTORS), { headers });
}
