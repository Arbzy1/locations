import { useCallback, useEffect, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { authClient } from "../../lib/auth";
import {
  formatSessionTime,
  listDeviceSessions,
  revokeDeviceSession,
  revokeOtherDeviceSessions,
  summarizeUserAgent,
  type DeviceSession,
} from "../../lib/sessions";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";

type Props = {
  currentToken?: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

export default function SettingsSessions({ currentToken, onMessage, onError }: Props) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await listDeviceSessions();
    if (result.error) {
      onError(result.error);
      return;
    }
    setSessions(result.sessions);
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listDeviceSessions().then((result) => {
      if (cancelled) return;
      if (result.error) onError(result.error);
      else setSessions(result.sessions);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const onRevoke = async (row: DeviceSession) => {
    const isCurrent = Boolean(currentToken && row.token === currentToken);
    setBusyId(row.id);
    const result = await revokeDeviceSession(row.token);
    setBusyId(null);
    if (result.error) {
      onError(result.error);
      return;
    }
    if (isCurrent) {
      await authClient.signOut();
      window.location.assign("/");
      return;
    }
    onMessage("Session signed out.");
    await reload();
  };

  const onRevokeOthers = async () => {
    setBusyId("others");
    const result = await revokeOtherDeviceSessions();
    setBusyId(null);
    if (result.error) {
      onError(result.error);
      return;
    }
    onMessage("Other sessions were signed out.");
    await reload();
  };

  const others = sessions.filter((s) => s.token !== currentToken);

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Monitor size={16} className="text-text-muted" />
        <CardTitle className="text-base">Sign-in and devices</CardTitle>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        Each row is a signed-in browser. Revoke a session you do not recognise.
      </p>
      {loading ? (
        <div className="flex justify-center py-6 text-text-muted">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-text-muted">No sessions found.</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((row) => {
            const current = Boolean(currentToken && row.token === currentToken);
            const label = summarizeUserAgent(row.userAgent);
            const Icon = /iOS|Android/i.test(label) ? Smartphone : Monitor;
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-bg/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon size={14} className="text-text-muted" />
                    <span className="text-sm font-medium text-text" title={row.userAgent || "Unknown user agent"}>
                      {label}
                    </span>
                    {current && <Badge title="This is the browser you are using">This device</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-text-muted">
                    {row.ipAddress ? row.ipAddress : "IP unknown"}
                    {" · "}
                    Signed in {formatSessionTime(row.createdAt)}
                    {" · "}
                    Expires {formatSessionTime(row.expiresAt)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant={current ? "outline" : "ghost"}
                  size="sm"
                  title={current ? "Sign out this device" : "Revoke this session"}
                  disabled={busyId === row.id}
                  onClick={() => void onRevoke(row)}
                >
                  {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : null}
                  {current ? "Sign out" : "Revoke"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          title="Sign out every session except this browser"
          disabled={busyId === "others"}
          onClick={() => void onRevokeOthers()}
        >
          {busyId === "others" ? <Loader2 size={14} className="animate-spin" /> : null}
          Revoke other sessions
        </Button>
      )}
    </Card>
  );
}
