import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const alias = {
  // Subpaths listed first so they win over the "@locations/db" prefix.
  "@locations/db/pure": path.resolve(root, "packages/db/src/pure.ts"),
  "@locations/db/timeline-parse": path.resolve(root, "packages/db/src/timeline-parse.ts"),
  "@locations/db/timeline-import": path.resolve(root, "packages/db/src/timeline-import.ts"),
  "@locations/db/takeout-zip": path.resolve(root, "packages/db/src/takeout-zip.ts"),
  "@locations/db/rail": path.resolve(root, "packages/db/src/rail.ts"),
  "@locations/db/analytics": path.resolve(root, "packages/db/src/analytics.ts"),
  "@locations/db/geo": path.resolve(root, "packages/db/src/geo.ts"),
  "@locations/db/schema": path.resolve(root, "packages/db/src/schema.ts"),
  "@locations/db": path.resolve(root, "packages/db/src/index.ts"),
  "@locations/api": path.resolve(root, "apps/api/src"),
  "@locations/web": path.resolve(root, "apps/web/src"),
  "@locations/brim": path.resolve(root, "packages/brim/src"),
  "@tests": path.resolve(root, "tests"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/legacy/**", "**/dist/**"],
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "tests/unit/security/**",
            "tests/unit/api/admin/**",
            "tests/unit/web/admin/**",
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "tests/integration/api/security/**",
            "tests/integration/api/admin/**",
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "admin",
          environment: "node",
          include: [
            "tests/unit/api/admin/**/*.test.ts",
            "tests/unit/web/admin/**/*.test.ts",
            "tests/integration/api/admin/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "**/dist/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "security",
          environment: "node",
          include: [
            "tests/unit/security/**/*.test.ts",
            "tests/integration/api/security/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "**/dist/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "rls",
          environment: "node",
          include: ["tests/rls/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          setupFiles: ["tests/helpers/rls-env.ts"],
        },
      },
    ],
  },
});
