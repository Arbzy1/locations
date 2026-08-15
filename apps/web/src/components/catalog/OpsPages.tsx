import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { Button } from '../ui/button';
import { useCachedAnalytics, useImportJobs, useImportStatus } from '../../hooks/useApi';
import { TIMEZONE_SKEW_COPY } from '../explorer/ImportDropZone';
import { useSession } from '../../lib/auth';
import ChangelogList from '../marketing/ChangelogList';

export function OnboardingPage() {
  const { data: session } = useSession();
  const verified = Boolean((session?.user as { emailVerified?: boolean } | undefined)?.emailVerified);
  const { data: importStatus } = useImportStatus();
  const hasData = (importStatus?.visitCount ?? 0) > 0;
  return (
    <CatalogPage title="Get started" description="Verify email, export Takeout, then import. No live tracking.">
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          {verified ? 'Email is verified.' : 'Verify your email from the link or 6-digit code, then return here.'}
        </li>
        <li>
          On your phone, export Google Timeline / Takeout (JSON or a zip with Timeline.json).
        </li>
        <li>
          <Button variant="outline" asChild title="Open Settings to import">
            <Link to="/settings">Upload in Settings</Link>
          </Button>
        </li>
        <li>{hasData ? 'Import is in. Open Hotspots.' : 'Wait for import status (counts only).'}</li>
      </ol>
      {hasData && (
        <Button asChild title="Open Hotspots">
          <Link to="/hotspots">Open Hotspots</Link>
        </Button>
      )}
    </CatalogPage>
  );
}

export function ImportsPage() {
  const { data: jobs = [] } = useImportJobs();
  return (
    <CatalogPage title="Import history" description="Counts only. Object storage keys are not shown.">
      <ul className="space-y-2 text-sm">
        {jobs.map((j) => (
          <li key={j.id} className="rounded-lg border border-border bg-bg px-3 py-2">
            <div className="font-medium">{j.status}</div>
            <div className="text-text-muted">
              {j.parsedCount ?? 0} parsed · {j.visitCount ?? 0} visits · {j.activityCount ?? 0} journeys
              {j.chosenFile ? ` · ${j.chosenFile}` : ''}
            </div>
            {j.error && <div className="text-train">{j.error}</div>}
          </li>
        ))}
        {jobs.length === 0 && <p className="text-text-muted">No import jobs yet.</p>}
      </ul>
      <Button variant="outline" asChild title="Open Settings to import again">
        <Link to="/settings">Import again from Settings</Link>
      </Button>
    </CatalogPage>
  );
}

export function HealthPage() {
  const { data } = useCachedAnalytics<{
    duplicateVisits: number;
    overlappingActivities: number;
    unknownModes: number;
    midnightCrossings: number;
  }>('data-health');
  const { data: importStatus } = useImportStatus();
  const stats = data && !Array.isArray(data) ? data : null;
  const midnightHigh = (stats?.midnightCrossings ?? 0) >= 20;
  const tzWarn = Boolean(importStatus?.timezoneWarning?.warn) || midnightHigh;
  return (
    <CatalogPage title="Data health" description="Import quality checks. Dates and counts only, no coordinates.">
      {stats ? (
        <ul className="space-y-2 text-sm">
          <li>Duplicate visits: {stats.duplicateVisits}</li>
          <li>Overlapping journeys: {stats.overlappingActivities}</li>
          <li>Unknown modes: {stats.unknownModes}</li>
          <li>Stays that crossed midnight: {stats.midnightCrossings}</li>
        </ul>
      ) : (
        <p className="text-sm text-text-muted">Health stats appear after the next Timeline import.</p>
      )}
      {tzWarn && (
        <p className="mt-4 rounded-lg border border-border bg-bg/60 px-3 py-2 text-sm text-text-muted">
          {TIMEZONE_SKEW_COPY}
        </p>
      )}
    </CatalogPage>
  );
}

export function UpdatesPage() {
  return (
    <CatalogPage title="Changelog" description="Product notes. The public page at /changelog is the same copy.">
      <ChangelogList />
    </CatalogPage>
  );
}
