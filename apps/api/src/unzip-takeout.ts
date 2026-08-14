const MAX_ZIP_ENTRIES = 200;
const MAX_UNCOMPRESSED = 120 * 1024 * 1024;

export function isZipMagic(bytes: ArrayBuffer): boolean {
  const u = new Uint8Array(bytes);
  return u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b && (u[2] === 0x03 || u[2] === 0x05 || u[2] === 0x07);
}

/**
 * Extract the best Timeline JSON from a Takeout zip. Rejects nested zips and bombs.
 */
export async function extractTimelineJsonFromZip(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const { unzipSync } = await import("fflate");
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(raw, {
      filter: (file) => {
        if (file.originalSize > MAX_UNCOMPRESSED) return false;
        const name = file.name.toLowerCase();
        if (name.endsWith(".zip") || name.endsWith(".gz")) return false;
        return name.endsWith(".json");
      },
    });
  } catch {
    throw new Error("Could not read zip. Export Timeline JSON or a simple Takeout zip.");
  }

  const names = Object.keys(files);
  if (names.length === 0) {
    throw new Error("Zip has no JSON files. Include Timeline.json or Records.json.");
  }
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new Error("Zip has too many JSON files.");
  }

  let uncompressed = 0;
  for (const n of names) uncompressed += files[n].length;
  if (uncompressed > MAX_UNCOMPRESSED) {
    throw new Error("Uncompressed zip is too large.");
  }

  const preferred = names.find((n) => /timeline\.json$/i.test(n))
    ?? names.find((n) => /semantic/i.test(n))
    ?? names.find((n) => /records\.json$/i.test(n))
    ?? names.find((n) => /edits/i.test(n))
    ?? names[0];

  return new TextDecoder().decode(files[preferred]);
}
