#!/usr/bin/env node
/**
 * Guided first-run setup for people cloning the GitHub repo.
 * Usage: npm run setup
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const samplePath = "data/sample-location-history.json";

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function ask(rl, question, fallback = "") {
  return new Promise((resolveAsk) => {
    const hint = fallback ? ` [${fallback}]` : "";
    rl.question(`${question}${hint}: `, (answer) => {
      resolveAsk(answer.trim() || fallback);
    });
  });
}

function upsertEnv(key, value) {
  let body = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(body)) body = body.replace(re, line);
  else body = `${body.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, body, "utf-8");
}

async function main() {
  console.log(`
Locations — setup your own instance
===================================
locations.aden.website is the owner's private invite-only demo.
Your data stays in YOUR Neon project after this setup.
`);

  if (!existsSync(envPath)) {
    copyFileSync(resolve(root, ".env.example"), envPath);
    console.log("Created .env from .env.example");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const databaseUrl = await ask(
    rl,
    "Neon DATABASE_URL (postgres connection string)",
    process.env.DATABASE_URL || "",
  );
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. Create a free DB at https://neon.tech");
    rl.close();
    process.exit(1);
  }

  const secret =
    (await ask(rl, "BETTER_AUTH_SECRET (leave blank to generate)", "")) ||
    randomBytes(32).toString("hex");

  const dataChoice = await ask(
    rl,
    "Data source: [1] bundled sample  [2] path to your Google Takeout JSON",
    "1",
  );

  let dataPath = samplePath;
  if (dataChoice === "2") {
    dataPath = await ask(
      rl,
      "Path to location-history.json (relative to repo root or absolute)",
      "../location-history.json",
    );
  }

  const email = await ask(rl, "Admin email for first login", "you@example.com");
  const password = await ask(rl, "Admin password", "changeme");
  const name = await ask(rl, "Display name", "Admin");

  rl.close();

  upsertEnv("DATABASE_URL", databaseUrl);
  upsertEnv("BETTER_AUTH_SECRET", secret);
  upsertEnv("BETTER_AUTH_URL", "http://localhost:8787");
  upsertEnv("DATA_PATH", dataPath);

  // Mirror for wrangler local
  writeFileSync(
    resolve(root, ".dev.vars"),
    `DATABASE_URL=${databaseUrl}\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:8787\n`,
    "utf-8",
  );

  console.log("\nInstalling dependencies (if needed)...");
  try {
    run("npm install");
  } catch {
    /* already installed */
  }

  run("npm run db:migrate");
  run("npm run db:import");
  run(`npm run auth:create-user -- "${email}" "${password}" "${name}" admin`);

  console.log(`
Setup complete
==============
Local:
  npm run build:web
  npm run dev:api     # http://localhost:8787
  Sign in as ${email}

Deploy your own site (not aden.website):
  1. Edit wrangler.toml  → change name + BETTER_AUTH_URL + remove/customise the custom domain
  2. npx wrangler login
  3. npx wrangler secret put DATABASE_URL
  4. npx wrangler secret put BETTER_AUTH_SECRET
  5. npm run deploy

Importing your real Takeout later:
  set DATA_PATH in .env to your JSON path
  npm run db:import    # full replace of location tables
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
