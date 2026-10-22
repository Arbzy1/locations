#!/usr/bin/env node
/**
 * Download and upsert VCA car fuel data.
 * Usage: npm run brim:sync-vca [-- --env staging|production] [--dry-run]
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadHrefs,
  extractZipCsvs,
  isHtmlListing,
  looksLikeHtml,
  looksLikeZip,
  openVcaSession,
  request,
} from './vca-fetch.mjs';
import { Pool } from '@neondatabase/serverless';
import { loadEnvFiles } from '../../packages/db/src/load-env.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawDir = path.join(root, 'data', 'brim', 'vca', 'raw');
const metadataPath = path.join(root, 'data', 'brim', 'vca', 'metadata.json');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function looksLikeCsv(text) {
  const first = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim());
  if (!first) return false;
  if (/^\s*</.test(first)) return false;
  return first.includes(',');
}

function safeName(url, fallback) {
  const base = path.basename(new URL(url).pathname);
  const decoded = decodeURIComponent(base)
    .replace(/[<>:"|?*]/g, '_')
    .trim();
  return decoded || fallback;
}

async function main() {
  const brimEnv = loadEnvFiles();

  let shared;
  try {
    shared = await import('@locations/brim/shared');
  } catch {
    fail('Cannot import @locations/brim/shared. Run through npm run brim:* (tsx)');
  }

  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const datasetVersion =
    typeof metadata.dataset_version === 'string' ? metadata.dataset_version : 'vca-unknown';
  await mkdir(rawDir, { recursive: true });

  const sourceUrl =
    typeof metadata.source_url === 'string'
      ? metadata.source_url
      : 'https://carfueldata.vehicle-certification-agency.gov.uk/downloads/default.aspx';

  console.log('session');
  const jar = await openVcaSession();
  console.log(`fetch ${sourceUrl}`);
  const index = await request(sourceUrl, jar);
  const indexHtml = await index.res.text();
  await writeFile(path.join(rawDir, 'downloads-index.html'), indexHtml);

  const queue = downloadHrefs(indexHtml, index.url);
  const seen = new Set();
  let htmlPages = 0;

  while (queue.length > 0) {
    const href = queue.shift();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    try {
      console.log(`fetch ${href}`);
      const got = await request(href, jar, { referer: index.url });
      const buf = Buffer.from(await got.res.arrayBuffer());
      if (looksLikeZip(buf)) {
        const zipName = safeName(got.url, 'vca.zip');
        await writeFile(path.join(rawDir, zipName), buf);
        const csvs = extractZipCsvs(buf);
        if (csvs.length === 0) console.warn(`no csv in ${zipName}`);
        for (const file of csvs) {
          await writeFile(path.join(rawDir, file.name), file.text);
          console.log(`extracted ${file.name}`);
        }
        continue;
      }
      const text = buf.toString('utf8');
      if (looksLikeCsv(text)) {
        await writeFile(path.join(rawDir, safeName(got.url, 'vca.csv')), text);
        continue;
      }
      if (looksLikeHtml(text) && isHtmlListing(new URL(got.url)) && htmlPages < 20) {
        htmlPages += 1;
        for (const next of downloadHrefs(text, got.url)) {
          if (!seen.has(next)) queue.push(next);
        }
        continue;
      }
      console.warn(`skipped non-csv ${href}`);
    } catch (err) {
      console.warn(err instanceof Error ? err.message : String(err));
    }
  }

  const csvNames = (await readdir(rawDir)).filter((name) => name.toLowerCase().endsWith('.csv'));
  if (csvNames.length === 0) {
    fail(
      `No CSV files in ${path.relative(root, rawDir)}.\nThe VCA downloads page needs a session cookie and serves ZIPs via download.aspx, not bare .csv links. Re-run after a successful fetch, or place CSVs in that folder.`,
    );
  }

  const all = [];
  let skippedTotal = 0;
  for (const name of csvNames) {
    const text = await readFile(path.join(rawDir, name), 'utf8');
    if (!looksLikeCsv(text)) {
      console.warn(`skip ${name}: not csv`);
      continue;
    }
    let result;
    try {
      result = shared.normaliseVcaCsv(text, datasetVersion);
    } catch (err) {
      fail(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    skippedTotal += result.skipped.length;
    all.push(...result.vehicles);
    console.log(`${name}: ${result.vehicles.length} kept, ${result.skipped.length} skipped`);
  }

  const unique = new Map();
  for (const row of all) unique.set(row.id, row);
  const vehicles = [...unique.values()];
  console.log(`normalised ${vehicles.length} unique vehicles (${skippedTotal} skipped)`);

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
  const insertSql = `
    INSERT INTO brim_vca_vehicles (
      id, make, model, derivative, fuel, engine_cc, transmission,
      co2_gkm, consumption_combined, unit, cycle, dataset_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      derivative = EXCLUDED.derivative,
      fuel = EXCLUDED.fuel,
      engine_cc = EXCLUDED.engine_cc,
      transmission = EXCLUDED.transmission,
      co2_gkm = EXCLUDED.co2_gkm,
      consumption_combined = EXCLUDED.consumption_combined,
      unit = EXCLUDED.unit,
      cycle = EXCLUDED.cycle,
      dataset_version = EXCLUDED.dataset_version
  `;
  try {
    for (const row of vehicles) {
      await client.query(insertSql, [
        row.id,
        row.make,
        row.model,
        row.derivative ?? null,
        row.fuel,
        row.engineCc ?? null,
        row.transmission ?? null,
        row.co2Gkm ?? null,
        row.consumptionCombined,
        row.unit,
        row.cycle,
        row.datasetVersion,
      ]);
    }
  } finally {
    await client.end();
  }
  console.log(`upserted ${vehicles.length} rows into brim_vca_vehicles (${brimEnv})`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
