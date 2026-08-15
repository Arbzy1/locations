import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { Button } from '../ui/button';
import { useAdminStats, useCachedAnalytics, useImportJobs, useImportStatus } from '../../hooks/useApi';
import { TIMEZONE_SKEW_COPY } from '../ImportDropZone';
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

export function AdminPage() {
  const { data, isError } = useAdminStats();
  if (isError) {
    return (
      <CatalogPage title="Staff console">
        <p className="text-sm text-text-muted">Not found.</p>
      </CatalogPage>
    );
  }
  const stuck = data?.stuckJobs ?? [];
  const recent = data?.recentJobs ?? [];
  return (
    <CatalogPage
      title="Staff console"
      description="Your tenant only. Other accounts stay behind row-level security. No coordinates or place names."
    >
      <ul className="space-y-2 text-sm">
        <li>Visits: {data?.visitCount ?? 0}</li>
        <li>Sources: {data?.sourceCount ?? 0}</li>
        <li>Latest job: {data?.latestJobStatus ?? 'none'}</li>
        <li>Recent jobs listed: {data?.recentJobCount ?? 0}</li>
        <li>Stuck imports (pending or processing over 15 minutes): {data?.stuckJobCount ?? 0}</li>
      </ul>
      {stuck.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text">Stuck jobs</h3>
          <ul className="space-y-2 text-sm">
            {stuck.map((j) => (
              <li key={j.id} className="rounded-lg border border-border bg-bg px-3 py-2">
                <div className="font-mono text-xs">{j.id}</div>
                <div className="text-text-muted">
                  {j.status} · {j.ageMinutes} min · {j.parsedCount} parsed · {j.visitCount} visits
                </div>
                {j.error && <div className="text-train">{j.error}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text">Recent jobs</h3>
          <ul className="space-y-2 text-sm">
            {recent.map((j) => (
              <li key={j.id} className="rounded-lg border border-border bg-bg px-3 py-2">
                <div className="font-mono text-xs">{j.id}</div>
                <div className="text-text-muted">
                  {j.status} · {j.ageMinutes} min · {j.parsedCount} parsed · {j.visitCount} visits
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text-muted">
        <h3 className="font-semibold text-text">Wipe this tenant</h3>
        <p className="mt-2">
          Staff still use their own tenant. To wipe: Settings, Danger zone, Delete account. That removes
          Neon rows, the R2 prefix, sessions, and the Stripe customer. Coordinates are never written to
          logs or email. Check Worker logs by job id only. Do not paste Timeline JSON.
        </p>
        <Button asChild className="mt-3" variant="outline" title="Open Settings danger zone">
          <Link to="/settings">Open Settings</Link>
        </Button>
      </div>
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
