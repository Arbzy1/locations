export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid];
  if (a === undefined) return undefined;
  if (sorted.length % 2 === 1) return a;
  const b = sorted[mid - 1];
  if (b === undefined) return undefined;
  return (a + b) / 2;
}

export function newestIso(values: string[]): string | undefined {
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const iso of values) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}
