export type StrategyInput = {
  hasVehicleProfile: boolean;
  ecoComparison?: boolean;
};

export type StrategyChoice = {
  provider: "google" | "osrm" | "fixture";
  mode: "basic" | "advanced";
  branch: "profiled-basic" | "unprofiled-advanced" | "eco-advanced";
};

/** Explicit call-site choice. Never a hidden default to Google. */
export function selectRouteStrategy(input: StrategyInput): StrategyChoice {
  if (input.ecoComparison) {
    return { provider: "google", mode: "advanced", branch: "eco-advanced" };
  }
  if (input.hasVehicleProfile) {
    return { provider: "google", mode: "basic", branch: "profiled-basic" };
  }
  return { provider: "google", mode: "advanced", branch: "unprofiled-advanced" };
}
