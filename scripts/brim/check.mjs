#!/usr/bin/env node
/**
 * Connectivity check for Neon. No user PII, no registration marks.
 * Usage: npm run brim:check [-- --env staging|production]
 */
import { Pool } from '@neondatabase/serverless';
import { loadEnvFiles } from '../../packages/db/src/load-env.ts';

loadEnvFiles();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("brim:check: DATABASE_URL is empty or missing");
  process.exit(1);
}

const client = new Pool({ connectionString: url });
try {
  const postgis = await client.query("SELECT PostGIS_Version() AS version");
  const version = postgis.rows[0]?.version;
  if (!version) {
    console.error("brim:check: PostGIS is not available");
    process.exit(1);
  }
  const vca = await client.query("SELECT count(*)::int AS n FROM brim_vca_vehicles");
  console.log(`brim:check ok (PostGIS ${version}; brim_vca_vehicles=${vca.rows[0]?.n ?? 0})`);
} finally {
  await client.end();
}
