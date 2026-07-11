import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiPort = 43_219;
const webPort = 51_739;
const e2eDataDir = join(tmpdir(), `assini-e2e-${process.pid}`);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  preserveOutput: "failures-only",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["line"]] : "list",
  expect: {
    timeout: 10_000
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${webPort}`,
    colorScheme: "light",
    locale: "en-CA",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "tsx apps/api/src/index.ts",
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        ASSINI_DB_PATH: join(e2eDataDir, "local-db.json"),
        ASSINI_ENABLE_PROTOTYPE_AUTH: "true",
        HOST: "127.0.0.1",
        PORT: String(apiPort)
      }
    },
    {
      command: `npm --workspace @assini/web run dev -- --host 127.0.0.1 --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        ASSINI_API_HOST: "127.0.0.1",
        ASSINI_API_PORT: String(apiPort)
      }
    }
  ]
});
