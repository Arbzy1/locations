/**
 * Lightweight upload sniffing for Timeline JSON imports.
 * Rejects zip/mbox magic bytes and non-JSON payloads before R2 put.
 */

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04]; // PK..
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const GZIP = [0x1f, 0x8b];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

export type JsonSniffResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Decode UTF-8, ensure payload looks like a JSON array/object, reject archives. */
export function sniffTimelineJson(buffer: ArrayBuffer): JsonSniffResult {
  const bytes = new Uint8Array(buffer);

  if (startsWith(bytes, ZIP_LOCAL) || startsWith(bytes, ZIP_EMPTY)) {
    return { ok: false, error: "Zip archives are not supported. Upload Timeline JSON." };
  }
  if (startsWith(bytes, GZIP)) {
    return { ok: false, error: "Compressed uploads are not supported. Upload Timeline JSON." };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return { ok: false, error: "File is not valid UTF-8 text" };
  }

  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return {
      ok: false,
      error: "File does not look like JSON (expected array or object of Timeline records)",
    };
  }

  try {
    JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON file" };
  }

  return { ok: true, text };
}
