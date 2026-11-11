import { expect, test, type Page } from "@playwright/test";

import { type FakeApi, installFakeApi, json } from "./support/fakeApi";
import { type FakeUpstream, startFakeUpstream } from "./support/fakeUpstream";

// Settings → Users invites people. (Next's route announcer is also an
// alert, so alerts are matched by their text.) The browser's calls go through the real
// Next admin proxy (/api/admin/users…) to a fake core, so these specs cover
// the proxy routes, what the form sends, and what an administrator is told.

const evidence = "../outputs/e2e/web/people";
let upstream: FakeUpstream;

test.beforeAll(async () => {
  upstream = await startFakeUpstream();
});
test.afterAll(async () => {
  await upstream.close();
});
test.beforeEach(() => upstream.reset());

const grace = {
  userId: "user-grace",
  username: "grace@example.org",
  email: "grace@example.org",
  displayName: "Grace Wanjiru",
  status: "active",
  roles: ["health_planning_lead"],
  geographyScopes: [
    {
      geographyId: "geo-in-mp",
      path: "/india/madhya-pradesh",
      name: "Madhya Pradesh",
      levelLabel: "State",
    },
  ],
};

async function openUsers(
  page: Page,
  roles = ["chart_admin", "health_planning_lead"],
  geographies?: unknown[],
) {
  const api: FakeApi = await installFakeApi(page);
  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "e2e-admin",
      username: "admin",
      roles,
      geographyScopes: ["/india"],
    }),
  );
  if (geographies) {
    api.on(/^\/api\/chart\/geographies$/, (route) => json(route, geographies));
  }
  api.on(/^\/api\/admin\/users(\/.*)?$/, (route) => route.continue());
  upstream.on("GET", "/users", (request) =>
    request.headers.authorization?.startsWith("Bearer ")
      ? { status: 200, body: [] }
      : { status: 401, body: { error: "AUTH_TOKEN_REQUIRED" } },
  );
  await page.goto("/settings?tab=users");
  await expect(page.getByRole("heading", { name: "People and access" })).toBeVisible();
  return api;
}

async function fill(page: Page, email = "grace@example.org") {
  const form = page.getByRole("form", { name: "Invite a person" });
  await form.getByLabel("Full name").fill("Grace Wanjiru");
  await form.getByLabel("Email address").fill(email);
  await form.getByRole("combobox", { name: "Planning area" }).click();
  await page.getByRole("option", { name: "Madhya Pradesh · State" }).click();
  return form;
}

test("an administrator invites a person, who appears with their role and area", async ({
  page,
}) => {
  await openUsers(page);
  upstream.on("POST", "/users", (request) =>
    request.headers.authorization?.startsWith("Bearer ")
      ? { status: 200, body: { ...grace, invitation: "sent" } }
      : { status: 401, body: { error: "AUTH_TOKEN_REQUIRED" } },
  );

  await expect(page.getByText(/there are no\s+passwords/)).toBeVisible();
  const form = await fill(page, "  Grace@Example.org ");
  const send = form.getByRole("button", { name: "Send invitation" });
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page.getByRole("status")).toHaveText(
    "Invitation sent to grace@example.org.",
  );
  await expect(page.getByText("Grace Wanjiru")).toBeVisible();
  await expect(page.getByText("Health planning lead · Madhya Pradesh")).toBeVisible();
  await expect(form.getByLabel("Email address")).toHaveValue("");
  const sent = upstream.requests.find((request) => request.method === "POST");
  expect(JSON.parse(sent!.body)).toEqual({
    name: "Grace Wanjiru",
    email: "grace@example.org",
    username: "grace@example.org",
    roles: ["health_planning_lead"],
    geographyIds: ["geo-in-mp"],
  });
  await page.screenshot({ path: `${evidence}/invited.png`, fullPage: true });
});

test("the form waits for a name, a real email address and an area", async ({
  page,
}) => {
  await openUsers(page);
  const form = page.getByRole("form", { name: "Invite a person" });
  const send = form.getByRole("button", { name: "Send invitation" });
  await expect(send).toBeDisabled();
  await form.getByLabel("Full name").fill("Grace Wanjiru");
  await form.getByLabel("Email address").fill("grace");
  await expect(send).toBeDisabled();
  await form.getByLabel("Email address").fill("grace@example.org");
  await expect(send).toBeDisabled();
  await form.getByRole("combobox", { name: "Planning area" }).click();
  await page.getByRole("option", { name: "Madhya Pradesh · State" }).click();
  await expect(send).toBeEnabled();
  expect(upstream.requests.filter((request) => request.method === "POST")).toEqual([]);
});

test("a taken address, a failed email and a failed resend each say what to do", async ({
  page,
}) => {
  await openUsers(page);
  upstream.on("POST", "/users", () => ({
    status: 409,
    body: { error: "USER_IDENTITY_USER_CONFLICT" },
  }));
  const form = await fill(page);
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "An account already uses that email address.",
  );
  // Nothing was added, and what was typed stays to be corrected.
  await expect(page.getByText("No one has been invited yet.")).toBeVisible();
  await expect(form.getByLabel("Email address")).toHaveValue("grace@example.org");

  upstream.on("POST", "/users", () => ({
    status: 200,
    body: { ...grace, invitation: "failed" },
  }));
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "grace@example.org was added, but the invitation email could not be sent.",
    }),
  ).toBeVisible();

  upstream.on("POST", "/users/user-grace/invitation", () => ({
    status: 502,
    body: { error: "USER_INVITE_FAILED" },
  }));
  await page
    .getByRole("button", { name: "Send invitation again to grace@example.org" })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "The invitation email could not be sent. Check CHART's email settings, then try again.",
    }),
  ).toBeVisible();

  upstream.on("POST", "/users/user-grace/invitation", () => ({
    status: 200,
    body: { ...grace, invitation: "sent" },
  }));
  await page
    .getByRole("button", { name: "Send invitation again to grace@example.org" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Invitation sent again to grace@example.org.",
  );
});

test("areas come from the hierarchy: a country and its first level, never deeper", async ({
  page,
}) => {
  // Real paths carry level words, so depth cannot be read from the path.
  const geo = (
    id: string,
    name: string,
    levelLabel: string,
    path: string,
    parentId: string | null,
  ) => ({ id, name, levelLabel, path, parentId, models: [] });
  await openUsers(page, undefined, [
    geo("geo-ke", "Kenya", "Country", "/kenya", null),
    geo("geo-ke-kajiado", "Kajiado", "County", "/kenya/county/kajiado", "geo-ke"),
    geo(
      "geo-ke-kc",
      "Kajiado Central",
      "Constituency",
      "/kenya/county/kajiado/constituency/kajiado-central",
      "geo-ke-kajiado",
    ),
  ]);
  await page.getByRole("combobox", { name: "Planning area" }).click();
  const options = page
    .getByRole("listbox", { name: "Planning area" })
    .getByRole("option");
  await expect(options).toHaveText([
    /Choose an area/,
    "Kenya · Country",
    "Kajiado · County",
  ]);
});

test("someone who is not an administrator is told so and cannot invite", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "e2e-planner",
      username: "planner",
      roles: ["health_planning_lead"],
      geographyScopes: ["/india"],
    }),
  );
  await page.goto("/settings?tab=users");
  // The Users tab is administrators' only; the page falls back to Workspace.
  await expect(page).not.toHaveURL(/tab=users/);
  await expect(page.getByRole("form", { name: "Invite a person" })).toHaveCount(0);
});
