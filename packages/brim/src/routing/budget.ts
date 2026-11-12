export type BudgetState = {
  spentUsd: number;
  ceilingUsd: number;
};

export function budgetStatus(state: BudgetState): {
  exceeded: boolean;
  alert: "none" | "60" | "85";
} {
  const ratio = state.spentUsd / state.ceilingUsd;
  const exceeded = ratio >= 1;
  const alert = ratio >= 0.85 ? "85" : ratio >= 0.6 ? "60" : "none";
  return { exceeded, alert };
}

/**
 * Estimated list price of one Google Routes request, in USD. Deliberately on the high
 * side so the spend guard trips early rather than late. Advanced requests ask for
 * traffic-aware routing and tolls, which Google bills at a higher tier.
 */
export const ROUTE_COST_USD = { basic: 0.005, advanced: 0.015 } as const;

/** Key for the month's running total, e.g. `routing_spend:2026-11` (UTC). */
export function routingSpendKey(now: Date = new Date()): string {
  return `routing_spend:${now.toISOString().slice(0, 7)}`;
}
