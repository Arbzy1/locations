export const IMPORT_CUT_IN_MS = {
  slit: 100,
  open: 200,
  content: 200,
  hold: 900,
  exit: 260,
} as const;

export type ImportCutInJob = {
  id: string;
  status: string;
  visitCount?: number | null;
  activityCount?: number | null;
};

export function importCutInCopy(job: {
  visitCount?: number | null;
  activityCount?: number | null;
}) {
  const visits = job.visitCount ?? 0;
  const activities = job.activityCount ?? 0;
  return {
    eyebrow: "TIMELINE",
    headline: "IMPORT READY!",
    meta: `${visits.toLocaleString()} visits · ${activities.toLocaleString()} activities`,
    status: `Imported ${visits} visits, ${activities} activities.`,
  };
}

/** After first paint is recorded. A ready job on the initial snapshot must not fire. */
export function shouldFireImportCutIn(
  prev: Pick<ImportCutInJob, "id" | "status"> | null,
  next: Pick<ImportCutInJob, "id" | "status"> | null,
): boolean {
  if (!next || next.status !== "ready") return false;
  if (!prev) return true;
  if (prev.status === "pending" || prev.status === "processing") return true;
  return prev.id !== next.id;
}

export function prefersImportCutInReducedMotion(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-force-reduced-motion") === "true") {
      return true;
    }
  }
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}
