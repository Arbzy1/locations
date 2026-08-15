export type ChangelogEntry = {
  version: string;
  summary: string;
};

/** Curated product notes. Do not fetch docs/ from the Worker. */
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "Unreleased",
    summary:
      "Public landing, pricing, status, and changelog pages. Scripted demo tour. Staff stuck-import list and tenant-wipe runbook. Env feature flags. Activity guesses from dwell, hour, and place type (not an LLM). Coverage percent and visit badges.",
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
