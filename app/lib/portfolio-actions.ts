// Corporate actions, narrowed to the shares one reader actually owns.
//
// Pure: actions in, holdings in, figures out. `./corporate-actions` fetches the exchange's whole
// declared calendar; this is the part that turns it into "you hold 250 of these, so that is
// ₹2,000 on the 14th".
//
// The distinction the whole module turns on is between an action that pays and an action that
// changes the holding. A dividend adds cash and leaves the position alone. A bonus or a split
// leaves the value alone and changes the number of shares and the average price — which means the
// cost basis stored against that holding is about to be wrong, and nothing else on the page will
// say so. Both are surfaced, and they are never added together.

import type { BoardBrief } from "./board-read";
import type { CorporateAction } from "./corporate-actions";
import type { Holding } from "./portfolio";
import { formatMoney } from "./portfolio-metrics";

export type HeldAction = CorporateAction & {
  /** Units held on the day this was read. Zero for a tracked-only row. */
  quantity: number;
  /**
   * Cash this action pays into the account: amount per share x units held.
   *
   * Null for anything that is not a dividend, and for a dividend the exchange worded in a way the
   * parser could not read a rupee figure out of — an unknown payout must never render as ₹0.
   */
  payout: number | null;
  /**
   * What the position becomes after a bonus or a split, or null when the action does not change it.
   *
   * The average price moves with the count so the cost basis is preserved: the reader has not made
   * or lost anything, they simply hold more shares at a lower price each.
   */
  adjusted: { quantity: number; avgPrice: number } | null;
};

export type ActionsView = {
  /** Ex-date still ahead, soonest first. What the reader can still act on. */
  upcoming: HeldAction[];
  /** Ex-date passed inside the window, most recent first. What they should already have received. */
  recent: HeldAction[];
  /** Total cash from the upcoming dividends that carry a readable amount. */
  expectedIncome: number;
  /** Income as a percentage of the book's market value — the forward yield on what is declared. */
  expectedYieldPercent: number | null;
  /** Upcoming dividends whose amount could not be read, so the total above understates the truth. */
  unpricedDividends: number;
  /** Upcoming actions that change the share count rather than pay cash. */
  structural: HeldAction[];
  /** Held symbols with nothing declared either way. */
  quiet: string[];
};

/** Rounds money to paise. Two floats multiplied do not land on a rupee boundary by themselves. */
function toPaise(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The share count and average price after a ratio action.
 *
 * A bonus of "1:1" means one new share for every one held, so the count doubles. A split written
 * as old:new face value — "10:2" — divides the price by five, so the count multiplies by five.
 * Both arrive here as the same "a:b" string and mean opposite things, which is why the kind
 * decides the arithmetic rather than the ratio alone.
 *
 * Rights are deliberately not adjusted: an entitlement to subscribe is not shares received, and
 * whether the reader takes it up is their decision, not something to predict on their behalf.
 */
export function adjustForRatio(
  kind: CorporateAction["kind"],
  ratio: string | null,
  quantity: number,
  avgPrice: number,
): { quantity: number; avgPrice: number } | null {
  if (ratio === null || quantity <= 0) return null;
  if (kind !== "Bonus" && kind !== "Split") return null;

  const [left, right] = ratio.split(":").map(Number);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return null;

  // Bonus: `left` new shares for every `right` held. Split: face value goes from `left` to `right`,
  // so each share becomes left/right of them.
  const multiplier = kind === "Bonus" ? 1 + left / right : left / right;
  if (multiplier <= 0 || !Number.isFinite(multiplier)) return null;

  const next = quantity * multiplier;
  // Guard the degenerate "1:1 split", which is not a split at all and would leave the position
  // exactly as it was — reporting it as a change would be noise.
  if (Math.abs(next - quantity) < 0.0001) return null;

  return {
    quantity: Math.round(next * 100) / 100,
    // Cost is conserved: the same money is spread over more shares.
    avgPrice: toPaise(avgPrice / multiplier),
  };
}

/** One exchange action, priced against the position the reader holds in it. */
export function measureAction(action: CorporateAction, holding: Holding): HeldAction {
  const payout =
    action.kind === "Dividend" && action.amount !== null && holding.quantity > 0
      ? toPaise(action.amount * holding.quantity)
      : null;

  return {
    ...action,
    quantity: holding.quantity,
    payout,
    adjusted: adjustForRatio(action.kind, action.ratio, holding.quantity, holding.avgPrice),
  };
}

/**
 * The exchange's calendar, filtered to one book.
 *
 * Matched on the ticker, upper-cased on both sides. A BSE-listed company that is also on NSE
 * carries the same symbol on both, which covers the overwhelming majority of what anybody holds;
 * a BSE-only scrip simply has nothing declared against it here and lands in `quiet`, which is
 * honest — the alternative is guessing at a mapping and attributing another company's dividend to
 * a holding.
 */
export function actionsForHoldings(actions: CorporateAction[], holdings: Holding[], marketValue = 0): ActionsView {
  const bySymbol = new Map(holdings.map((holding) => [holding.symbol.toUpperCase(), holding]));

  const upcoming: HeldAction[] = [];
  const recent: HeldAction[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    const holding = bySymbol.get(action.symbol.toUpperCase());
    if (!holding) continue;

    seen.add(holding.symbol);
    const measured = measureAction(action, holding);
    (measured.upcoming ? upcoming : recent).push(measured);
  }

  // Soonest deadline first among what is still ahead; most recent first among what has passed.
  upcoming.sort((a, b) => (a.exDate ?? "9999-99-99").localeCompare(b.exDate ?? "9999-99-99"));
  recent.sort((a, b) => (b.exDate ?? "").localeCompare(a.exDate ?? ""));

  const dividends = upcoming.filter((action) => action.kind === "Dividend");
  const expectedIncome = toPaise(dividends.reduce((sum, action) => sum + (action.payout ?? 0), 0));

  return {
    upcoming,
    recent,
    expectedIncome,
    // Against market value rather than cost: a yield is what the money is earning where it sits
    // now, not what it earns against a price paid years ago.
    expectedYieldPercent: marketValue > 0 ? (expectedIncome / marketValue) * 100 : null,
    unpricedDividends: dividends.filter((action) => action.payout === null && action.quantity > 0).length,
    structural: upcoming.filter((action) => action.kind === "Bonus" || action.kind === "Split" || action.kind === "Rights"),
    quiet: holdings.map((holding) => holding.symbol).filter((symbol) => !seen.has(symbol)),
  };
}

/** How soon an ex-date is, in words. "In 3 days" is read faster than a date is. */
export function whenLabel(action: HeldAction): string {
  if (action.daysAway === null) return "Date not declared";
  if (action.daysAway === 0) return "Ex-date today";
  if (action.daysAway === 1) return "Ex-date tomorrow";
  if (action.daysAway > 0) return `In ${action.daysAway} days`;
  if (action.daysAway === -1) return "Yesterday";
  return `${Math.abs(action.daysAway)} days ago`;
}

/**
 * The calendar's own figures, in the shape the board-read endpoint narrates.
 *
 * Built from what is on screen, so the read can only describe this reader's actions. Null when
 * nothing is declared against anything they hold — there is no board to read, and asking a model
 * to say something about an empty one is how a page ends up with invented news on it.
 */
export function actionsBrief(view: ActionsView): BoardBrief | null {
  if (view.upcoming.length === 0 && view.recent.length === 0) return null;

  const facts = [
    { label: "Declared ahead", value: `${view.upcoming.length} action${view.upcoming.length === 1 ? "" : "s"}` },
    { label: "Expected income", value: view.expectedIncome > 0 ? formatMoney(view.expectedIncome) : "—" },
    {
      label: "Forward yield",
      value: view.expectedYieldPercent === null ? "—" : `${view.expectedYieldPercent.toFixed(2)}% of market value`,
    },
    { label: "Share-count changes", value: `${view.structural.length} ahead` },
    { label: "Recently passed", value: `${view.recent.length} in the last month` },
  ].filter((fact) => fact.value !== "—");

  const highlights: string[] = [];

  for (const action of view.upcoming.slice(0, 4)) {
    const money = action.payout === null ? "" : ` — about ${formatMoney(action.payout)} on ${action.quantity} shares`;
    highlights.push(`${action.symbol}: ${action.kind.toLowerCase()} ${whenLabel(action).toLowerCase()}${money}.`);
  }

  for (const action of view.structural.slice(0, 2)) {
    if (!action.adjusted) continue;
    highlights.push(
      `${action.symbol}'s ${action.kind.toLowerCase()} takes the position to ${action.adjusted.quantity} shares at ${formatMoney(action.adjusted.avgPrice)} average.`,
    );
  }

  if (view.unpricedDividends > 0) {
    highlights.push(`${view.unpricedDividends} declared dividend(s) have no readable per-share amount, so the income total understates.`);
  }
  if (view.quiet.length > 0) {
    highlights.push(`${view.quiet.length} holding(s) have nothing declared in this window.`);
  }

  if (facts.length === 0 && highlights.length === 0) return null;

  return {
    subject: "the declared corporate actions against one investor's own holdings, over the next six months",
    question: "Which of these deadlines matters, and what should the holder do before them?",
    facts,
    highlights,
  };
}
