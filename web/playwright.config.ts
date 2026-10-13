import { defineConfig, devices } from "@playwright/test";

// Every run writes its evidence under outputs/e2e/web: an HTML report, a JUnit
// file, and a trace, screenshot and video for every test, so a run can be
// checked and replayed after the fact.
const outputRoot = "../outputs/e2e/web";
const port = Number(process.env.E2E_PORT ?? 3300);
const upstreamPort = Number(process.env.E2E_UPSTREAM_PORT ?? 3301);

export default defineConfig({
  testDir: "./e2e",
  outputDir: `${outputRoot}/results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${outputRoot}/report`, open: "never" }],
    ["junit", { outputFile: `${outputRoot}/junit.xml` }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on",
    screenshot: "on",
    video: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build in its own dist directory, so the suite runs beside
    // `make web` without touching its `.next`.
    // next build rewrites next-env.d.ts to point at its dist directory, so the
    // tracked copy is put back before the server starts.
    command: `cp next-env.d.ts .next-env.d.ts.bak && NEXT_DIST_DIR=.next-e2e npx next build --webpack; status=$?; mv .next-env.d.ts.bak next-env.d.ts; [ $status -eq 0 ] && NEXT_DIST_DIR=.next-e2e npx next start --hostname 127.0.0.1 --port ${port}`,
    // Server-side calls go to the specs' fake upstream (e2e/support/fakeUpstream.ts).
    // The bootstrap token is set only so a spec can prove the server never sends it.
    env: {
      CHART_WEB_ORIGIN: `http://127.0.0.1:${port}`,
      CHART_PYTHON_API_INTERNAL_URL: `http://127.0.0.1:${upstreamPort}`,
      KEYCLOAK_SERVER_URL: `http://127.0.0.1:${upstreamPort}`,
      CHART_BOOTSTRAP_TOKEN: "e2e-server-side-bootstrap-token",
    },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
