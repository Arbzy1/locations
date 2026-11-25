import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { LegalFooter } from "../legal/LegalFooter";
import { usePublicConfig } from "../../hooks/useApi";
import { useUnits } from "../../lib/units";
import { formatDate } from "../../utils/format";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";

type Props = {
  onError: (msg: string) => void;
};

/** Stripe subscription status in plain words. */
// eslint-disable-next-line react-refresh/only-export-components
export function planStatusCopy(status: string, entitled: boolean): string {
  switch (status) {
    case "active":
      return "Your plan is active.";
    case "trialing":
      return "You are on a free trial.";
    case "past_due":
    case "unpaid":
      return "Your last payment did not go through.";
    case "paused":
      return "Your plan is paused.";
    case "canceled":
      return "Your plan has ended.";
    default:
      return entitled ? "You can import without a plan on this account." : "You do not have a plan yet.";
  }
}

export default function SettingsBilling({ onError }: Props) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: config } = usePublicConfig();
  const { entitlements, timezone } = useUnits();
  const [busy, setBusy] = useState<"monthly" | "yearly" | "portal" | null>(null);
  const [returnNotice, setReturnNotice] = useState<{ kind: "success" | "cancel"; text: string } | null>(null);
  const [seenBillingParam, setSeenBillingParam] = useState<string | null>(null);

  const billingConfigured = Boolean(config?.billingConfigured);
  const status = entitlements?.status ?? "none";
  const isSubscribed = status === "active" || status === "trialing";
  const graceUntil = entitlements?.graceUntil;
  const computedGrace =
    Boolean(graceUntil) &&
    new Date(graceUntil as string) > new Date() &&
    !isSubscribed;
  const readOnlyGrace =
    Boolean((entitlements as { readOnlyGrace?: boolean } | undefined)?.readOnlyGrace) || computedGrace;
  const graceUntilLabel = graceUntil ? formatDate(graceUntil, timezone) : "";

  const billingParam = searchParams.get("billing");
  if ((billingParam === "success" || billingParam === "cancel") && seenBillingParam !== billingParam) {
    setSeenBillingParam(billingParam);
    setReturnNotice(
      billingParam === "success"
        ? {
            kind: "success",
            text: "Subscription confirmed. Your billing status has been refreshed.",
          }
        : {
            kind: "cancel",
            text: "Checkout cancelled. No charge was made.",
          },
    );
  } else if (!billingParam && seenBillingParam !== null) {
    setSeenBillingParam(null);
  }

  useEffect(() => {
    const param = searchParams.get("billing");
    if (param !== "success" && param !== "cancel") return;
    if (param === "success") {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("billing");
    next.set("section", "billing");
    setSearchParams(next, { replace: true });
  }, [queryClient, searchParams, setSearchParams]);

  const startCheckout = async (interval: "monthly" | "yearly") => {
    onError("");
    setBusy(interval);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        onError(body.error || "Billing is not available");
        setBusy(null);
        return;
      }
      window.location.assign(body.url);
    } catch {
      onError("Unable to start checkout right now.");
      setBusy(null);
    }
  };

  const openPortal = async () => {
    onError("");
    setBusy("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        onError(body.error || "No billing account");
        setBusy(null);
        return;
      }
      window.location.assign(body.url);
    } catch {
      onError("Unable to open the billing portal right now.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {returnNotice && (
        <div
          role="status"
          className={
            returnNotice.kind === "success"
              ? "rounded-xl border border-walk/40 bg-walk/10 px-4 py-3 text-sm text-walk"
              : "rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted"
          }
        >
          {returnNotice.text}
        </div>
      )}

      {!billingConfigured && (
        <Card>
          <CardTitle className="text-base">Billing disabled on this deployment</CardTitle>
          <p className="mt-2 text-sm text-text-muted">
            Stripe billing is not configured here. Timeline imports and exports do not require a
            paid subscription on this site.
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Plan</CardTitle>
          <p className="mt-2 text-sm text-text">
            {planStatusCopy(status, Boolean(entitlements?.entitled))}
          </p>
          {readOnlyGrace && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Read-only grace active: your last payment failed and new Timeline imports are paused.
              Your existing maps and history remain readable
              {graceUntilLabel ? ` until ${graceUntilLabel}` : ""}. Update your payment method in
              Manage billing to resume imports.
            </div>
          )}
          <p className="mt-3 text-sm text-text-muted">
            Receipts, card details, pausing, and cancelling are all in Manage billing. If you
            cancel, you keep access until the end of the period you paid for.
          </p>
        </Card>

        <Card>
          <CardTitle className="text-base">Actions</CardTitle>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            {billingConfigured
              ? "Checkout and the customer portal open Stripe in this window."
              : "Paid checkout is turned off for this environment."}
          </p>
          <p className="mb-3 text-sm text-text-muted">
            Plans renew automatically monthly or yearly until cancelled. Stripe shows the total,
            currency, and taxes before payment. UK/EU consumers may cancel within 14 days where
            applicable; starting access does not waive this right. Cancel renewal in Manage billing.
            Read the Terms for refunds and the support cancellation route.
          </p>
          <LegalFooter />
          {billingConfigured && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!isSubscribed && (
                <>
                  <Button
                    type="button"
                    title="Subscribe monthly"
                    disabled={busy !== null}
                    onClick={() => void startCheckout("monthly")}
                  >
                    {busy === "monthly" ? <Loader2 size={16} className="animate-spin" /> : null}
                    {busy === "monthly" ? "Opening checkout…" : "Subscribe monthly"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    title="Subscribe yearly"
                    disabled={busy !== null}
                    onClick={() => void startCheckout("yearly")}
                  >
                    {busy === "yearly" ? <Loader2 size={16} className="animate-spin" /> : null}
                    {busy === "yearly" ? "Opening checkout…" : "Subscribe yearly"}
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                title="Open Stripe portal for invoices, pause, and cancel"
                disabled={busy !== null}
                onClick={() => void openPortal()}
              >
                {busy === "portal" ? <Loader2 size={16} className="animate-spin" /> : null}
                {busy === "portal" ? "Opening portal…" : "Manage billing"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
