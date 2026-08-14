import type { DistanceUnit } from '../utils/format';

export const WALK_GOAL_KEY = 'locations-walk-goal';

export type WalkGoal = {
  month: string;
  target: number;
  unit: DistanceUnit;
};

export function loadWalkGoal(): WalkGoal | null {
  try {
    const raw = localStorage.getItem(WALK_GOAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WalkGoal>;
    if (!parsed.month || typeof parsed.target !== 'number' || !parsed.unit) return null;
    if (parsed.unit !== 'mi' && parsed.unit !== 'km') return null;
    if (!Number.isFinite(parsed.target) || parsed.target <= 0) return null;
    return { month: parsed.month, target: parsed.target, unit: parsed.unit };
  } catch {
    return null;
  }
}

export function saveWalkGoal(goal: WalkGoal): void {
  localStorage.setItem(WALK_GOAL_KEY, JSON.stringify(goal));
}

export function walkProgress(walked: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, walked / target);
}
