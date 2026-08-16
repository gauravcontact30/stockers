import "server-only";

// The reader's own portfolio.
//
// One module, two backends, decided by configuration alone â€” the same split as `./store` and
// `./analytics`:
//
//   * Supabase (Postgres, over PostgREST) when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
//   * A JSON file on disk when they are not.
//
// This is kept on the server rather than in the browser, which is the one thing that separates it
// from the watchlist card. A watchlist is a convenience and losing it costs a minute of retyping;
// a portfolio carries what somebody paid for a position, and it has to survive a new phone, a
// cleared cache and a second browser. So it belongs to the account, not to the device.
//
// Failures here are raised, not swallowed. `./analytics` is an observer and must never break what
// it watches; this *is* what the reader came for, and a holding that silently fails to save is
// worse than one that visibly did not.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq, isMissingTable, isUniqueViolation, missingTableMessage, supabaseConfigured, supabaseRequest } from "./supabase";

export type Holding = {
  id: string;
  userId: string;
  /** The exchange ticker, upper-cased. */
  symbol: string;
  /** Units held. Zero is allowed and means "tracked, not owned" â€” a candidate rather than a position. */
  quantity: number;
  /** What they paid per unit, in rupees. Zero when they are only tracking it. */
  avgPrice: number;
  /** Their own price target, or null. Drives the progress bar on the card. */
  targetPrice: number | null;
  /** A line of their own reasoning, so a position still makes sense in six months. */
  note: string | null;
  addedAt: string;
  updatedAt: string;
};

/** What a caller may set. `symbol` identifies the row; everything else is optional. */
export type HoldingInput = {
  symbol: string;
  quantity?: unknown;
  avgPrice?: unknown;
  targetPrice?: unknown;
  note?: unknown;
};

/**
 * Enough for a real portfolio, few enough that the page stays a page.
 *
 * Also a bound on what one account can write: without it a script could grow the table without
 * limit under a single user id.
 */
export const MAX_HOLDINGS = 40;

/** The same ticker shape the watchlist accepts: letters, digits, and the `&`/`-` in ARE&M and BAJAJ-AUTO. */
const TICKER_SHAPE = /^[A-Z0-9&-]{1,20}$/;

const MAX_NOTE = 280;
/** Above this a "price" is a typo, not a price. Keeps a fat finger out of the totals. */
const MAX_MONEY = 100_000_000;
const MAX_QUANTITY = 10_000_000;

const filePath = process.env.STOCKERS_PORTFOLIO_FILE || path.join(process.cwd(), "app", "data", "portfolio-holdings.json");

// ---------------------------------------------------------------------------
// What arrives from outside
// ---------------------------------------------------------------------------

export function cleanSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return TICKER_SHAPE.test(symbol) ? symbol : null;
}

/**
 * A non-negative amount, or null when the value is not one.
 *
 * Clamped rather than rejected at the top end because the realistic failure is a mistyped zero,
 * and a portfolio that refuses to save at all teaches nobody which field was wrong. `null` is
 * reserved for "not supplied", which is different from zero and has to stay different: zero
 * quantity means tracked-not-owned, and no quantity means leave it as it was.
 */
export function cleanAmount(value: unknown, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  // Two decimals: rupees and paise, and units of a share.
  return Math.round(Math.min(parsed, max) * 100) / 100;
}

export function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const note = value.trim().slice(0, MAX_NOTE);
  return note || null;
}

// ---------------------------------------------------------------------------
// Backend: JSON file
// ---------------------------------------------------------------------------

async function readFileHoldings(): Promise<Holding[]> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Holding[]) : [];
  } catch {
    // No file yet, or an unreadable one: nobody has a portfolio, which is not an error.
    return [];
  }
}

async function writeFileHoldings(holdings: Holding[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(/* turbopackIgnore: true */ filePath, JSON.stringify(holdings, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Backend: Supabase / Postgres
// ---------------------------------------------------------------------------

type HoldingRow = {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number | string;
  avg_price: number | string;
  target_price: number | string | null;
  note: string | null;
  added_at: string;
  updated_at: string;
};

/** PostgREST returns `numeric` as a string, so every figure is coerced on the way back in. */
function num(value: number | string | null, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fromRow(row: HoldingRow): Holding {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    quantity: num(row.quantity, 0),
    avgPrice: num(row.avg_price, 0),
    targetPrice: row.target_price === null ? null : num(row.target_price, 0),
    note: row.note,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

function toRow(holding: Holding): HoldingRow {
  return {
    id: holding.id,
    user_id: holding.userId,
    symbol: holding.symbol,
    quantity: holding.quantity,
    avg_price: holding.avgPrice,
    target_price: holding.targetPrice,
    note: holding.note,
    added_at: holding.addedAt,
    updated_at: holding.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** One account's holdings, newest first. */
export async function listHoldings(userId: string): Promise<Holding[]> {
  if (supabaseConfigured()) {
    const rows = await supabaseRequest<HoldingRow>({
      method: "GET",
      path: `portfolio_holdings?user_id=${eq(userId)}&select=*&order=added_at.desc`,
    });
    return rows.map(fromRow);
  }

  return (await readFileHoldings())
    .filter((holding) => holding.userId === userId)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
}

export type SaveResult =
  | { ok: true; holding: Holding }
  | { ok: false; reason: "invalid-symbol" | "full" | "not-found" };

/**
 * Adds a holding, or updates the one already held in that symbol.
 *
 * Upsert rather than insert-or-error because "add RELIANCE" when RELIANCE is already there is a
 * top-up, not a mistake â€” and the unique index on (user_id, symbol) is what makes it one row
 * either way, including when two tabs submit at the same instant.
 */
export async function saveHolding(userId: string, input: HoldingInput): Promise<SaveResult> {
  const symbol = cleanSymbol(input.symbol);
  if (!symbol) return { ok: false, reason: "invalid-symbol" };

  const existing = (await listHoldings(userId)).find((holding) => holding.symbol === symbol);
  if (!existing && (await listHoldings(userId)).length >= MAX_HOLDINGS) return { ok: false, reason: "full" };

  const now = new Date().toISOString();
  // `?? existing ?? 0` rather than a plain default: a field that was not supplied keeps what it
  // had, so editing only the note cannot quietly zero the position.
  const holding: Holding = {
    id: existing?.id ?? `hold_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
    userId,
    symbol,
    quantity: cleanAmount(input.quantity, MAX_QUANTITY) ?? existing?.quantity ?? 0,
    avgPrice: cleanAmount(input.avgPrice, MAX_MONEY) ?? existing?.avgPrice ?? 0,
    targetPrice: cleanAmount(input.targetPrice, MAX_MONEY) ?? existing?.targetPrice ?? null,
    note: cleanNote(input.note) ?? existing?.note ?? null,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  };

  if (supabaseConfigured()) {
    try {
      const rows = await supabaseRequest<HoldingRow>({
        method: "POST",
        path: "portfolio_holdings?on_conflict=user_id,symbol",
        body: toRow(holding),
        returnRepresentation: true,
        // Postgres decides which row wins, not a read we did beforehand â€” two tabs adding the same
        // symbol at once would both pass a check-then-insert.
        merge: true,
      });
      return rows.length > 0 ? { ok: true, holding: fromRow(rows[0]) } : { ok: true, holding };
    } catch (error) {
      /* istanbul ignore next -- the merge above resolves the conflict; this is the belt to its braces. */
      if (isUniqueViolation(error)) return { ok: false, reason: "not-found" };
      throw error;
    }
  }

  const all = await readFileHoldings();
  const index = all.findIndex((entry) => entry.userId === userId && entry.symbol === symbol);
  if (index === -1) all.push(holding);
  else all[index] = holding;

  await writeFileHoldings(all);
  return { ok: true, holding };
}

/** Removes one holding by symbol. False when this account does not hold it. */
export async function removeHolding(userId: string, symbolInput: unknown): Promise<boolean> {
  const symbol = cleanSymbol(symbolInput);
  if (!symbol) return false;

  if (supabaseConfigured()) {
    const rows = await supabaseRequest<HoldingRow>({
      method: "DELETE",
      // Filtered on the owner as well as the symbol: the id alone would let one account delete
      // another's row by guessing it.
      path: `portfolio_holdings?user_id=${eq(userId)}&symbol=${eq(symbol)}`,
      returnRepresentation: true,
    });
    return rows.length > 0;
  }

  const all = await readFileHoldings();
  const next = all.filter((holding) => !(holding.userId === userId && holding.symbol === symbol));
  if (next.length === all.length) return false;

  await writeFileHoldings(next);
  return true;
}

/** Which store is in use. Reported alongside the portfolio so the UI can say where it is kept. */
export function portfolioBackendName(): "supabase" | "file" {
  return supabaseConfigured() ? "supabase" : "file";
}

/**
 * The one store failure worth explaining rather than re-raising: the table does not exist.
 *
 * This is the state a fresh Supabase project is in until `supabase/schema.sql` has been applied. It
 * is permanent until somebody applies it, so a 500 that invites a retry is actively misleading â€”
 * every endpoint that touches holdings routes through here so they all say the same thing.
 *
 * Returns null for every other error, which the caller must re-raise. Falling back to the JSON file
 * would be worse than failing: see this module's header on why two divergent copies of somebody's
 * positions is the outcome to avoid above all others.
 */
export function portfolioSetupError(error: unknown): string | null {
  return isMissingTable(error) ? missingTableMessage("portfolio_holdings") : null;
}
