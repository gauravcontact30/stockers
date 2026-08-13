// Everything a company does to its own shares.
//
// `./nse-dividends` reads the exchange's corporate-actions feed and keeps only the dividends,
// because a dividend calendar is what that board is. A shareholder's question is wider: a bonus
// changes how many shares they hold, a split changes the price on every chart they have ever
// looked at, and a buyback is an offer with a deadline. All of it arrives on the same feed, and
// dropping four fifths of it is right for a dividend board and wrong for a portfolio.
//
// So this reads the same endpoint and keeps everything, classified. The two modules deliberately
// do not share a parser beyond the date and amount helpers already exported next door: the
// dividend board's shape is about yield and sector, and this one is about what is going to happen
// to a holding and when.

import { CACHE_TAGS } from "./cache";
import { cached, fetchNse, toNumber, toText, todayIST } from "./nse-client";
import { monthLabel, parseActionDate, parseDividendAmount } from "./nse-dividends";

/**
 * How far the window reaches.
 *
 * Thirty days back rather than the dividend board's ninety: a holder looking at their own book
 * wants to know what is coming and what they have just missed, not a quarter of history. Six
 * months forward covers everything the exchange has on record as declared.
 */
const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 180;
const TTL_MS = 60 * 60_000;

export type ActionKind = "Dividend" | "Bonus" | "Split" | "Rights" | "Buyback" | "Meeting" | "Other";

export type CorporateAction = {
  symbol: string;
  company: string;
  kind: ActionKind;
  /** The exchange's raw subject line, kept verbatim — it is the primary record. */
  subject: string;
  /** Rupees per share, for a dividend. Null for every other kind, and for an unusual wording. */
  amount: number | null;
  /**
   * The declared ratio, normalised to "a:b" — "1:1" for a bonus, "1:5" for a split.
   *
   * Kept as text rather than a number because the two sides mean different things per kind and
   * collapsing them to a multiplier would lose which was which.
   */
  ratio: string | null;
  exDate: string | null;
  recordDate: string | null;
  month: string | null;
  /** True while the ex-date is still ahead — the action can still be captured by buying. */
  upcoming: boolean;
  /** Calendar days until the ex-date. Negative once it has passed, null without a date. */
  daysAway: number | null;
};

export type CorporateActionFeed = {
  actions: CorporateAction[];
  today: string;
  fetchedAt: string;
  /** False when the exchange returned nothing — an outage reads differently from a quiet week. */
  live: boolean;
};

// ---------------------------------------------------------------------------
// Reading one subject line
// ---------------------------------------------------------------------------

/**
 * What kind of action a subject line describes.
 *
 * Order matters. "Bonus issue and dividend" is filed under Bonus because the bonus is the thing
 * that changes the holding, and a shareholder who sees only "Dividend" against that row would
 * miss it. Rights is checked before Meeting for the same reason: an AGM that also carries a rights
 * issue is an event about the shares, not about the meeting.
 */
export function classifyAction(subject: string): ActionKind {
  const text = subject.toLowerCase();

  if (/\bbonus\b/.test(text)) return "Bonus";
  if (/\bsplit\b|sub-?division|face value/.test(text)) return "Split";
  if (/\brights\b/.test(text)) return "Rights";
  if (/buy\s?back/.test(text)) return "Buyback";
  if (/\bdividend\b/.test(text)) return "Dividend";
  if (/\b(agm|egm|annual general meeting|extra-?ordinary general meeting|board meeting)\b/.test(text)) return "Meeting";

  return "Other";
}

/**
 * The ratio out of a bonus or split subject line, as "a:b".
 *
 * The exchange writes these several ways — "Bonus issue 1:1", "Stock Split From Rs.10/- to Rs.2/-",
 * "Sub-division of shares from Rs 10 to Re 1" — so both the explicit ratio and the from/to face
 * value forms are matched. A face-value split is expressed as old:new, which is the same direction
 * as a bonus ratio reads: the left side is what you had.
 */
export function parseRatio(subject: string): string | null {
  const explicit = subject.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (explicit) return `${trimNumber(explicit[1])}:${trimNumber(explicit[2])}`;

  const faceValue = subject.match(
    /from\s*rs?e?\.?\s*(\d+(?:\.\d+)?)\s*\/?-?\s*(?:per\s+share\s*)?to\s*rs?e?\.?\s*(\d+(?:\.\d+)?)/i,
  );
  if (faceValue) return `${trimNumber(faceValue[1])}:${trimNumber(faceValue[2])}`;

  return null;
}

/** "10.00" -> "10", "1.50" -> "1.5". The exchange is inconsistent about trailing zeros. */
function trimNumber(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

/** Whole calendar days from `today` to `iso`. Negative once the date has passed. */
export function daysUntil(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const target = Date.parse(`${iso}T00:00:00Z`);
  const from = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(target) || !Number.isFinite(from)) return null;
  return Math.round((target - from) / 86_400_000);
}

/** One raw feed row, or null when it carries no symbol to hang it on. */
export function toAction(row: Record<string, unknown>, today: string): CorporateAction | null {
  const symbol = toText(row.symbol).toUpperCase();
  if (!symbol) return null;

  const subject = toText(row.subject);
  if (!subject) return null;

  const kind = classifyAction(subject);
  const exDate = parseActionDate(row.exDate);

  return {
    symbol,
    company: toText(row.comp) || symbol,
    kind,
    subject,
    // Only a dividend has a per-share rupee amount. Pulling one out of a split's "from Rs.10 to
    // Rs.2" would report a two-rupee payout that nobody is going to receive.
    amount: kind === "Dividend" ? parseDividendAmount(subject) : null,
    ratio: kind === "Bonus" || kind === "Split" || kind === "Rights" ? parseRatio(subject) : null,
    exDate,
    recordDate: parseActionDate(row.recDate),
    month: monthLabel(exDate),
    upcoming: exDate !== null && exDate >= today,
    daysAway: daysUntil(exDate, today),
  };
}

function faceValueOf(row: Record<string, unknown>): number | null {
  return toNumber(row.faceVal);
}

function formatNseDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

/**
 * Every declared corporate action across the exchange, in the window.
 *
 * Held for an hour: the exchange publishes declarations once and they do not change, so the only
 * thing a shorter window would buy is a fresher `daysAway`, which the caller recomputes anyway.
 */
export const getCorporateActions = cached(
  TTL_MS,
  async (): Promise<CorporateActionFeed> => {
    const today = todayIST();

    const from = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const to = new Date(Date.now() + LOOKAHEAD_DAYS * 86_400_000);

    const payload = await fetchNse<unknown>(
      `/corporates-corporateActions?index=equities&from_date=${formatNseDate(from)}&to_date=${formatNseDate(to)}`,
    );

    const rows = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
    const actions: CorporateAction[] = [];

    for (const row of rows) {
      const action = toAction(row, today);
      if (!action) continue;
      // InvIT/REIT distributions are a different instrument with a different tax treatment, and
      // they are not what somebody holding equity is asking about.
      if (/^distribution/i.test(action.subject)) continue;

      const faceValue = faceValueOf(row);
      // A dividend declared as a percentage of face value with no rupee figure in the subject is
      // still a payable amount; the exchange just wrote it the traditional way.
      if (action.kind === "Dividend" && action.amount === null && faceValue !== null) {
        const percent = action.subject.match(/(\d+(?:\.\d+)?)\s*%/);
        if (percent) {
          const rate = Number(percent[1]);
          if (Number.isFinite(rate)) action.amount = Math.round(((rate / 100) * faceValue + Number.EPSILON) * 100) / 100;
        }
      }

      actions.push(action);
    }

    // Soonest first, and dated rows before undated ones: the nearest deadline is the only thing on
    // this list a reader can still act on.
    actions.sort((a, b) => (a.exDate ?? "9999-99-99").localeCompare(b.exDate ?? "9999-99-99"));

    return { actions, today, fetchedAt: new Date().toISOString(), live: rows.length > 0 };
  },
  { key: "nse:corporate-actions", tags: [CACHE_TAGS.nse], persist: true },
);
