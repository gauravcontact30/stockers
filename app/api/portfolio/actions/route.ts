import { NextResponse } from "next/server";
import { getCorporateActions } from "../../../lib/corporate-actions";
import { listHoldings, portfolioSetupError } from "../../../lib/portfolio";
import { actionsForHoldings } from "../../../lib/portfolio-actions";
import { userFromRequest } from "../../../lib/store";

/**
 * Declared corporate actions against the caller's own holdings.
 *
 * Not gated. The exchange's corporate-actions calendar is public and a shareholder is entitled to
 * know a record date is coming without a subscription — withholding "you must hold by Tuesday to
 * receive this" behind a paywall is holding their own money's deadline hostage. What a plan buys
 * is the AI read over the calendar, and that is enforced on `/api/ai/board-read` as everywhere.
 *
 * `marketValue` is passed in by the client rather than recomputed here: the page already has every
 * position priced, and refetching a year of history server-side to derive one denominator would
 * double the work for a number that is already on screen. It only ever affects the reported yield,
 * and a bad value there degrades to a yield that is not shown.
 */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return NextResponse.json({ error: "Sign in to use your portfolio." }, { status: 401 });

  let holdings;
  try {
    holdings = await listHoldings(user.id);
  } catch (error) {
    const setup = portfolioSetupError(error);
    if (!setup) throw error;
    return NextResponse.json({ error: setup, setup: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  if (holdings.length === 0) {
    return NextResponse.json(
      { view: actionsForHoldings([], []), live: false, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const raw = new URL(request.url).searchParams.get("marketValue");
  const parsed = Number(raw);
  const marketValue = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

  const feed = await getCorporateActions();

  return NextResponse.json(
    {
      view: actionsForHoldings(feed.actions, holdings, marketValue),
      live: feed.live,
      today: feed.today,
      fetchedAt: feed.fetchedAt,
    },
    // One reader's holdings are in the response, so it must never sit in a shared cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
