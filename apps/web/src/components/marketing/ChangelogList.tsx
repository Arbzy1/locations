import { CHANGELOG_ENTRIES } from '../../lib/marketing/changelog';
import { APP_VERSION_LABEL } from '../../lib/version';

export default function ChangelogList() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">This build is {APP_VERSION_LABEL}.</p>
      <ol className="space-y-4">
        {CHANGELOG_ENTRIES.map((entry) => (
          <li key={entry.version} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="font-display text-base font-semibold text-text">{entry.version}</h2>
            <p className="mt-2 text-sm text-text-muted">{entry.summary}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
