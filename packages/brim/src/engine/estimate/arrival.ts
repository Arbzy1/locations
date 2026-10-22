export type ArrivalVerdict = "comfortable" | "tight" | "insufficient";

export function arrivalStateOfCharge(input: {
  startPct: number;
  batteryKwhUsed: number;
  usableBatteryKwh: number;
}): { percent: number; verdict: ArrivalVerdict; shortfallKwh?: number } {
  const usedPct = (input.batteryKwhUsed / input.usableBatteryKwh) * 100;
  const percent = input.startPct - usedPct;
  if (percent > 20) return { percent, verdict: "comfortable" };
  if (percent >= 10) return { percent, verdict: "tight" };
  const shortfallKwh = percent >= 0 ? undefined : (-percent / 100) * input.usableBatteryKwh;
  const needed = percent < 10 ? Math.max(0, (10 - percent) / 100) * input.usableBatteryKwh : 0;
  return {
    percent,
    verdict: "insufficient",
    shortfallKwh: shortfallKwh ?? needed,
  };
}
