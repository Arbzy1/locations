import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Upload } from 'lucide-react';
import { useSession } from '../../lib/auth';
import { useImportStatus } from '../../hooks/useApi';
import ImportDropZone from '../explorer/ImportDropZone';
import { Button } from '../ui/button';

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
  const { data: session } = useSession();
  const verified = Boolean((session?.user as { emailVerified?: boolean } | undefined)?.emailVerified);
  const { data: importStatus } = useImportStatus();
  const hasData = (importStatus?.visitCount ?? 0) > 0;

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
          <Step done={verified || isDemo}>Confirm your email address (check your inbox for the link or code).</Step>
          <Step done={hasData}>
            On your phone, open Google Maps, tap your picture, then <strong>Your Timeline</strong>, the{' '}
            <strong>⋮</strong> menu, <strong>Location and privacy settings</strong>,{' '}
            <strong>Export Timeline data</strong>. Older exports from Google Takeout (a .zip) work too.
          </Step>
          <Step done={hasData}>Drop the file below. Big histories take a minute or two.</Step>
        </ol>

        <ImportDropZone
          disabled={isDemo}
          disabledReason={isDemo ? 'The demo account cannot import. Sign up to bring in your own Timeline.' : undefined}
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
