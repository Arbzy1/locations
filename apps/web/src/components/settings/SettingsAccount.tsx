import { useEffect, useState } from "react";
import { authClient, useSession } from "../../lib/auth";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import PasswordInput from "../auth/PasswordInput";
import SettingsSessions from "./SettingsSessions";

type Props = {
  currentToken?: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

export default function SettingsAccount({ currentToken, onMessage, onError }: Props) {
  const { data: session, refetch: refetchSession } = useSession();
  const user = session?.user as { email?: string; name?: string; emailVerified?: boolean } | undefined;
  const [displayName, setDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.name) setDisplayName(user.name);
  }, [user?.name]);

  const changeDisplayName = async () => {
    onMessage("");
    onError("");
    const next = displayName.trim();
    if (!next) {
      onError("Enter a display name");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.updateUser({ name: next });
      if (result.error) {
        onError(result.error.message || "Could not update name");
        return;
      }
      await refetchSession();
      onMessage("Display name updated.");
    } catch {
      onError("Unable to update display name.");
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = async () => {
    onMessage("");
    onError("");
    if (!newEmail.trim()) {
      onError("Enter a new email");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.changeEmail({ newEmail: newEmail.trim() });
      if (result.error) {
        onError(result.error.message || "Could not change email");
        return;
      }
      onMessage(
        "Check your current inbox to confirm, then the new inbox. Other sessions were signed out.",
      );
    } catch {
      onError("Unable to change email.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    onMessage("");
    onError("");
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        onError(result.error.message || "Could not change password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      onMessage("Password updated. Other sessions were signed out.");
    } catch {
      onError("Unable to change password.");
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    onMessage("");
    onError("");
    if (!user?.email) return;
    setBusy(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: `${window.location.origin}/settings`,
      });
      if (result.error) {
        onError(result.error.message || "Could not resend verification");
        return;
      }
      onMessage("Verification email sent.");
    } catch {
      onError("Unable to resend verification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Display name</CardTitle>
          <p className="mt-1 mb-4 text-sm text-text-muted">Shown in the app chrome for this account.</p>
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            title="Your display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mb-3"
          />
          <Button
            type="button"
            variant="outline"
            title="Save display name"
            disabled={busy}
            onClick={() => void changeDisplayName()}
          >
            Save name
          </Button>
        </Card>

        <Card>
          <CardTitle className="text-base">Email</CardTitle>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            {user?.emailVerified
              ? "Verified. Changing email requires confirmation on both inboxes."
              : "Not verified. Verify before importing Timeline data."}
          </p>
          <Label htmlFor="new-email">New email</Label>
          <Input
            id="new-email"
            type="email"
            title="New account email (requires re-verification)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="mb-3"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              title="Send confirmation to the new email"
              disabled={busy}
              onClick={() => void changeEmail()}
            >
              Update email
            </Button>
            {!user?.emailVerified && (
              <Button
                type="button"
                variant="outline"
                title="Resend email verification link and code"
                disabled={busy}
                onClick={() => void resendVerification()}
              >
                Resend verification
              </Button>
            )}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <CardTitle className="text-base">Password</CardTitle>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Changing password signs out other sessions.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="current-password">Current password</Label>
              <PasswordInput
                id="current-password"
                autoComplete="current-password"
                title="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                wrapperClassName="mb-0"
              />
            </div>
            <div>
              <Label htmlFor="settings-new-password">New password</Label>
              <PasswordInput
                id="settings-new-password"
                autoComplete="new-password"
                title="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                wrapperClassName="mb-0"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            title="Change password and sign out other sessions"
            disabled={busy || !currentPassword || !newPassword}
            onClick={() => void changePassword()}
          >
            Change password
          </Button>
        </Card>
      </div>

      <SettingsSessions currentToken={currentToken} onMessage={onMessage} onError={onError} />
    </div>
  );
}
