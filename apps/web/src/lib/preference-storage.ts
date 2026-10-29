const CONSENT_KEY = 'locations-storage-consent';
const memory = new Map<string, string>();
export function storageChoice(): string | null {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}
export const preferenceStorage = {
  getItem(key: string): string | null {
    if (storageChoice() === 'allow') {
      try { return localStorage.getItem(key); } catch { /* memory fallback */ }
    }
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    memory.set(key, value);
    if (storageChoice() === 'allow') {
      try { localStorage.setItem(key, value); } catch { /* memory fallback */ }
    }
  },
  removeItem(key: string): void {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};
export function setStorageChoice(allow: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, allow ? 'allow' : 'deny');
    if (!allow) {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('locations-') && key !== CONSENT_KEY) localStorage.removeItem(key);
      }
    } else {
      for (const [key, value] of memory) localStorage.setItem(key, value);
    }
  } catch { /* Choices still work for this page through memory. */ }
}
