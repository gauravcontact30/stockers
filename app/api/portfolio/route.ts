import { NextResponse } from "next/server";
import {
  listHoldings,
  MAX_HOLDINGS,
  portfolioBackendName,
  portfolioSetupError,
  removeHolding,
  saveHolding,
  type Holding,
} from "../../lib/portfolio";
import { userFromRequest, type AppUser } from "../../lib/store";

export const dynamic = "force-dynamic";

/**
 * One reader's portfolio.
 *
 * Every handler resolves the owner from the session and scopes the query to them. There is no id
 * a caller can pass to reach somebody else's row: the account is taken from the token, never from
 * the body, which is the only reason this can be a public endpoint at all.
 *
 * Deliberately not gated on a plan. The holdings are the reader's own record and locking them
 * behind a subscription would hold their data hostage; what a plan buys is the AI layer over them,
 * and that is enforced where it belongs — on the AI endpoints the page calls.
 */
async function requireUser(request: Request): Promise<AppUser | null> {
  return userFromRequest(request);
}

const unauthorised = () => NextResponse.json({ error: "Sign in to use your portfolio." }, { status: 401 });

/**
 * Turns a store failure into something the reader can act on.
 *
 * The one failure worth naming is a missing table: it is the state a fresh Supabase project is in
 * before `supabase/schema.sql` has been applied, it is permanent until somebody applies it, and a
 * generic 500 sends the reader off to retry something that cannot succeed. 503 rather than 500
 * because the service genuinely is not configured yet, and `setup: true` lets the page render the
 * instruction rather than a red box.
 *
 * Everything else is re-raised. This deliberately does not fall back to the JSON file — see the
 * header of `../../lib/portfolio`: two divergent copies of what somebody owns is a worse outcome
 * than an honest failure.
 */
function storeFailure(error: unknown): NextResponse {
  const setup = portfolioSetupError(error);
  if (setup) {
    return NextResponse.json({ error: setup, setup: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  throw error;
}

async function portfolioResponse(user: AppUser, extra: Record<string, unknown> = {}) {
  const holdings = await listHoldings(user.id);
  return NextResponse.json(
    { ...extra, holdings, max: MAX_HOLDINGS, backend: portfolioBackendName() },
    // One reader's positions: never cached, and never by a cache anything else can read from.
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorised();

  try {
    return await portfolioResponse(user);
  } catch (error) {
    return storeFailure(error);
  }
}

/** Adds a holding, or tops up the one already held in that symbol. */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorised();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await saveHolding(user.id, {
      symbol: typeof body.symbol === "string" ? body.symbol : "",
      quantity: body.quantity,
      avgPrice: body.avgPrice,
      targetPrice: body.targetPrice,
      note: body.note,
    });

    if (!result.ok) {
      const error =
        result.reason === "full"
          ? `A portfolio holds up to ${MAX_HOLDINGS} stocks. Remove one to add another.`
          : "That is not a symbol this exchange lists.";
      return NextResponse.json({ error }, { status: 400 });
    }

    return await portfolioResponse(user, { ok: true, saved: result.holding.symbol });
  } catch (error) {
    return storeFailure(error);
  }
}

export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (!user) return unauthorised();

  // Accepted from either place, because a DELETE with a body is awkward for some clients and a
  // query string is awkward for others — and this is one short string either way.
  let body: { symbol?: unknown } = {};
  try {
    body = (await request.json()) as { symbol?: unknown };
  } catch {
    body = {};
  }

  const symbol = typeof body.symbol === "string" ? body.symbol : new URL(request.url).searchParams.get("symbol");

  try {
    const removed = await removeHolding(user.id, symbol);
    if (!removed) return NextResponse.json({ error: "That stock is not in your portfolio." }, { status: 404 });

    return await portfolioResponse(user, { ok: true });
  } catch (error) {
    return storeFailure(error);
  }
}

export type PortfolioPayload = {
  holdings: Holding[];
  max: number;
  backend: "supabase" | "file";
};
