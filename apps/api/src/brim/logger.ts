
const VRM = /\b[A-Z]{2}[0-9]{2}\s?[A-Z]{3}\b/i;
const VRM_KEYS = new Set(["vrm", "reg", "registration", "plate", "registrationnumber", "registration_number"]);
const ADDRESS_KEYS = new Set(["address", "formattedaddress", "formatted_address"]);

export function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(VRM, "[REDACTED_VRM]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase();
      if (VRM_KEYS.has(key)) out[k] = "[REDACTED_VRM]";
      else if (ADDRESS_KEYS.has(key)) out[k] = "[REDACTED]";
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
}

export function createLogger(write: (line: string) => void = (l) => {
  console.log(l);
}) {
  return {
    info(payload: unknown) {
      write(JSON.stringify({ level: "info", ...((redact(payload) as object) ?? {}) }));
    },
  };
}
