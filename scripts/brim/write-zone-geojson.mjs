#!/usr/bin/env node
/**
 * Write dated GeoJSON from the shared charge catalogue.
 * Usage: node scripts/write-zone-geojson.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  let shared;
  try {
    shared = await import('@locations/brim/shared');
  } catch {
    fail('Cannot import @locations/brim/shared. Run through npm run brim:* (tsx)');
  }

  const zoneDir = path.join(root, 'data', 'brim', 'zones');
  const tollDir = path.join(root, 'data', 'brim', 'tolls');
  await mkdir(zoneDir, { recursive: true });
  await mkdir(tollDir, { recursive: true });

  for (const scheme of shared.ZONE_CATALOGUE) {
    const feature = shared.schemeToGeoJsonFeature(scheme);
    await writeFile(
      path.join(zoneDir, `${scheme.id}.geojson`),
      `${JSON.stringify(feature, null, 2)}\n`,
    );
  }
  for (const scheme of shared.TOLL_CATALOGUE) {
    const feature = shared.schemeToGeoJsonFeature(scheme);
    await writeFile(
      path.join(tollDir, `${scheme.id}.geojson`),
      `${JSON.stringify(feature, null, 2)}\n`,
    );
  }
  console.log(
    `wrote ${shared.ZONE_CATALOGUE.length} zone files and ${shared.TOLL_CATALOGUE.length} toll files`,
  );
}

await main();
