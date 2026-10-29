/**
 * Split one journey's drawn line into pieces to style differently:
 * - `gap`: the phone recorded nothing for a while as it moved (a tunnel, the phone
 *   asleep), so that stretch of line is a guess. Drawn faintly dashed.
 * - `walk`: the walk to and from the station at either end of a train journey
 *   that Google recorded as one journey. Drawn in the walking style.
 * - `main`: everything else, in the journey's own style.
 * Pure, for drawing only: the journey's mode, distance and stats do not change.
 */

export type JourneyPieceKind = 'main' | 'gap' | 'walk';
export type JourneyPiece = { kind: JourneyPieceKind; coords: [number, number][] };

/**
 * No fix for this long while moving this far counts as a gap. Train GPS is sparse: on a
 * real export 5 minutes would have dashed 55% of train distance, 10 minutes 16%.
 */
const GAP_SECONDS = 10 * 60;
const GAP_METRES = 1000;
/** Slower than this is walking; the ends must add up to this much walking to show. */
const WALK_KMH = 7;
const WALK_MIN_METRES = 200;
/**
 * Modes whose slow ends are a walk to or from the platform. Not cars or buses: their slow
 * starts are traffic, car parks and waiting at stops (17% of car and 38% of bus journeys
 * on a real export would have been marked).
 */
const RIDDEN = new Set(['train', 'subway']);

function metres(a: readonly [number, number, ...number[]], b: readonly [number, number, ...number[]]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** For each fix, the nearest line vertex at or after the previous fix's vertex. */
function pinFixes(line: [number, number][], fixes: [number, number, number][]): number[] {
  const out: number[] = [];
  let from = 0;
  for (const f of fixes) {
    let best = from;
    let bestM = Infinity;
    for (let i = from; i < line.length; i++) {
      const m = metres(line[i], f);
      if (m < bestM) {
        bestM = m;
        best = i;
      }
    }
    out.push(best);
    from = best;
  }
  return out;
}

export function journeyPieces(
  line: [number, number][],
  fixes: [number, number, number][] | undefined,
  mode: string,
): JourneyPiece[] {
  const whole: JourneyPiece[] = [{ kind: 'main', coords: line }];
  const fx = (fixes ?? []).filter((f) => Number.isFinite(f[0]) && Number.isFinite(f[1]) && Number.isFinite(f[2]));
  if (line.length < 2 || fx.length < 2) return whole;

  // Kind of each stretch between consecutive fixes.
  const legs = fx.slice(1).map((f, k) => {
    const prev = fx[k];
    const m = metres(prev, f);
    const s = f[2] - prev[2];
    return { m, s, kmh: s > 0 ? (m / s) * 3.6 : Infinity, kind: 'main' as JourneyPieceKind };
  });
  for (const leg of legs) if (leg.s > GAP_SECONDS && leg.m > GAP_METRES) leg.kind = 'gap';

  // Walking ends of a ridden journey (walk, train, walk recorded as one).
  if (RIDDEN.has(mode)) {
    const markEnd = (order: number[]) => {
      let walked = 0;
      const run: number[] = [];
      for (const k of order) {
        if (legs[k].kind !== 'main' || legs[k].kmh >= WALK_KMH) break;
        walked += legs[k].m;
        run.push(k);
      }
      // Only when something faster follows: an all-slow journey is not walk-train-walk.
      if (walked >= WALK_MIN_METRES && run.length < legs.length) for (const k of run) legs[k].kind = 'walk';
    };
    markEnd(legs.map((_, k) => k));
    markEnd(legs.map((_, k) => legs.length - 1 - k));
  }
  if (legs.every((l) => l.kind === 'main')) return whole;

  // Cut the line at the fixes and join neighbouring stretches of the same kind.
  const at = pinFixes(line, fx);
  const pieces: JourneyPiece[] = [];
  const push = (kind: JourneyPieceKind, from: number, to: number) => {
    if (to <= from) return;
    const coords = line.slice(from, to + 1);
    const last = pieces[pieces.length - 1];
    if (last && last.kind === kind) last.coords.push(...coords.slice(1));
    else pieces.push({ kind, coords });
  };
  // Before the first fix and after the last, the line takes its neighbour's kind.
  push(legs[0].kind, 0, at[0]);
  legs.forEach((leg, k) => push(leg.kind, at[k], at[k + 1]));
  push(legs[legs.length - 1].kind, at[at.length - 1], line.length - 1);
  return pieces.length ? pieces : whole;
}
