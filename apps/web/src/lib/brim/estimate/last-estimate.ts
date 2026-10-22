/**
 * The last estimate stays on this device so the page reopens on the same trip.
 * Keyed by user id so a second account on a shared browser never sees the first one's trip.
 */
const KEY = "locations-journey-cost:last-estimate";

export function readLastEstimate<T>(userId: string | undefined): T | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; estimate?: T };
    return parsed.userId === userId && parsed.estimate ? parsed.estimate : null;
  } catch {
    return null;
  }
}

export function writeLastEstimate(userId: string | undefined, estimate: unknown): void {
  if (!userId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, estimate }));
  } catch {
    /* storage blocked or full: the estimate still shows, it just will not persist */
  }
}
