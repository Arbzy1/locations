export type ChangelogEntry = {
  version: string;
  summary: string;
};

/** Curated product notes. Do not fetch docs/ from the Worker. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "Unreleased",
    summary:
      "A simpler layout: five tabs (Map, Days, Trips, Places, Insights), with Heat and Lines on the Map tab. Places are now real places you can rename. Days open faster and say so when something goes wrong. Imports handle nested stays, raw GPS, older Takeout files and your timezone more accurately.",
  },
  {
    version: "Routes and GPS",
    summary:
      "See every journey for a day, month or year on one map, coloured by how you travelled. Journeys follow your recorded GPS where Google kept it, and you can compare them with the predicted road route.",
  },
  {
    version: "0.0.1",
    summary: "Colour moods in Settings: 30 named palettes, each with a light and dark version.",
  },
  {
    version: "Import quality",
    summary:
      "Drag and drop your export, see a preview before importing, skip days you already have, colour each export, delete a date range, and get a warning when the times look shifted by a timezone.",
  },
  {
    version: "1.2.0",
    summary: "A separate test site, so changes are tried out before they reach you.",
  },
  {
    version: "1.1.0",
    summary:
      "Open sign-up, paid plans, strict separation of every account's data, zip uploads, a fresh look, and full account export and delete.",
  },
];
