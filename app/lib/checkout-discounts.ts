// Reads AUTH_TOKEN_SECRET. The `server-only` import makes a client component that pulls this in a
// build error, rather than a key that quietly ships to the browser.
import "server-only";

import { createHmac } from "node:crypto";
import { appOrigin } from "./app-origin";
import { billedAmount, type BillingCycle, type PlanKey } from "./subscription-pricing";
import { listUsers, type AppUser } from "./store";

export type DiscountKind = "promo" | "referral";

export type AppliedDiscount = {
  kind: DiscountKind;
  code: string;
  percent: 5 | 10 | 20;
  label: string;
};

export type SubscriptionQuote = {
  baseAmountRupees: number;
  amountRupees: number;
  discountRupees: number;
  discountPercent: number;
  discountLabel: string | null;
  appliedCode: string | null;
  appliedKind: DiscountKind | null;
  promoCode: string;
  referralCode: string;
  promoValid: boolean;
  referralValid: boolean;
  message: string | null;
};

const PROMO_CODES: Record<string, AppliedDiscount> = {
  SAVE5: { kind: "promo", code: "SAVE5", percent: 5, label: "5% promo discount" },
  SAVE10: { kind: "promo", code: "SAVE10", percent: 10, label: "10% promo discount" },
  SAVE20: { kind: "promo", code: "SAVE20", percent: 20, label: "20% promo discount" },
  STOCKERS5: { kind: "promo", code: "STOCKERS5", percent: 5, label: "5% promo discount" },
  STOCKERS10: { kind: "promo", code: "STOCKERS10", percent: 10, label: "10% promo discount" },
  STOCKERS20: { kind: "promo", code: "STOCKERS20", percent: 20, label: "20% promo discount" },
};

const REFERRAL_PERCENT = 10;

function discountSecret(): string {
  return process.env.AUTH_TOKEN_SECRET || "stockers-dev-only-insecure-secret";
}

export function normalizeDiscountCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

export function promoDiscountForCode(value: unknown): AppliedDiscount | null {
  const code = normalizeDiscountCode(value);
  return code ? PROMO_CODES[code] ?? null : null;
}

export function referralCodeForUser(user: Pick<AppUser, "id" | "email">): string {
  const digest = createHmac("sha256", discountSecret()).update(`${user.id}:${user.email.toLowerCase()}`).digest("hex");
  return `STK${digest.slice(0, 8).toUpperCase()}`;
}

export function referralShareUrl(user: Pick<AppUser, "id" | "email">, origin = appOrigin()): string {
  const url = new URL("/signup", origin);
  url.searchParams.set("ref", referralCodeForUser(user));
  return url.toString();
}

export function discountedAmount(baseAmountRupees: number, discountPercent: number): number {
  if (discountPercent <= 0) return baseAmountRupees;
  return Math.max(1, Math.round(baseAmountRupees * (100 - discountPercent) / 100));
}

async function referralDiscountForCode(value: unknown, currentUserId?: string): Promise<AppliedDiscount | null> {
  const code = normalizeDiscountCode(value);
  if (!code) return null;

  const referrer = (await listUsers()).find((user) => referralCodeForUser(user) === code);
  if (!referrer || referrer.id === currentUserId) return null;

  return {
    kind: "referral",
    code,
    percent: REFERRAL_PERCENT,
    label: "10% referral discount",
  };
}

function betterDiscount(left: AppliedDiscount | null, right: AppliedDiscount | null): AppliedDiscount | null {
  if (!left) return right;
  if (!right) return left;
  return right.percent > left.percent ? right : left;
}

export async function subscriptionQuote(input: {
  plan: PlanKey;
  cycle: BillingCycle;
  promoCode?: unknown;
  referralCode?: unknown;
  currentUserId?: string;
}): Promise<SubscriptionQuote> {
  const baseAmountRupees = billedAmount(input.plan, input.cycle);
  const promoCode = normalizeDiscountCode(input.promoCode);
  const referralCode = normalizeDiscountCode(input.referralCode);
  const promo = promoDiscountForCode(promoCode);
  const referral = await referralDiscountForCode(referralCode, input.currentUserId);
  const applied = betterDiscount(promo, referral);
  const amountRupees = discountedAmount(baseAmountRupees, applied?.percent ?? 0);
  const discountRupees = baseAmountRupees - amountRupees;

  const message =
    applied
      ? `${applied.label} applied.`
      : promoCode && !promo
        ? "Promo code not recognised."
        : referralCode && !referral
          ? "Referral code not recognised or belongs to this account."
          : null;

  return {
    baseAmountRupees,
    amountRupees,
    discountRupees,
    discountPercent: applied?.percent ?? 0,
    discountLabel: applied?.label ?? null,
    appliedCode: applied?.code ?? null,
    appliedKind: applied?.kind ?? null,
    promoCode,
    referralCode,
    promoValid: Boolean(promo),
    referralValid: Boolean(referral),
    message,
  };
}

export function discountFromPaymentNotes(notes: Record<string, string> | undefined): AppliedDiscount | null {
  const kind = notes?.discountKind;
  const code = normalizeDiscountCode(notes?.discountCode);
  const percent = Number(notes?.discountPercent);
  if ((kind !== "promo" && kind !== "referral") || !code || (percent !== 5 && percent !== 10 && percent !== 20)) {
    return null;
  }

  return {
    kind,
    code,
    percent,
    label: kind === "promo" ? `${percent}% promo discount` : `${percent}% referral discount`,
  };
}
