import { CHANGELOG_ENTRIES } from '../../lib/marketing/changelog';

export default function ChangelogList() {
  return (
    <ol className="space-y-4">
      {CHANGELOG_ENTRIES.map((entry) => (
        <li key={entry.version} className="rounded-xl border border-border bg-surface p-4">
          <h2 className="font-display text-base font-semibold text-text">{entry.version}</h2>
          <p className="mt-2 text-sm text-text-muted">{entry.summary}</p>
        </li>
      ))}
    </ol>
  );
}
