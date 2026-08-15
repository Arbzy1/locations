import { CreditCard, Lock, Upload, User } from "lucide-react";
import StatCard from "./StatCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardTitle } from "./ui/card";
import { useImportStatus, useSources } from "../hooks/useApi";
import { useUnits } from "../lib/units";
import type { SettingsSection } from "../lib/settings-section";

type Props = {
  name?: string;
  email?: string;
  emailVerified?: boolean;
  onSelect: (section: SettingsSection) => void;
};

export default function SettingsOverview({ name, email, emailVerified, onSelect }: Props) {
  const { data: sources } = useSources();
  const { data: importStatus } = useImportStatus();
  const { entitlements } = useUnits();
  const latest = importStatus?.latestJob;
  const visitCount = (sources ?? []).reduce((sum, s) => sum + (s.visitCount || 0), 0);
  const plan = entitlements?.entitled
    ? entitlements.status || "entitled"
    : (entitlements?.status ?? "none");
  let lastImport = "None";
  if (latest?.status === "ready") {
    lastImport = `${latest.visitCount ?? 0} visits`;
  } else if (latest?.status === "pending" || latest?.status === "processing") {
    lastImport = "In progress";
  } else if (latest?.status === "error") {
    lastImport = "Failed";
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">{name || "Account"}</CardTitle>
          <p className="mt-1 truncate text-sm text-text-muted">{email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge title={emailVerified ? "Email is verified" : "Email is not verified"}>
              {emailVerified ? "Email verified" : "Email not verified"}
            </Badge>
            <Badge title={`Plan status: ${plan}`}>{plan}</Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          title="Edit account name, email, and password"
          onClick={() => onSelect("account")}
        >
          <User size={16} />
          Edit account
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Plan" value={plan} />
        <StatCard label="Sources" value={(sources?.length ?? 0).toLocaleString()} />
        <StatCard label="Visits" value={visitCount.toLocaleString()} />
        <StatCard label="Last import" value={lastImport} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          type="button"
          variant="outline"
          title="Open Timeline import"
          className="h-auto min-h-11 flex-col items-start gap-1 px-4 py-4 text-left"
          onClick={() => onSelect("data")}
        >
          <Upload size={16} className="text-accent" />
          <span className="text-sm font-medium text-text">Import Timeline</span>
          <span className="text-xs font-normal text-text-muted">JSON or Takeout zip</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          title="Open billing"
          className="h-auto min-h-11 flex-col items-start gap-1 px-4 py-4 text-left"
          onClick={() => onSelect("billing")}
        >
          <CreditCard size={16} className="text-accent" />
          <span className="text-sm font-medium text-text">Billing</span>
          <span className="text-xs font-normal text-text-muted">Plan, invoices, pause</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          title="Open privacy and danger zone"
          className="h-auto min-h-11 flex-col items-start gap-1 px-4 py-4 text-left"
          onClick={() => onSelect("privacy")}
        >
          <Lock size={16} className="text-accent" />
          <span className="text-sm font-medium text-text">Privacy</span>
          <span className="text-xs font-normal text-text-muted">Export or delete</span>
        </Button>
      </div>
    </div>
  );
}
