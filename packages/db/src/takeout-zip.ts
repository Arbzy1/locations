const MAX_ZIP_ENTRIES = 200;
const MAX_UNCOMPRESSED = 120 * 1024 * 1024;

export function isZipMagic(bytes: ArrayBuffer): boolean {
  const u = new Uint8Array(bytes);
  return u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b && (u[2] === 0x03 || u[2] === 0x05 || u[2] === 0x07);
}

export type ZipExtractResult = {
  text: string;
  chosenPath: string;
  candidates: string[];
};

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function listNames(names: string[]): string {
  return names.map(basename).slice(0, 8).join(", ");
}

/** Older Takeout splits Semantic Location History into one file per month (2019_JANUARY.json). */
function isLegacyMonth(name: string): boolean {
  return /semantic location history/i.test(name) && /\d{4}_[a-z]+\.json$/i.test(name);
}

/** All monthly files as one `{ timelineObjects }` document, so no month is skipped. */
function mergeLegacyMonths(files: Record<string, Uint8Array>, names: string[]): string {
  const decoder = new TextDecoder();
  const parts: string[] = [];
  for (const name of [...names].sort()) {
    let parsed: { timelineObjects?: unknown[] };
    try {
      parsed = JSON.parse(decoder.decode(files[name])) as { timelineObjects?: unknown[] };
    } catch {
      throw new Error(`${basename(name)} is not valid JSON.`);
    }
    const objects = parsed.timelineObjects;
    if (Array.isArray(objects) && objects.length) parts.push(JSON.stringify(objects).slice(1, -1));
  }
  return `{"timelineObjects":[${parts.join(",")}]}`;
}

function pickPreferred(names: string[]): string | undefined {
  return (
    names.find((n) => /timeline\.json$/i.test(n)) ??
    names.find((n) => /semantic/i.test(n) && !/settings/i.test(n)) ??
    names.find((n) => /records\.json$/i.test(n)) ??
    names.find((n) => /edits/i.test(n))
  );
}

/**
 * Extract the best Timeline JSON from a Takeout zip. Rejects nested zips and bombs.
 */
export async function extractTimelineJsonFromZip(
  bytes: ArrayBuffer | Uint8Array,
): Promise<ZipExtractResult> {
  const { unzipSync } = await import("fflate");
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let files: Record<string, Uint8Array>;
  let jsonSeen = 0;
  let declared = 0;
  let tooMany = false;
  let tooBig = false;
  try {
    files = unzipSync(raw, {
      filter: (file) => {
        if (tooMany || tooBig) return false;
        const name = file.name.toLowerCase();
        if (name.endsWith(".zip") || name.endsWith(".gz")) return false;
        if (!name.endsWith(".json")) return false;
        jsonSeen += 1;
        if (jsonSeen > MAX_ZIP_ENTRIES) {
          tooMany = true;
          return false;
        }
        declared += file.originalSize;
        if (file.originalSize > MAX_UNCOMPRESSED || declared > MAX_UNCOMPRESSED) {
          tooBig = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new Error("Could not read zip. Export Timeline JSON or a simple Takeout zip.");
  }
  if (tooMany) throw new Error("Zip has too many JSON files.");
  if (tooBig) throw new Error("Uncompressed zip is too large.");

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

  const hasTimeline = names.some((n) => /timeline\.json$/i.test(n));
  const months = names.filter(isLegacyMonth);
  if (!hasTimeline && months.length) {
    return {
      text: mergeLegacyMonths(files, months),
      chosenPath: `Semantic Location History (${months.length} month${months.length === 1 ? "" : "s"})`,
      candidates: names,
    };
  }

  const preferred = pickPreferred(names);
  if (!preferred) {
    throw new Error(
      `Found ${listNames(names)}. Zip should include Timeline.json or Records.json.`,
    );
  }

  return {
    text: new TextDecoder().decode(files[preferred]),
    chosenPath: preferred,
    candidates: names,
  };
}
