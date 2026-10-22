#!/usr/bin/env node
/**
 * Pull National Grid ESO carbon intensity and upsert grid_intensity.
 * Usage: npm run brim:sync-carbon [-- --env staging|production] [--dry-run]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';
import { loadEnvFiles } from '../../packages/db/src/load-env.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawDir = path.join(root, 'data', 'brim', 'carbon', 'raw');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const brimEnv = loadEnvFiles();

  let shared;
  try {
    shared = await import('@locations/brim/shared');
  } catch {
    fail('Cannot import @locations/brim/shared. Run through npm run brim:* (tsx)');
  }

  const nowIso = new Date().toISOString();
  let periods;

  if (process.env.BRIM_FIXTURES === '1') {
    periods = shared.CARBON_INTENSITY_FIXTURES;
    console.log('fixture corpus (BRIM_FIXTURES=1); not calling Carbon Intensity');
  } else {
    await mkdir(rawDir, { recursive: true });
    const pulled = await shared.pullCarbonIntensity({ fetch, nowIso });
    periods = pulled.periods;
    const stamp = nowIso.replace(/[:.]/g, '-');
    await writeFile(path.join(rawDir, `intensity-${stamp}.json`), JSON.stringify(pulled.raw));
    console.log(`pulled ${periods.length} carbon intensity periods`);
  }

  if (dryRun) {
    console.log(`dry-run: not writing ${periods.length} rows to the database`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail(
      'DATABASE_URL is empty or missing. Set it in .env (and .dev.vars), then npm run env:sync.',
    );
  }

  const client = new Pool({ connectionString: databaseUrl });
  try {
    const written = await shared.persistCarbonIntensity(
      (sql, params) => client.query(sql, params),
      periods,
      nowIso,
    );
    console.log(`upserted ${written.rows} grid_intensity rows (${brimEnv})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
