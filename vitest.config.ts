import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const alias = {
  "@locations/db": path.resolve(root, "packages/db/src/index.ts"),
  "@locations/api": path.resolve(root, "apps/api/src"),
  "@locations/web": path.resolve(root, "apps/web/src"),
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
          exclude: ["**/node_modules/**", "**/dist/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
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
