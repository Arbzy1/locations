export const PERSONALITY_DISMISS_KEY = 'locations-personality-dismissed';

export function loadDismissedPersonality(): string[] {
  try {
    const raw = localStorage.getItem(PERSONALITY_DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function saveDismissedPersonality(ids: string[]): void {
  localStorage.setItem(PERSONALITY_DISMISS_KEY, JSON.stringify([...new Set(ids)]));
}

export function visiblePersonality<T extends { id: string }>(
  tags: T[],
  dismissed: string[],
): T[] {
  const hidden = new Set(dismissed);
  return tags.filter((t) => !hidden.has(t.id));
}
