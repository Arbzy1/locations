export type ChangelogEntry = {
  version: string;
  summary: string;
};

/** Curated product notes. Do not fetch docs/ from the Worker. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
    {
    version: "Unreleased",
    summary: "Changes since the last tagged release.",
  },
  {
    version: "0.0.1",
    summary: "Colour moods in Settings, Display: 30 named palettes (light and dark each) on top of the existing theme toggle. Stored in `locations-mood`. Map tiles still follow light and dark.",
  },
  {
    version: "Import quality",
    summary:
      "Drag-drop empty state and Settings drop zone, zip extract that reports which Timeline file won, import preview plus skip-overlapping-days merge, source colours, date-range delete, capped route rewarm, and a timezone-skew warning.",
  },
  {
    version: "1.2.0",
    summary:
      "Named Wrangler environments: staging on push to main, production as a manual promote. Isolated R2, import queues, Neon, and Stripe per env.",
  },
  {
    version: "1.1.0",
    summary:
      "Hosted SaaS foundation: public signup (kill switch DISABLE_SIGNUP), Stripe billing, FORCE RLS, import queue plus zip, shadcn and Motion UI, docs tree, CI, account export and delete.",
  },
];
