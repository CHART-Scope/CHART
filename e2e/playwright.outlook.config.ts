import { defineConfig, devices } from "@playwright/test";

const origin = process.env.CHART_E2E_ORIGIN!;
const port = new URL(origin).port;
const output = process.env.CHART_E2E_EVIDENCE!;
export default defineConfig({
  testDir: ".",
  testMatch: [
    "outlook-live.spec.ts",
    "observed-live.spec.ts",
    "geography-navigation-live.spec.ts",
    "vra-values-live.spec.ts",
    "typography-live.spec.ts",
  ],
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  outputDir: `${output}/browser`,
  reporter: [["list"], ["junit", { outputFile: `${output}/browser-junit.xml` }]],
  // Traces record bearer tokens, so retain screenshots and server logs instead.
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `NEXT_DIST_DIR=.next-outlook-e2e npx next build --webpack && NEXT_DIST_DIR=.next-outlook-e2e npx next start --hostname 127.0.0.1 --port ${port}`,
    cwd: "../web",
    url: origin,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
