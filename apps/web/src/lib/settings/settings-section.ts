export const SETTINGS_SECTIONS = [
  "overview",
  "account",
  "billing",
  "display",
  "data",
  "privacy",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export function isSettingsSection(value: string | null): value is SettingsSection {
  return Boolean(value && (SETTINGS_SECTIONS as readonly string[]).includes(value));
}

/**
 * Resolve the Settings pane from the URL.
 * Stripe return (`billing=success|cancel`) wins, then `#timeline-upload`, then `section=`.
 */
export function parseSettingsSection(sp: URLSearchParams, hash = ""): SettingsSection {
  const billing = sp.get("billing");
  if (billing === "success" || billing === "cancel") return "billing";
  const id = hash.replace(/^#/, "");
  if (id === "timeline-upload") return "data";
  const section = sp.get("section");
  if (isSettingsSection(section)) return section;
  return "overview";
}

/** Next search string when switching panes. Drops Stripe return flags. */
export function settingsSectionSearch(
  section: SettingsSection,
  current: URLSearchParams | string = "",
): URLSearchParams {
  const sp = new URLSearchParams(typeof current === "string" ? current : current);
  sp.delete("billing");
  if (section === "overview") sp.delete("section");
  else sp.set("section", section);
  return sp;
}
