/** JSON fetch for /api/brim/*. Same-origin; the session cookie carries the tenant. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
    throw new Error(body.reason ?? body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function asList<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}
