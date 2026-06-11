import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@assini/api-contract": resolve(rootDir, "packages/api-contract/src/index.ts"),
      "@assini/db": resolve(rootDir, "packages/db/src/index.ts"),
      "@assini/eval": resolve(rootDir, "packages/eval/src/index.ts")
    }
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/**/*.test.tsx"]
        }
      }
    ]
  }
});
