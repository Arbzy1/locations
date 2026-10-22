export type ArrivalCopyInput = {
  percent: number;
  verdict: "comfortable" | "tight" | "insufficient";
  shortfallKwh?: number;
};

export function arrivalCopy(input: ArrivalCopyInput): string {
  const pct = Math.round(input.percent);
  if (input.verdict === "comfortable") {
    return `You'll arrive with about ${pct}%.`;
  }
  if (input.verdict === "tight") {
    return `Tight - about ${pct}% on arrival. Worth a top-up.`;
  }
  if (input.shortfallKwh !== undefined) {
    const kwh = Math.round(input.shortfallKwh);
    return `You won't make it without charging. You'll need roughly ${kwh} kWh on the way.`;
  }
  return "You won't make it without charging.";
}
