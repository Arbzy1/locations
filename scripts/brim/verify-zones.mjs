#!/usr/bin/env node
/**
 * Fail if any zone or toll verified_on is older than 180 days.
 * Usage: node scripts/verify-zones.mjs [--today=YYYY-MM-DD]
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_AGE_DAYS = 180;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function todayArg() {
  const flag = process.argv.find((a) => a.startsWith('--today='));
  if (flag) return flag.slice('--today='.length);
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000);
}

async function readFeatures(dir) {
  const entries = await readdir(dir).catch(() => []);
  const features = [];
  for (const name of entries) {
    if (!name.endsWith('.geojson')) continue;
    const raw = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    const list = raw.type === 'FeatureCollection' ? raw.features : [raw];
    for (const feature of list) {
      features.push({ file: path.join(dir, name), feature });
    }
  }
  return features;
}

async function main() {
  const today = todayArg();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) fail(`invalid --today=${today}`);
  const features = [
    ...(await readFeatures(path.join(root, 'data', 'brim', 'zones'))),
    ...(await readFeatures(path.join(root, 'data', 'brim', 'tolls'))),
  ];
  if (features.length === 0) fail('brim:verify-zones: no GeoJSON features found in data/zones or data/tolls');

  const stale = [];
  for (const { file, feature } of features) {
    const verified = feature?.properties?.verified_on;
    const id = feature?.properties?.id ?? path.basename(file);
    if (!verified || !/^\d{4}-\d{2}-\d{2}$/.test(verified)) {
      stale.push(`${id} (${file}): missing verified_on`);
      continue;
    }
    const age = daysBetween(verified, today);
    if (age > MAX_AGE_DAYS) {
      stale.push(`${id}: verified_on ${verified} is ${age} days old (limit ${MAX_AGE_DAYS})`);
    }
  }
  if (stale.length > 0) {
    fail(`brim:verify-zones failed:\n${stale.map((s) => `  - ${s}`).join('\n')}`);
  }
  console.log(`brim:verify-zones ok (${features.length} features; today=${today})`);
}

await main();
