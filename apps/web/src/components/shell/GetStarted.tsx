import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, CreditCard, Mail, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { authClient, useSession } from '../../lib/auth';
import { useImportStatus, usePublicConfig } from '../../hooks/useApi';
import { useUnits } from '../../lib/units';
import ImportDropZone from '../explorer/ImportDropZone';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { EjectField } from '../ui/eject-field';

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      {done ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-walk" aria-label="Done" />
      ) : (
        <Circle size={18} className="mt-0.5 shrink-0 text-text-muted" aria-label="To do" />
      )}
      <span className={done ? 'text-text-muted' : 'text-text'}>{children}</span>
    </li>
  );
}

/** The one first-run screen: what to export from Google, and where to drop it. */
export default function GetStarted({ isDemo = false }: { isDemo?: boolean }) {
  const { data: session, refetch: refetchSession } = useSession();
  const { data: publicConfig } = usePublicConfig();
  const { entitlements } = useUnits();
  const user = session?.user as { email?: string; emailVerified?: boolean; role?: string } | undefined;
  const effectiveIsDemo = isDemo || user?.role === 'demo';
  const email = user?.email ?? '';
  const verified = Boolean(user?.emailVerified);
  const { data: importStatus } = useImportStatus();
  const hasData = (importStatus?.visitCount ?? 0) > 0;

  const billingRequired = Boolean(publicConfig?.billingConfigured) && !effectiveIsDemo;
  const readOnlyGrace = Boolean(
    (entitlements as { readOnlyGrace?: boolean } | undefined)?.readOnlyGrace,
  );
  const planReady = !billingRequired || (Boolean(entitlements?.entitled) && !readOnlyGrace);

  const [importError, setImportError] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpStatus, setOtpStatus] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const verifyOtp = async () => {
    if (!email || otp.trim().length < 6) return;
    setOtpError('');
    setOtpStatus('');
    setVerifying(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({
        email,
        otp: otp.trim(),
      });
      if (result.error) {
        setOtpError(result.error.message || 'Invalid verification code.');
        return;
      }
      setOtp('');
      toast.success('Email verified. You can import your Timeline now.');
      await refetchSession();
    } catch {
      setOtpError('Unable to verify code right now.');
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    if (!email) return;
    setOtpError('');
    setOtpStatus('');
    setResending(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'email-verification',
      });
      if (result.error) {
        setOtpError(result.error.message || 'Could not send a new verification code.');
        return;
      }
      setOtpStatus('Sent a new 6-digit verification code to your email.');
      setCooldown(30);
    } catch {
      setOtpError('Unable to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center overflow-y-auto bg-bg px-4 py-8">
      <div className="w-full max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-accent/15 p-3 text-accent">
            <Upload size={22} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Bring in your Google Timeline</h2>
            <p className="text-sm text-text-muted">Your past locations only. Nothing here tracks you live.</p>
          </div>
        </div>

        <ol className="space-y-3 text-sm">
          <Step done={verified || effectiveIsDemo}>
            Confirm your email address (check your inbox for the link or 6-digit code).
          </Step>
          {billingRequired && (
            <Step done={planReady}>
              {readOnlyGrace
                ? 'Update your billing method in Settings so imports resume.'
                : 'Start a monthly or yearly plan in Settings to unlock Timeline imports.'}
            </Step>
          )}
          <Step done={hasData}>
            On your phone, open Google Maps, tap your picture, then <strong>Your Timeline</strong>, the{' '}
            <strong>⋮</strong> menu, <strong>Location and privacy settings</strong>,{' '}
            <strong>Export Timeline data</strong>. Older exports from Google Takeout (a .zip) work too.
          </Step>
          <Step done={hasData}>Drop the file below. Big histories take a minute or two.</Step>
        </ol>

        {!verified && !effectiveIsDemo && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Mail size={16} className="text-accent" />
              <span>Verify your email</span>
            </div>
            <p className="text-xs text-text-muted">
              Enter the 6-digit verification code sent to {email || 'your email'}, or send a fresh code.
            </p>
            <EjectField label="Verification code" htmlFor="onboarding-otp">
              <Input
                id="onboarding-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                title="Six-digit email verification code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </EjectField>
            {otpError ? <p className="text-xs text-destructive">{otpError}</p> : null}
            {otpStatus ? <p className="text-xs text-walk">{otpStatus}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                title="Verify email with the six-digit code"
                disabled={verifying || otp.trim().length < 6}
                onClick={() => void verifyOtp()}
              >
                {verifying ? 'Verifying…' : 'Verify code'}
              </Button>
              <Button
                type="button"
                variant="outline"
                title="Send another six-digit verification code"
                disabled={resending || verifying || cooldown > 0 || !email}
                onClick={() => void resendOtp()}
              >
                {resending
                  ? 'Sending…'
                  : cooldown > 0
                    ? `Send code again (${cooldown}s)`
                    : 'Send code again'}
              </Button>
            </div>
          </div>
        )}

        {billingRequired && !planReady && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <CreditCard size={16} className="text-accent" />
              <span>{readOnlyGrace ? 'Import paused during payment grace' : 'Subscription required for import'}</span>
            </div>
            <p className="text-xs text-text-muted">
              {readOnlyGrace
                ? 'Your existing map stays readable during the grace period, while new Timeline imports pause until payment succeeds.'
                : 'Choose a monthly or yearly plan in Billing Settings to import your Google Timeline.'}
            </p>
            <Button asChild title="Open Billing Settings to subscribe">
              <Link to="/settings?section=billing">
                {readOnlyGrace ? 'Manage billing in Settings' : 'Subscribe in Billing Settings'}
              </Link>
            </Button>
          </div>
        )}

        {importError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{importError}</span>
          </div>
        ) : null}

        <ImportDropZone
          disabled={effectiveIsDemo}
          disabledReason={
            effectiveIsDemo
              ? 'The demo account cannot import. Sign up to bring in your own Timeline.'
              : undefined
          }
          onError={(msg) => {
            setImportError(msg);
          }}
        />

        {hasData && (
          <Button asChild title="Open your map" className="w-full">
            <Link to="/hotspots">Open your map</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
