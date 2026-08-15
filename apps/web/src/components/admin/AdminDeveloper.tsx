import { useState } from "react";
import { useSession } from "../../lib/auth";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { DEVELOPER_SAFE_CHECKS, summarizeCheckBody, type DeveloperCheck } from "../../lib/admin/admin-checks";
import { adminJson } from "../../lib/admin/admin-api";
import { AdminCard, AdminSection } from "./AdminSection";
import { AdminStatus } from "./AdminUi";

type CheckResult = {
  id: string;
  status: number;
  ms: number;
  pass: boolean;
  detail: string;
};

async function runCheck(check: DeveloperCheck): Promise<CheckResult> {
  const started = performance.now();
  const res = await fetch(check.url, { credentials: "include" });
  const ms = Math.round(performance.now() - started);
  const text = await res.text();
  const privacy = summarizeCheckBody(text);
  const pass = res.ok && privacy.ok;
  return {
    id: check.id,
    status: res.status,
    ms,
    pass,
    detail: privacy.ok ? `${res.status}` : privacy.reason ?? "failed",
  };
}

const AUTHZ_MATRIX = [
  "Unauthenticated /api/admin/* returns 401",
  "role=user or demo returns 404 (not 403)",
  "developer GET returns 200; developer PATCH/POST returns 404",
  "admin mutations allowed; last admin cannot be demoted",
];

const GROUPS: { key: DeveloperCheck["group"]; label: string }[] = [
  { key: "Public", label: "Public" },
  { key: "Session", label: "Session" },
  { key: "Operator", label: "Admin" },
];

export function AdminDeveloperPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [destructive, setDestructive] = useState(false);
  const [probe, setProbe] = useState<string | null>(null);

  async function runOne(check: DeveloperCheck) {
    setRunning(check.id);
    const result = await runCheck(check);
    setResults((prev) => ({ ...prev, [check.id]: result }));
    setRunning(null);
  }

  async function runAll() {
    for (const check of DEVELOPER_SAFE_CHECKS) {
      await runOne(check);
    }
  }

  async function runRejectedPatch() {
    setRunning("flags-empty");
    const started = performance.now();
    try {
      await adminJson("/api/admin/flags", { method: "PATCH", body: "{}" });
      setProbe(`unexpected 200 in ${Math.round(performance.now() - started)}ms`);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      const pass = status === 400 || status === 404;
      setProbe(`${pass ? "pass" : "fail"}: empty PATCH returned ${status} in ${Math.round(performance.now() - started)}ms`);
    }
    setRunning(null);
  }

  return (
    <AdminSection
      title="Developer"
      description="Live GET checks against this environment. CI runs npm run test:admin. This page never wipes data or prints secrets."
    >
      <div className="flex flex-wrap gap-2">
        <Button type="button" title="Run all safe GET checks" onClick={() => void runAll()} disabled={running !== null}>
          Run all (safe)
        </Button>
      </div>
      {GROUPS.map((group) => (
        <AdminCard key={group.key} title={group.label}>
          <ul className="space-y-2">
            {DEVELOPER_SAFE_CHECKS.filter((c) => c.group === group.key).map((check) => {
              const result = results[check.id];
              return (
                <li key={check.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    {check.label}
                    {result && (
                      <span className="ml-2 text-text-muted">
                        {result.status} · {result.ms}ms
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {result && (
                      <AdminStatus tone={result.pass ? "ok" : "danger"}>{result.pass ? "Pass" : "Fail"}</AdminStatus>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      title={check.title}
                      disabled={running !== null}
                      onClick={() => void runOne(check)}
                    >
                      Check
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </AdminCard>
      ))}
      <AdminCard title="Authz matrix (static)">
        <p className="mb-2 text-xs text-text-muted">
          Negative checks as another user stay in test:admin. This list is the expected contract.
        </p>
        <ul className="space-y-1 text-sm">
          {AUTHZ_MATRIX.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </AdminCard>
      {isAdmin && (
        <AdminCard title="Optional gate probe">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm">Show rejected empty PATCH (not wipe)</span>
            <Switch
              checked={destructive}
              onCheckedChange={setDestructive}
              title="Show optional rejected PATCH probe"
              aria-label="Show optional rejected PATCH probe"
            />
          </div>
          {destructive && (
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              title="Send an empty flags PATCH that should be rejected"
              disabled={running !== null}
              onClick={() => void runRejectedPatch()}
            >
              Probe empty PATCH
            </Button>
          )}
          {probe && (
            <p className="mt-2">
              <AdminStatus tone={probe.startsWith("pass") ? "ok" : "danger"}>{probe.startsWith("pass") ? "Pass" : "Fail"}</AdminStatus>
              <span className="ml-2 text-sm text-text-muted">{probe}</span>
            </p>
          )}
        </AdminCard>
      )}
    </AdminSection>
  );
}
