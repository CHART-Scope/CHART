import { type BrowserContext, expect, type Page, test } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";
import { type FakeUpstream, startFakeUpstream } from "./support/fakeUpstream";

// Failure modes: sign-out reachable by a plain GET, two tabs' sign-ins
// overwriting one PKCE cookie, a failed callback with no way back to sign-in,
// the web server adding the bootstrap token for any caller, and model-release
// calls reaching the API without the user's token.

let upstream: FakeUpstream;

test.beforeAll(async () => {
  upstream = await startFakeUpstream();
});
test.afterAll(async () => {
  await upstream.close();
});
test.beforeEach(() => upstream.reset());

const keycloakAuthorize = /\/protocol\/openid-connect\/auth\?/;
const keycloakLogout = /\/protocol\/openid-connect\/logout\?/;

/** Keycloak's own pages are outside the app; answer them with a stub. */
async function stubKeycloakPages(context: BrowserContext) {
  await context.route(keycloakAuthorize, (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Keycloak sign-in</h1>" }),
  );
  await context.route(keycloakLogout, (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Keycloak signed out</h1>" }),
  );
}

async function sessionCookies(context: BrowserContext) {
  return Object.fromEntries(
    (await context.cookies())
      .filter((cookie) => cookie.name.startsWith("chart.auth."))
      .map((cookie) => [cookie.name, cookie.value]),
  );
}

async function seedSession(context: BrowserContext) {
  await context.addCookies(
    [
      ["chart.auth.refresh", "e2e-refresh"],
      ["chart.auth.id", "e2e-id-token"],
    ].map(([name, value]) => ({
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
}

test("a GET to sign-out is refused and leaves the session in place", async ({
  context,
  page,
}) => {
  await seedSession(context);

  const navigation = await page.goto("/auth/signout?returnTo=/plan");
  expect(navigation?.status()).toBe(405);
  const direct = await page.request.get("/auth/signout", { maxRedirects: 0 });
  expect(direct.status()).toBe(405);
  expect(direct.headers()["allow"]).toBe("POST");

  expect(await sessionCookies(context)).toMatchObject({
    "chart.auth.refresh": "e2e-refresh",
    "chart.auth.id": "e2e-id-token",
  });
});

test("signing out POSTs, clears the session and logs out of Keycloak with the id token", async ({
  context,
  page,
}) => {
  await seedSession(context);
  await stubKeycloakPages(context);
  await installFakeApi(page);
  const signOutRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/auth/signout") {
      signOutRequests.push(request.method());
    }
  });

  await page.goto("/plan");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(keycloakLogout, { waitUntil: "commit" });

  expect(signOutRequests).toEqual(["POST"]);
  const logout = new URL(page.url());
  expect(logout.searchParams.get("id_token_hint")).toBe("e2e-id-token");
  expect(logout.searchParams.get("post_logout_redirect_uri")).toMatch(/\/plan$/);
  expect(await sessionCookies(context)).toEqual({});
});

test("a cross-site sign-out POST is refused", async ({ context, page }) => {
  await seedSession(context);
  const response = await page.request.post("/auth/signout", {
    headers: { "sec-fetch-site": "cross-site" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
  expect(await sessionCookies(context)).toMatchObject({
    "chart.auth.id": "e2e-id-token",
  });
});

async function startSignIn(page: Page) {
  await page.goto("/auth/signin", { waitUntil: "commit" });
  await page.waitForURL(keycloakAuthorize, { waitUntil: "commit" });
  const authorize = new URL(page.url());
  return {
    state: authorize.searchParams.get("state") ?? "",
    challenge: authorize.searchParams.get("code_challenge") ?? "",
  };
}

test("two tabs signing in at once each finish with their own PKCE verifier", async ({
  context,
}) => {
  await stubKeycloakPages(context);
  const tabs = [await context.newPage(), await context.newPage()];
  const attempts = [];
  for (const tab of tabs) attempts.push(await startSignIn(tab));
  expect(attempts[0].state).not.toBe(attempts[1].state);
  expect(Object.keys(await sessionCookies(context)).sort()).toEqual(
    attempts.map(({ state }) => `chart.auth.pkce.${state}`).sort(),
  );

  // The tab that started first finishes first: with one shared cookie its
  // verifier had already been replaced by the second tab's.
  for (const [index, tab] of tabs.entries()) {
    const code = `e2e-code-${index}`;
    upstream.issueCode(code, attempts[index].challenge);
    const api = await installFakeApi(tab);
    api.on(/^\/api\/auth\/keycloak-exchange$/, (route) => route.continue());
    await tab.goto(`/auth/callback?code=${code}&state=${attempts[index].state}`);
    await tab.waitForURL("**/plan**");
  }

  const exchanges = upstream.requests.filter((request) =>
    request.path.endsWith("/protocol/openid-connect/token"),
  );
  expect(exchanges).toHaveLength(2);
  // Each verifier is spent and its cookie removed; the session cookies remain.
  expect(Object.keys(await sessionCookies(context)).sort()).toEqual([
    "chart.auth.id",
    "chart.auth.refresh",
  ]);
});

test("a callback with an unknown state is rejected without contacting Keycloak", async ({
  page,
}) => {
  const response = await page.request.post("/api/auth/keycloak-exchange", {
    data: { code: "e2e-code", state: "no-such-sign-in-attempt" },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: "AUTH_CALLBACK_INVALID" });
  expect(upstream.requests).toEqual([]);
});

test("a failed callback offers a fresh sign-in", async ({ context, page }) => {
  await stubKeycloakPages(context);
  const api = await installFakeApi(page);
  api.on(/^\/api\/auth\/keycloak-exchange$/, (route) =>
    json(route, { error: "AUTH_CALLBACK_INVALID" }, 400),
  );

  await page.goto("/auth/callback?code=e2e-code&state=e2e-state");
  await expect(page.getByRole("heading", { name: "Sign-in failed" })).toBeVisible();
  await page.getByRole("button", { name: "Try signing in again" }).click();

  await page.waitForURL(keycloakAuthorize, { waitUntil: "commit" });
  const state = new URL(page.url()).searchParams.get("state");
  expect(Object.keys(await sessionCookies(context))).toEqual([
    `chart.auth.pkce.${state}`,
  ]);
});

test("the bootstrap proxy forwards only the token the caller supplied", async ({
  page,
}) => {
  upstream.on("POST", "/setup/bootstrap", () => ({
    status: 403,
    body: { error: "SETUP_BOOTSTRAP_FORBIDDEN" },
  }));

  const anonymous = await page.request.post("/api/setup/bootstrap", { data: {} });
  expect(anonymous.status()).toBe(403);
  const supplied = await page.request.post("/api/setup/bootstrap", {
    data: {},
    headers: { "x-chart-bootstrap-token": "caller-token" },
  });
  expect(supplied.status()).toBe(403);

  const sent = upstream.requests.map(
    (request) => request.headers["x-chart-bootstrap-token"] ?? null,
  );
  // The server's own CHART_BOOTSTRAP_TOKEN (see playwright.config.ts) never
  // leaves it.
  expect(sent).toEqual([null, "caller-token"]);
});

const setupStatus = {
  completed: false,
  requiresOnboarding: true,
  collaboratingSectorIds: [],
  counts: { geographies: 0, workspaceMembers: 0 },
};

const testland = {
  countryCode: "TL",
  countryName: "Testland",
  rootId: "geo-tl",
  rootPath: "/testland",
  levels: [{ key: "geo_level_1", label: "County", sortOrder: 1 }],
  places: [
    {
      placeCode: "alpha",
      id: "geo-tl-alpha",
      name: "Alpha",
      level: "geo_level_1",
      levelLabel: "County",
      parentPlaceCode: null,
      path: "/testland/alpha",
      sortOrder: 1,
      predictionSupported: true,
    },
  ],
};

test("the setup wizard sends the setup token the administrator enters", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "chart:onboarding",
      JSON.stringify({
        version: 1,
        state: {
          country: "Testland",
          level: "County",
          geo: "Alpha",
          subgeo: null,
          primarySectorId: "health",
          collaboratingSectorIds: [],
          adminName: "",
          adminEmail: "",
          currentStep: 3,
        },
      }),
    );
  });
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, setupStatus));
  api.on(/^\/api\/setup\/options$/, (route) =>
    json(route, {
      sectors: [{ id: "health", label: "Health" }],
      geographies: [testland],
    }),
  );
  api.on(/^\/api\/setup\/action-repository$/, (route) =>
    json(route, { actionCount: 0, trackedActionCount: 0 }),
  );
  api.on(/^\/api\/setup\/bootstrap$/, (route) => route.continue());
  upstream.on("POST", "/setup/bootstrap", (request) =>
    request.headers["x-chart-bootstrap-token"] === "the-real-setup-token"
      ? {
          status: 200,
          body: {
            setup: { ...setupStatus, completed: true, requiresOnboarding: false },
            admin: { userId: "admin-1", username: "admin@example.org", email: "" },
          },
        }
      : { status: 403, body: { error: "SETUP_BOOTSTRAP_FORBIDDEN" } },
  );

  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Launch CHART" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("CHART Administrator");
  await dialog.getByLabel("Email address").fill("admin@example.org");
  await dialog.getByLabel("Administrator password").fill("a-long-password");
  const create = dialog.getByRole("button", { name: "Create account & launch" });
  await expect(create).toBeDisabled();

  await dialog.getByLabel("Setup token").fill("a-wrong-token");
  await create.click();
  await expect(dialog.getByRole("alert")).toContainText("setup token is not correct");

  await dialog.getByLabel("Setup token").fill("the-real-setup-token");
  await create.click();
  await expect(dialog).toBeHidden();

  expect(
    upstream.requests.map((request) => request.headers["x-chart-bootstrap-token"]),
  ).toEqual(["a-wrong-token", "the-real-setup-token"]);
  const persisted = await page.evaluate(() =>
    window.localStorage.getItem("chart:onboarding"),
  );
  // Like the password, the token stays in memory only.
  expect(persisted ?? "").not.toContain("setup-token");
  expect(persisted ?? "").not.toContain("setupToken");
});

test("the Models page sends the signed-in admin's token for list and reload", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "e2e-admin",
      username: "admin",
      roles: ["chart_admin"],
      geographyScopes: ["/india"],
    }),
  );
  api.on(/^\/api\/chart\/model-releases(\/.*)?$/, (route) => route.continue());
  upstream.on("GET", "/model-releases", (request) =>
    request.headers.authorization?.startsWith("Bearer ")
      ? { status: 200, body: { items: [release] } }
      : { status: 401, body: { error: "AUTH_TOKEN_REQUIRED" } },
  );
  upstream.on("POST", "/model-releases/lbw-e2e/reload", (request) =>
    request.headers.authorization?.startsWith("Bearer ")
      ? { status: 200, body: { release_id: "lbw-e2e", status: "loaded" } }
      : { status: 401, body: { error: "AUTH_TOKEN_REQUIRED" } },
  );

  await page.goto("/settings/models");
  await expect(page.getByText("lbw-e2e", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("Reloaded lbw-e2e.")).toBeVisible();

  const authorizations = upstream.requests.map((request) => [
    `${request.method} ${request.path}`,
    request.headers.authorization,
  ]);
  expect(authorizations).toContainEqual([
    "GET /model-releases",
    expect.stringMatching(/^Bearer /),
  ]);
  expect(authorizations).toContainEqual([
    "POST /model-releases/lbw-e2e/reload",
    expect.stringMatching(/^Bearer /),
  ]);
});

const release = {
  id: "lbw-e2e",
  version: "1.0.0",
  outcome: "lbw",
  outcome_label: "Low birth weight",
  climate_hazard: null,
  climate_hazard_label: null,
  health_domain: null,
  health_domain_label: null,
  status: "active",
  activated_at: null,
  created_at: "2026-01-01T00:00:00Z",
  model_files: [],
  area_count: 1,
  manifest_source_path: null,
  base_uri: null,
  source_git_ref: null,
  release_notes: null,
  is_active: true,
};
