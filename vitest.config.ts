import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@locations/db": path.resolve(root, "packages/db/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/e2e/**", "**/legacy/**", "**/dist/**"],
    projects: [
      {
        resolve: {
          alias: {
            "@locations/db": path.resolve(root, "packages/db/src/index.ts"),
          },
        },
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.{test,spec}.ts"],
          exclude: [
            "**/node_modules/**",
            "**/e2e/**",
            "**/legacy/**",
            "**/dist/**",
            "**/*.integration.test.ts",
            "**/*.rls.test.ts",
          ],
        },
      },
      {
        resolve: {
          alias: {
            "@locations/db": path.resolve(root, "packages/db/src/index.ts"),
          },
        },
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.integration.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
        },
      },
      {
        resolve: {
          alias: {
            "@locations/db": path.resolve(root, "packages/db/src/index.ts"),
          },
        },
        test: {
          name: "rls",
          environment: "node",
          include: ["**/*.rls.test.ts", "**/rls.test.ts", "**/*rls*.integration.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
        },
      },
    ],
  },
});
