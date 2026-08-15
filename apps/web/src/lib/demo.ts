export async function startDemoSession(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth/demo", { method: "POST", credentials: "include" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error || "Demo unavailable right now" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to start demo. Try again shortly." };
  }
}
