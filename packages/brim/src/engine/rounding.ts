/**
 * Never present more precision than the band supports.
 * Money rounds to the pound when the band is wider than £2, to ten pence otherwise.
 */
export function roundMoneyPence(pointPence: number, lowPence: number, highPence: number): number {
  const bandPounds = (highPence - lowPence) / 100;
  if (bandPounds > 2) {
    return Math.round(pointPence / 100) * 100;
  }
  return Math.round(pointPence / 10) * 10;
}

export function roundBandPence(band: { point: number; low: number; high: number }): {
  point: number;
  low: number;
  high: number;
} {
  return {
    point: roundMoneyPence(band.point, band.low, band.high),
    low: roundMoneyPence(band.low, band.low, band.high),
    high: roundMoneyPence(band.high, band.low, band.high),
  };
}
