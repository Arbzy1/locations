import { useUnits } from "../../lib/units";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";

type Props = {
  onError: (msg: string) => void;
};

export default function SettingsBilling({ onError }: Props) {
  const { entitlements } = useUnits();
  const status = entitlements?.status ?? "none";
  const graceUntil = entitlements?.graceUntil;
  const graceActive =
    Boolean(graceUntil) &&
    new Date(graceUntil as string) > new Date() &&
    status !== "active" &&
    status !== "trialing";
  const graceUntilLabel = graceUntil
    ? new Date(graceUntil).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  const startCheckout = async (interval: "monthly" | "yearly") => {
    onError("");
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      onError(body.error || "Billing is not available");
      return;
    }
    window.location.assign(body.url);
  };

  const openPortal = async () => {
    onError("");
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) {
      onError(body.error || "No billing account");
      return;
    }
    window.location.assign(body.url);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle className="text-base">Plan</CardTitle>
        <p className="mt-2 text-sm text-text">
          Status: {status}
          {entitlements?.entitled ? " (entitled)" : ""}
        </p>
        {graceActive && (
          <p className="mt-2 text-sm text-text">
            Payment failed. Import is paused. You still have read-only access until {graceUntilLabel}.
          </p>
        )}
        <p className="mt-3 text-sm text-text-muted">
          Invoices, payment method, pause, and cancel are in Manage billing. Pause keeps the
          subscription (access follows Stripe pause rules). Cancel ends access at period end.
        </p>
      </Card>
      <Card>
        <CardTitle className="text-base">Actions</CardTitle>
        <p className="mt-1 mb-4 text-sm text-text-muted">Checkout opens Stripe in this window.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" title="Subscribe monthly" onClick={() => void startCheckout("monthly")}>
            Subscribe monthly
          </Button>
          <Button
            type="button"
            variant="outline"
            title="Subscribe yearly"
            onClick={() => void startCheckout("yearly")}
          >
            Subscribe yearly
          </Button>
          <Button
            type="button"
            variant="outline"
            title="Open Stripe portal for invoices, pause, and cancel"
            onClick={() => void openPortal()}
          >
            Manage billing
          </Button>
        </div>
      </Card>
    </div>
  );
}
