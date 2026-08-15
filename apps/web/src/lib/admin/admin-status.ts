export type AdminTone = "neutral" | "ok" | "warn" | "danger";

export function roleStatus(role: string): { label: string; tone: AdminTone } {
  if (role === "admin") return { label: "Admin", tone: "warn" };
  if (role === "developer") return { label: "Developer", tone: "ok" };
  if (role === "demo") return { label: "Demo", tone: "neutral" };
  return { label: "User", tone: "neutral" };
}

export function billingStatus(status: string): { label: string; tone: AdminTone } {
  const raw = status || "none";
  const s = raw.toLowerCase();
  const label = raw.replaceAll("_", " ");
  if (s === "active" || s === "trialing") return { label, tone: "ok" };
  if (s === "past_due" || s === "unpaid") return { label, tone: "danger" };
  if (s === "canceled" || s === "paused") return { label, tone: "warn" };
  return { label, tone: "neutral" };
}

export function jobStatus(status: string): { label: string; tone: AdminTone } {
  const s = status.toLowerCase();
  if (s === "ready") return { label: "Ready", tone: "ok" };
  if (s === "error") return { label: "Error", tone: "danger" };
  if (s === "processing") return { label: "Processing", tone: "warn" };
  if (s === "pending") return { label: "Pending", tone: "warn" };
  return { label: status || "none", tone: "neutral" };
}

export function boolStatus(
  on: boolean,
  onLabel = "Yes",
  offLabel = "No",
  offTone: AdminTone = "neutral",
): { label: string; tone: AdminTone } {
  return on ? { label: onLabel, tone: "ok" } : { label: offLabel, tone: offTone };
}

export function sourceStatus(source: "db" | "env" | string): { label: string; tone: AdminTone } {
  return source === "db" ? { label: "Database", tone: "warn" } : { label: "Environment", tone: "neutral" };
}
