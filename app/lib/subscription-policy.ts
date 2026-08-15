// The trial policy constants, in a module a browser bundle may import.
//
// They used to live in ./subscription, and for the server they still logically do — but that module
// reaches `node:fs`, the shared cache and the NSE client, so a client component that wanted to say
// "5-day free trial" would have pulled all of it across the boundary. The repo already draws this
// line elsewhere (see the note in ../components/bse-trending-board about taking values from
// ./bse-platform and only types from ./bse-market); this is the same split for the same reason.
//
// ./subscription re-exports both, so every existing server-side import is unchanged and there is
// still exactly one definition of each.

import type { PlanTier } from "./plan-tiers";

/**
 * Length of the free trial, counted in IST calendar days from signup.
 *
 * Calendar days rather than market days: a reader who signs up on a Friday should not find their
 * trial suspended over the weekend and then be told it was "3 days". The IST part matters because
 * the account's dates are the exchange's dates — a subscriber in London does not lose a day.
 */
export const TRIAL_DAYS = 5;

/**
 * The tier an account keeps once its trial is spent and nothing has been bought.
 *
 * This used to be nothing at all: the trial ended and every AI feature locked. That made the trial
 * a cliff — five days of the whole product, then a wall — and a reader who was not ready to decide
 * on day five had no reason to come back. Landing them on Starter instead keeps the account useful
 * and keeps the decision open, and the two tiers actually worth paying for stay behind the paywall.
 *
 * It is granted, not sold: `planName` reports Starter and `subscribedUntil` stays null, so nothing
 * in the app mistakes this for a payment on the record. The access state stays `expired` for the
 * same reason — the trial did end, the UI should say so, and the tier is what governs access.
 */
export const POST_TRIAL_TIER: PlanTier = "starter";
