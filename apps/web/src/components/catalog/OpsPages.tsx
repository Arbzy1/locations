import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { Button } from '../ui/button';
import { useCachedAnalytics, useImportJobs, useImportStatus } from '../../hooks/useApi';
import { TIMEZONE_SKEW_COPY } from '../explorer/ImportDropZone';
import ChangelogList from '../marketing/ChangelogList';
import GetStarted from '../shell/GetStarted';

/** `/onboarding` is the same first-run screen new accounts land on. */
export function OnboardingPage() {
  return <GetStarted />;
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
