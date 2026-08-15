import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import type { AdminTone } from "../../lib/admin-status";

export type { AdminTone } from "../../lib/admin-status";
export { roleStatus, billingStatus, jobStatus, boolStatus, sourceStatus } from "../../lib/admin-status";

const TONE_TEXT: Record<AdminTone, string> = {
  neutral: "text-text",
  ok: "text-accent",
  warn: "text-admin",
  danger: "text-train",
};

const TONE_BADGE: Record<AdminTone, string> = {
  neutral: "",
  ok: "border-accent/40 bg-accent/10 text-accent",
  warn: "border-admin/40 bg-admin/10 text-admin",
  danger: "border-train/40 bg-train/10 text-train",
};

export function AdminStat({
  value,
  label,
  hint,
  tone = "neutral",
  loading,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: AdminTone;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className={cn("font-display text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</p>
      )}
      <p className="mt-1 text-sm text-text">{label}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

export function AdminStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: AdminTone }) {
  return <Badge className={TONE_BADGE[tone]}>{children}</Badge>;
}

export function AdminDl({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs text-text-muted">{row.label}</dt>
          <dd className="mt-0.5 text-sm text-text">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminTable({
  headers,
  children,
  empty,
  emptyLabel = "Nothing in this sample.",
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        {!empty && <tbody>{children}</tbody>}
      </table>
      {empty && <p className="px-3 py-6 text-sm text-text-muted">{emptyLabel}</p>}
    </div>
  );
}

export function AdminBars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No sampled data.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate capitalize">{item.label.replaceAll("_", " ")}</span>
            <span className="tabular-nums text-text-muted">{item.count}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full bg-admin"
              style={{ width: `${Math.round((item.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminSkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}
