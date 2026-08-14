import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const name = process.env.LOCATIONS_ENV || "local";
const envFile = name === "local" ? ".env" : `.env.${name}`;
const devFile = name === "local" ? ".dev.vars" : `.dev.vars.${name}`;
config({ path: resolve(root, envFile) });
config({ path: resolve(root, devFile) });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
