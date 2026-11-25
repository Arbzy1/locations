export type ChangelogEntry = {
  version: string;
  summary: string;
};

/** Curated product notes, ordered newest-first. Do not fetch docs/ from the Worker. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.4.0 (November 2026)',
    summary:
      'Journey Cost (/journey-cost) joins the explorer as the sixth primary tab alongside Map, Days, Trips, Places, and Insights: price UK trips for petrol, diesel, hybrid, or EV charging, compare live forecourts, check Clean Air Zones, ULEZ, and road tolls, and track HMRC business mileage.',
  },
  {
    version: '1.3.0 (October 2026)',
    summary:
      'Unified six-tab navigation with Heat and Lines modes on the Map tab. Places are real named locations you can rename, favourite, or hide. Day View opens faster with clear error states, and imports handle nested stays, raw GPS, older Takeout archives, and timezones accurately.',
  },
  {
    version: '1.2.5 (September 2026)',
    summary:
      'Routes view and GPS comparison: see every journey for a day, month, or year on one map coloured by transport mode, following recorded GPS traces where available and comparing them against predicted road routes.',
  },
  {
    version: '1.2.0 (August 2026)',
    summary:
      'Import preview and staging verification: drag and drop Timeline exports, preview overlapping days before committing, skip days already stored, colour-code multiple accounts, delete date ranges, and spot timezone shifts.',
  },
  {
    version: '1.1.0 (July 2026)',
    summary:
      'Self-serve sign-up, paid plans via Stripe, strict Postgres Row Level Security per account, Takeout zip uploads, GDPR archive downloads, and full account deletion.',
  },
  {
    version: '1.0.0 (June 2026)',
    summary:
      'Colour moods in Settings: 30 named palettes, each crafted with matching light and dark themes.',
  },
];
