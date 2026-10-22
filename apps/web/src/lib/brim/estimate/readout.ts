export function formatEstimateMoney(totalPence: { point: number; low: number; high: number }): {
  pounds: number;
  band: string;
} {
  return {
    pounds: totalPence.point / 100,
    band: `£${(totalPence.low / 100).toFixed(0)}–£${(totalPence.high / 100).toFixed(0)}`,
  };
}
