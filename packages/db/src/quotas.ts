export type PlanId = "free" | "pro";

export type PlanQuota = {
  maxSources: number;
  maxUploadBytes: number;
  maxConcurrentImports: number;
};

export const PLAN_QUOTAS: Record<PlanId, PlanQuota> = {
  free: {
    maxSources: 1,
    maxUploadBytes: 20 * 1024 * 1024,
    maxConcurrentImports: 1,
  },
  pro: {
    maxSources: 20,
    maxUploadBytes: 80 * 1024 * 1024,
    maxConcurrentImports: 1,
  },
};

export function quotaForEntitled(entitled: boolean): PlanQuota {
  return entitled ? PLAN_QUOTAS.pro : PLAN_QUOTAS.free;
}
