import http from "node:http";

import { expect, type Page, type Route, test } from "@playwright/test";

import {
  bearerOf,
  fakeJwt,
  type FakeApi,
  installFakeApi,
  json,
  mapFor,
  rotateTokens,
} from "./support/fakeApi";

/**
 * The browser session: token rotation, 401 recovery, an unavailable identity
 * provider, the idle timeout and sign-out across tabs. Every request still
 * goes through the real Next build; only Keycloak and the Python API are
 * answered at the network boundary.
 */

const dashboard =
  "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08";
const evidence = "../outputs/e2e/web/session";

const readyAugust = {
  admin_unit_id: 1,
  admin_unit_code: "bhopal",
  months: {
    "2026-08": {
      temperature: {
        tmax_monthly_mean_c: 33.4,
        unit: "C",
        source_name: "ERA5",
        climate_run_id: 7,
        data_label: "reanalysis",
      },
      health_impacts: [],
      prediction: {
        request_id: 9,
        attributable_fraction_milli: 180,
        odds_ratio: 1.22,
        reference_temperature_c: 30,
        reference_kind: null,
        ci95_low: 1.05,
        ci95_high: 1.41,
        on_training_support: true,
        warning: null,
        model_version: "lbw-1.0.1",
        model_release_id: "lbw-1",
        model_file: "bhopal.rds",
        input_statistic: "tmax_monthly_mean_c",
        fraction_method: "attributable_fraction",
        attributable_fraction_policy: "positive_excess_only",
      },
    },
  },
};

function count(api: FakeApi, pattern: RegExp) {
  return api.requests.filter((request) => pattern.test(request)).length;
}

/** Wait until no request has been sent for `quietMs` of real time. */
async function settle(page: Page, api: FakeApi, quietMs = 1_500) {
  let seen = -1;
  await expect
    .poll(
      async () => {
        const now = api.requests.length;
        const stable = now === seen;
        seen = now;
        if (!stable) await page.waitForTimeout(quietMs);
        return stable;
      },
      { timeout: 30_000, intervals: [quietMs] },
    )
    .toBe(true);
}

/** Stand in for Keycloak's logout: the signout route ends at `returnTo`. */
async function fakeSignOutRedirect(page: Page) {
  const signouts: string[] = [];
  await page.route("**/auth/signout**", (route) => {
    const url = new URL(route.request().url());
    signouts.push(url.search);
    return route.fulfill({
      status: 302,
      headers: { location: url.searchParams.get("returnTo") ?? "/" },
    });
  });
  return signouts;
}

test("a token rotation does not refetch the dashboard or resubmit a prediction", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page, {
    // August is not ready on the first read and is after its prediction.
    monthly: () =>
      count(api, /\/monthly/) <= 1 ? { admin_unit_id: 1, months: {} } : readyAugust,
  });
  // Ten minutes of life, renewed 30 s before expiry, so real time alone never renews it here.
  const tokens = rotateTokens(page, api, { lifetimeSeconds: 600 });
  const predictTokens: string[] = [];
  api.on(/^\/api\/chart\/climate\/predict$/, (route) => {
    predictTokens.push(bearerOf(route));
    return json(route, {
      request_id: predictTokens.length,
      request_status: "completed",
    });
  });

  await page.goto(dashboard);
  await expect(page.getByText("Data and model details")).toBeVisible();
  await settle(page, api);
  const before = {
    monthly: count(api, /\/risk\/[^/]+\/monthly/),
    map: count(api, /\/risk\/[^/]+\/map/),
    predict: count(api, /\/climate\/predict/),
  };
  expect(before.predict).toBe(1);
  expect(tokens.issued).toHaveLength(1);

  // Two rotations, as a dashboard left open for twenty minutes would see.
  await page.clock.fastForward(575_000);
  await expect.poll(() => tokens.issued.length).toBe(2);
  await page.clock.fastForward(575_000);
  await expect.poll(() => tokens.issued.length).toBe(3);
  await settle(page, api);

  expect({
    monthly: count(api, /\/risk\/[^/]+\/monthly/),
    map: count(api, /\/risk\/[^/]+\/map/),
    predict: count(api, /\/climate\/predict/),
  }).toEqual(before);
  await expect(page.getByText("Data and model details")).toBeVisible();

  // The next request carries the newest token, though the page was handed
  // the first one and never re-rendered with another.
  await page
    .getByRole("group", { name: "Months in 2026" })
    .getByRole("button", { name: "Jul" })
    .click();
  await expect.poll(() => predictTokens.length).toBe(2);
  expect(predictTokens[1]).toBe(tokens.issued[2]);
  await page.screenshot({ path: `${evidence}/rotation.png` });
});

test("a 401 renews the token once and retries the request", async ({ page }) => {
  const api = await installFakeApi(page, { monthly: () => readyAugust });
  const tokens = rotateTokens(page, api, { lifetimeSeconds: 3_600 });
  // The API rejects the first token, as it would a revoked or skewed one.
  // Both reads fail at once, so a per-request refresh would show up twice.
  const seen: { path: string; token: string; status: number }[] = [];
  const rejectFirstToken =
    (answer: (url: URL) => unknown) => (route: Route, url: URL) => {
      const token = bearerOf(route);
      const status = token === tokens.issued[0] ? 401 : 200;
      seen.push({ path: url.pathname, token, status });
      return status === 401
        ? json(route, { error: "AUTH_TOKEN_INVALID" }, 401)
        : json(route, answer(url));
    };
  api.on(
    /\/risk\/[^/]+\/monthly$/,
    rejectFirstToken(() => readyAugust),
  );
  api.on(
    /\/risk\/[^/]+\/map$/,
    rejectFirstToken((url) => mapFor(url)),
  );

  await page.goto(dashboard);
  await expect(page.getByText("Data and model details")).toBeVisible();
  await settle(page, api);

  // One refresh to restore the session and exactly one to renew it.
  expect(tokens.calls).toBe(2);
  const monthly = seen.filter((entry) => entry.path.endsWith("/monthly"));
  expect(monthly.map((entry) => entry.status)).toEqual([401, 200]);
  expect(monthly[1].token).toBe(tokens.issued[1]);
  expect(seen.filter((entry) => entry.status === 200).length).toBeGreaterThanOrEqual(2);
  expect(page.url()).toContain("/dashboard/geo-in-mp");
  // Neither panel fell back to its error state.
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/retry-after-401.png` });
});

test("an unavailable identity provider keeps the page and retries", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page, { monthly: () => readyAugust });
  let providerDown = false;
  const tokens = rotateTokens(page, api, {
    lifetimeSeconds: 600,
    respond: (_call, route) =>
      providerDown
        ? json(route, { error: "AUTH_PROVIDER_UNAVAILABLE" }, 503)
        : undefined,
  });
  const signIns: string[] = [];
  await page.route("**/auth/signin**", (route) => {
    signIns.push(route.request().url());
    return route.fulfill({ status: 200, body: "sign-in" });
  });

  await page.goto(dashboard);
  await expect(page.getByText("Data and model details")).toBeVisible();
  providerDown = true;

  // The renewal fails (background work woken by the same jump may try too,
  // sharing the provider's answer), and so does the retry five seconds on.
  await page.clock.fastForward(575_000);
  await expect.poll(() => tokens.calls).toBeGreaterThanOrEqual(2);
  const failedCalls = tokens.calls;
  await page.clock.fastForward(6_000);
  await expect.poll(() => tokens.calls).toBeGreaterThan(failedCalls);
  expect(tokens.issued).toHaveLength(1);

  expect(signIns).toEqual([]);
  expect(page.url()).toContain("/dashboard/geo-in-mp");
  await expect(page.getByText("Data and model details")).toBeVisible();
  // Still usable: choosing another month works while Keycloak is down.
  await page
    .getByRole("group", { name: "Months in 2026" })
    .getByRole("button", { name: "Jul" })
    .click();
  await expect(page).toHaveURL(/month=2026-07/);

  // The provider comes back and the next retry renews the session.
  providerDown = false;
  await page.clock.fastForward(31_000);
  await expect.poll(() => tokens.issued.length).toBeGreaterThanOrEqual(2);
  expect(signIns).toEqual([]);
  await page.screenshot({ path: `${evidence}/provider-unavailable.png` });
});

test("a session restore during an outage waits instead of signing in", async ({
  page,
}) => {
  const api = await installFakeApi(page, { monthly: () => readyAugust });
  const tokens = rotateTokens(page, api, {
    respond: (call, route) =>
      call === 1 ? json(route, { error: "AUTH_PROVIDER_UNAVAILABLE" }, 503) : undefined,
  });
  const signIns: string[] = [];
  await page.route("**/auth/signin**", (route) => {
    signIns.push(route.request().url());
    return route.fulfill({ status: 200, body: "sign-in" });
  });

  await page.goto(dashboard);
  await expect(
    page.getByRole("heading", { name: "CHART is temporarily unavailable" }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidence}/restore-unavailable.png` });
  await expect(page.getByText("Data and model details")).toBeVisible({
    timeout: 15_000,
  });
  expect(tokens.calls).toBe(2);
  expect(signIns).toEqual([]);
});

test("a refresh token that has expired sends the user to sign in", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page, { monthly: () => readyAugust });
  const tokens = rotateTokens(page, api, {
    lifetimeSeconds: 600,
    respond: (call, route) =>
      call > 1 ? json(route, { error: "AUTH_SESSION_EXPIRED" }, 401) : undefined,
  });
  await page.route("**/auth/signin**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Keycloak</h1>" }),
  );

  await page.goto(dashboard);
  await expect(page.getByText("Data and model details")).toBeVisible();
  await page.clock.fastForward(575_000);
  await page.waitForURL("**/auth/signin");
  expect(tokens.calls).toBe(2);
});

test("thirty minutes without activity signs the user out", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
  const audit: {
    token: string;
    events: { event_type: string; payload?: unknown }[];
  }[] = [];
  api.on(/^\/api\/chart\/audit\/events$/, (route) => {
    audit.push({ token: bearerOf(route), ...route.request().postDataJSON() });
    return json(route, { accepted: 1 }, 200);
  });
  const signouts = await fakeSignOutRedirect(page);

  await page.goto("/plan");
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();

  // Twenty-nine minutes is not enough, and activity restarts the count.
  await page.clock.fastForward("29:00");
  await page.keyboard.press("Shift");
  await page.clock.fastForward("29:00");
  expect(signouts).toEqual([]);
  expect(page.url()).toContain("/plan");

  await page.clock.fastForward("02:00");
  await page.waitForURL((url) => url.pathname === "/");
  expect(signouts).toEqual(["?returnTo=%2F"]);
  await expect(page.getByRole("status").filter({ hasText: "30 minutes" })).toHaveText(
    "You were signed out after 30 minutes without activity. Sign in to continue.",
  );
  // The sign-out was recorded and sent with the user's own token before the
  // session was dropped.
  const signout = audit
    .flatMap((batch) => batch.events.map((event) => ({ ...event, token: batch.token })))
    .find((event) => event.event_type === "signout");
  expect(signout?.payload).toEqual({ reason: "idle" });
  expect(signout?.token).not.toBe("");
  await page.screenshot({ path: `${evidence}/idle-signout.png` });
});

test("signing out in one tab signs out the other", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  const signouts: string[][] = [];
  for (const page of [first, second]) {
    const api = await installFakeApi(page);
    api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
    signouts.push(await fakeSignOutRedirect(page));
  }

  await first.goto("/plan");
  await second.goto("/plan");
  await expect(first.getByText("in Madhya Pradesh.")).toBeVisible();
  await expect(second.getByText("in Madhya Pradesh.")).toBeVisible();

  await first.getByRole("button", { name: "Sign out" }).click();

  await second.waitForURL((url) => url.pathname === "/");
  await expect(
    second.getByRole("status").filter({ hasText: "another tab" }),
  ).toHaveText("You signed out of CHART in another tab.");
  // Only the tab that signed out goes through the provider's logout; the
  // other just leaves, since the shared cookies are already gone.
  await expect.poll(() => signouts[0]).toEqual(["?returnTo=%2Fplan"]);
  expect(signouts[1]).toEqual([]);
  await second.screenshot({ path: `${evidence}/other-tab-signout.png` });
});

test("a token rotation keeps the planning selection", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page);
  const tokens = rotateTokens(page, api, { lifetimeSeconds: 600 });

  await page.goto("/plan");
  const outcome = page.getByRole("combobox", { name: "Choose the health outcome" });
  await expect(outcome).toBeEnabled();
  await outcome.click();
  await page.getByRole("option", { name: "Under-five mortality", exact: true }).click();
  await expect(outcome).toHaveText(/Under-five mortality/);
  await settle(page, api);
  const geographyReads = count(api, /\/api\/chart\/geographies/);

  await page.clock.fastForward(575_000);
  await expect.poll(() => tokens.issued.length).toBe(2);
  await settle(page, api);

  // The areas were not reloaded, which is what reset the selection.
  await expect(outcome).toHaveText(/Under-five mortality/);
  expect(count(api, /\/api\/chart\/geographies/)).toBe(geographyReads);
});

test("pulling model updates sends the administrator's token through the proxy", async ({
  page,
}) => {
  // The stand-in for the Python API the Next route proxies to.
  const forwarded: (string | undefined)[] = [];
  const upstream = http.createServer((request, response) => {
    forwarded.push(request.headers.authorization);
    response.writeHead(request.headers.authorization ? 200 : 401, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify(
        request.headers.authorization
          ? { activeReleaseIds: [], assignmentCount: 0 }
          : { error: "AUTH_TOKEN_REQUIRED" },
      ),
    );
  });
  await new Promise<void>((resolve) =>
    upstream.listen(
      Number(process.env.E2E_UPSTREAM_PORT ?? 3301),
      "127.0.0.1",
      resolve,
    ),
  );

  try {
    const api = await installFakeApi(page);
    const token = fakeJwt({ sub: "e2e-admin", exp: 4_102_444_800 });
    api.on(/^\/api\/auth\/keycloak-refresh$/, (route) =>
      json(route, { access_token: token }),
    );
    api.on(/^\/api\/chart\/auth\/me$/, (route) =>
      json(route, {
        userId: "e2e-admin",
        username: "admin",
        roles: ["chart_admin"],
        geographyScopes: ["/india"],
      }),
    );
    api.on(/^\/api\/chart\/model-releases$/, (route) => json(route, { items: [] }));
    // The sync itself goes to the real Next route, not the fake.
    const browserSent: (string | undefined)[] = [];
    api.on(/^\/api\/setup\/models\/sync$/, (route) => {
      browserSent.push(route.request().headers().authorization);
      return route.continue();
    });

    await page.goto("/settings/models");
    await page.getByRole("button", { name: /pull updates|sync/i }).click();

    await expect(page.getByText(/Sync complete/)).toBeVisible();
    expect(browserSent).toEqual([`Bearer ${token}`]);
    expect(forwarded).toEqual([`Bearer ${token}`]);
    await page.screenshot({ path: `${evidence}/sync-models.png` });
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("reading for two hours, moving only the pointer, keeps the session", async ({
  page,
}) => {
  // The production failure: every sign-out was "idle" while the user was
  // reading. Pointer movement now counts, and the token keeps rotating.
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
  const tokens = rotateTokens(page, api, { lifetimeSeconds: 300 });
  const signouts = await fakeSignOutRedirect(page);

  await page.goto("/plan");
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  await expect.poll(() => tokens.issued.length).toBe(1);

  // Five-minute tokens renewed 30 s early: one rotation per five minutes,
  // with the pointer moving every fifteen, for two hours.
  for (let step = 1; step <= 24; step += 1) {
    await page.clock.fastForward("05:00");
    await expect.poll(() => tokens.issued.length).toBe(step + 1);
    if (step % 3 === 0) await page.mouse.move(100 + step * 10, 200 + step * 5);
  }

  expect(signouts).toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/plan");
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Still there?" })).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/two-hours-reading.png` });
});

test("an idle warning offers to stay signed in before the sign-out", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-25T12:00:00Z") });
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
  const signouts = await fakeSignOutRedirect(page);

  await page.goto("/plan");
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  const warning = page.getByRole("dialog", { name: "Still there?" });

  await page.clock.fastForward("27:00");
  await expect(warning).toHaveCount(0);
  await page.clock.fastForward("01:30");
  await expect(warning).toBeVisible();
  await expect(warning.getByRole("timer")).toHaveText("Signing out in 1:30");
  await page.screenshot({ path: `${evidence}/idle-warning.png` });

  await warning.getByRole("button", { name: "Stay signed in" }).click();
  await expect(warning).toHaveCount(0);
  await page.clock.fastForward("27:00");
  expect(signouts).toEqual([]);
  expect(new URL(page.url()).pathname).toBe("/plan");
  await expect(warning).toHaveCount(0);
});
