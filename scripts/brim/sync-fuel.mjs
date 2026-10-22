#!/usr/bin/env node
/**
 * Pull Fuel Finder pages and upsert stations + prices.
 * Usage: npm run brim:sync-fuel [-- --env staging|production] [--dry-run]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from '@neondatabase/serverless';
import { loadEnvFiles } from '../../packages/db/src/load-env.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawDir = path.join(root, 'data', 'brim', 'fuel-finder', 'raw');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let pfs;
  let prices;

  if (process.env.BRIM_FIXTURES === '1') {
    const fixtures = shared.FUEL_FINDER_FIXTURES;
    pfs = fixtures.pfs;
    prices = fixtures.prices;
    console.log('fixture corpus (BRIM_FIXTURES=1); not calling Fuel Finder');
  } else {
    const clientId = process.env.FUEL_FINDER_CLIENT_ID;
    const clientSecret = process.env.FUEL_FINDER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      fail(
        'FUEL_FINDER_CLIENT_ID and FUEL_FINDER_CLIENT_SECRET are required. Register at the Fuel Finder developer portal, or set BRIM_FIXTURES=1.',
      );
    }
    await mkdir(rawDir, { recursive: true });
    const databaseUrl = process.env.DATABASE_URL;
    let watermark;
    if (databaseUrl && !dryRun) {
      const peek = new Pool({ connectionString: databaseUrl });
      try {
        const found = await peek.query(shared.WATERMARK_SELECT_SQL, [shared.FUEL_FINDER_SOURCE]);
        const raw = found.rows[0]?.watermark;
        if (raw) watermark = shared.formatFuelFinderTimestamp(raw);
      } finally {
        await peek.end();
      }
    }
    if (watermark) console.log(`incremental from ${watermark}`);
    else console.log('full Fuel Finder pull');

    const pulled = await shared.pullFuelFinder({
      fetch,
      sleep,
      clientId,
      clientSecret,
      ...(watermark ? { watermark } : {}),
      onRaw: async (kind, batchNumber, body) => {
        await writeFile(path.join(rawDir, `${kind}-${batchNumber}.json`), JSON.stringify(body));
        console.log(`${kind} batch ${batchNumber}`);
      },
    });
    pfs = pulled.pfs;
    prices = pulled.prices;
  }

  const result = shared.normaliseFuelFinder({ pfs, prices, nowIso });
  console.log(
    `normalised ${result.stations.length} stations, ${result.prices.length} prices (${result.skipped.length} skipped)`,
  );

  if (dryRun) {
    console.log('dry-run: not writing to the database');
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
    const written = await shared.persistFuelFinder(
      (sql, params) => client.query(sql, params),
      result,
      nowIso,
    );
    console.log(`upserted ${written.stations} stations, ${written.prices} prices (${brimEnv})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
