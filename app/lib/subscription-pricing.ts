export type PlanKey = "starter" | "pro" | "elite";
export type BillingCycle = "monthly" | "yearly";

export const PLAN_MONTHLY: Record<PlanKey, number> = {
  starter: 149,
  pro: 399,
  elite: 899,
};

export const PLAN_LABEL: Record<PlanKey, string> = {
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

// Nine months for twelve on the yearly cycle.
export const YEARLY_MONTHS = 9;

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "starter" || value === "pro" || value === "elite";
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

export function billedAmount(plan: PlanKey, cycle: BillingCycle): number {
  return cycle === "yearly" ? PLAN_MONTHLY[plan] * YEARLY_MONTHS : PLAN_MONTHLY[plan];
}

export function monthlyEquivalent(plan: PlanKey, cycle: BillingCycle): number {
  return cycle === "yearly" ? Math.round(billedAmount(plan, cycle) / 12) : PLAN_MONTHLY[plan];
}

export function yearlySaving(plan: PlanKey): number {
  return PLAN_MONTHLY[plan] * 12 - billedAmount(plan, "yearly");
}

export function rupees(value: number): string {
  return `\u20b9${value.toLocaleString("en-IN")}`;
}

export function billingSummary(plan: PlanKey, cycle: BillingCycle): string {
  if (cycle === "yearly") {
    return `${rupees(monthlyEquivalent(plan, cycle))}/month, ${rupees(billedAmount(plan, cycle))} billed yearly`;
  }

  return `${rupees(billedAmount(plan, cycle))}/month, billed monthly`;
}
