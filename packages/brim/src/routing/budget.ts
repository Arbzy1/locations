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
