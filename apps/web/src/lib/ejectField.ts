export function isControlFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number" && Number.isFinite(value)) return true;
  return String(value).trim().length > 0;
}

const TEXT_TYPES = new Set([
  "text",
  "email",
  "password",
  "search",
  "url",
  "tel",
  "number",
]);

export function usesSpacePlaceholder(type: unknown, isSelect: boolean): boolean {
  if (isSelect) return false;
  if (type == null || type === "") return true;
  return typeof type === "string" && TEXT_TYPES.has(type);
}
