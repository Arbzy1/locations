import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearchParams } from "react-router-dom";
import { Settings } from "lucide-react";
import { useSession } from "../lib/auth";
import { useUnits } from "../lib/units";
import { enterMotion } from "../lib/motion";
import { useBreakpoint } from "../hooks/useBreakpoint";
import {
  parseSettingsSection,
  settingsSectionSearch,
  type SettingsSection,
} from "../lib/settings-section";
import { Badge } from "./ui/badge";
import SettingsNav from "./SettingsNav";
import SettingsOverview from "./SettingsOverview";
import SettingsAccount from "./SettingsAccount";
import SettingsBilling from "./SettingsBilling";
import SettingsDisplay from "./SettingsDisplay";
import SettingsTimeline from "./SettingsTimeline";
import SettingsPrivacy from "./SettingsPrivacy";

function initials(name?: string, email?: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase() || "?";
}

export default function SettingsView() {
  const { data: session } = useSession();
  const { entitlements } = useUnits();
  const { isDesktop } = useBreakpoint();
  const reduce = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const user = session?.user as
    | { email?: string; name?: string; emailVerified?: boolean; role?: string }
    | undefined;
  const currentToken = (session as { session?: { token?: string } } | null | undefined)?.session
    ?.token;

  const section = useMemo(
    () => parseSettingsSection(searchParams, typeof window === "undefined" ? "" : window.location.hash),
    [searchParams],
  );

  const setSection = useCallback(
    (next: SettingsSection) => {
      setMessage("");
      setError("");
      setSearchParams(settingsSectionSearch(next, searchParams), { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (section !== "data") return;
    if (window.location.hash !== "#timeline-upload") return;
    document.getElementById("timeline-upload")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [section]);

  const status = entitlements?.status ?? "none";
  const graceUntil = entitlements?.graceUntil;
  const graceActive =
    Boolean(graceUntil) &&
    new Date(graceUntil as string) > new Date() &&
    status !== "active" &&
    status !== "trialing";
  const paneMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.08 },
      }
    : enterMotion;

  const flash = {
    onMessage: setMessage,
    onError: setError,
  };

  let pane: ReactNode;
  switch (section) {
    case "account":
      pane = (
        <SettingsAccount
          currentToken={currentToken}
          onMessage={setMessage}
          onError={setError}
        />
      );
      break;
    case "billing":
      pane = <SettingsBilling onError={setError} />;
      break;
    case "display":
      pane = <SettingsDisplay onError={setError} onMessage={setMessage} />;
      break;
    case "data":
      pane = <SettingsTimeline {...flash} />;
      break;
    case "privacy":
      pane = <SettingsPrivacy {...flash} />;
      break;
    default:
      pane = (
        <SettingsOverview
          name={user?.name}
          email={user?.email}
          emailVerified={user?.emailVerified}
          onSelect={setSection}
        />
      );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="shrink-0 border-b border-border bg-bg px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 font-display text-sm font-semibold text-accent">
            {initials(user?.name, user?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Settings size={16} className="text-text-muted" />
              <h1 className="font-display text-lg font-semibold text-text">Settings</h1>
            </div>
            <p className="truncate text-sm text-text-muted">
              {user?.name || "Account"}
              {user?.email ? ` · ${user.email}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge
              title={user?.emailVerified ? "Email is verified" : "Verify email before import"}
            >
              {user?.emailVerified ? "Verified" : "Unverified"}
            </Badge>
            <Badge title={`Billing status: ${status}`}>
              {entitlements?.entitled ? `${status} · entitled` : status}
            </Badge>
            {graceActive && (
              <Badge title="Import is paused during the read-only grace period">Grace</Badge>
            )}
          </div>
        </div>
        {message && <p className="mt-3 text-sm text-walk">{message}</p>}
        {error && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {isDesktop && (
          <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-border p-3">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Workspace
            </p>
            <SettingsNav section={section} onSelect={setSection} orientation="rail" />
          </aside>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!isDesktop && (
            <div className="shrink-0 border-b border-border px-3 py-2">
              <SettingsNav section={section} onSelect={setSection} orientation="chips" />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl p-4 sm:p-6">
              <AnimatePresence mode="wait">
                <motion.div key={section} {...paneMotion}>
                  {pane}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
