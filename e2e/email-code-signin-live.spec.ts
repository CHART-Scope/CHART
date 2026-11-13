import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  enterCode,
  inboxCount,
  inboxOf,
  newestEmail,
  requestSignInCode,
  signInWithEmailCode,
} from "./emailCode";

const api = process.env.CHART_E2E_API!;
const evidence = process.env.CHART_E2E_EVIDENCE!;

// API calls only; browsers in this suite sign in with emailed codes.
async function adminHeaders(request: APIRequestContext) {
  const response = await request.post(
    `${process.env.CHART_E2E_IDENTITY}/realms/chart/protocol/openid-connect/token`,
    {
      form: {
        grant_type: "password",
        client_id: "chart-web",
        username: "typography-admin",
        password: process.env.CHART_E2E_PASSWORD!,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return { authorization: `Bearer ${(await response.json()).access_token}` };
}

/** Kenya's workspace and its role ids, as the platform admin reads them. */
async function kenya(request: APIRequestContext, headers: Record<string, string>) {
  const workspaces = await (await request.get(`${api}/workspaces`, { headers })).json();
  const workspace = workspaces.items.find(
    (item: { country_code: string }) => item.country_code === "KE",
  );
  const roles = await (
    await request.get(`${api}/workspaces/${workspace.id}/roles`, { headers })
  ).json();
  const roleId = (key: string) =>
    roles.items.find((role: { key: string }) => role.key === key).id;
  return { id: workspace.id as string, roleId };
}

test("a wrong code is refused and the emailed code signs the planner in", async ({
  page,
}) => {
  const code = await requestSignInCode(page, "kenya-planner");
  await enterCode(page, code === "222222" ? "333333" : "222222");
  await expect(
    page.getByText("That code is not right. Check the latest email and try again."),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/(plan|dashboard)/);

  await enterCode(page, code);
  // Straight to the dashboard of the planner's own area.
  await page.waitForURL(/\/dashboard\/geo-ke/);
  await page.screenshot({ path: `${evidence}/email-code-signed-in.png` });
});

test("a code typed by hand in lowercase, with spaces, signs the planner in", async ({
  page,
}) => {
  const code = await requestSignInCode(page, "kenya-planner");
  const field = page.getByLabel("Your access code");
  const typed = ` ${code.slice(0, 3)} ${code.slice(3)} `.toLowerCase();
  await field.pressSequentially(typed);
  await expect(field).toHaveValue(code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/dashboard\/geo-ke/);
});

test("an invited address has no password, signs in by email, and holds nothing once disabled", async ({
  browser,
  request,
}) => {
  const headers = await adminHeaders(request);
  const email = `added-planner-${Date.now()}@example.invalid`;
  const workspace = await kenya(request, headers);
  const invited = await request.post(`${api}/workspaces/${workspace.id}/invitations`, {
    headers,
    data: {
      name: "Added Planner",
      email,
      grants: [
        { role_id: workspace.roleId("planning_lead"), geography_id: "geo-ke-kajiado" },
      ],
      department_ids: [],
      new_departments: [],
    },
  });
  expect(invited.status(), await invited.text()).toBe(201);
  expect((await invited.json()).status).toBe("pending");

  // The first sign-in accepts the invitation: Kajiado's dashboard.
  const first = await browser.newPage();
  await signInWithEmailCode(first, email);
  await first.waitForURL(/\/dashboard\/geo-ke/);
  await first.close();
  const members = await (
    await request.get(`${api}/workspaces/${workspace.id}/members`, { headers })
  ).json();
  const member = members.items.find((item: { email: string }) => item.email === email);
  expect(
    member.grants.map((grant: { place_name: string }) => grant.place_name),
  ).toEqual(["Kajiado"]);

  const disabled = await request.post(
    `${api}/workspaces/${workspace.id}/members/${member.user_id}/disable`,
    { headers },
  );
  expect((await disabled.json()).status).toBe("disabled");

  // Their sessions ended; signing in again opens nothing but the public map.
  const second = await browser.newPage();
  await signInWithEmailCode(second, email);
  await second.waitForURL(/\/explore/);
  await second.close();
});

test("an address with no account is refused and gets no email", async ({ page }) => {
  const email = inboxOf(`nobody-${Date.now()}`);
  await page.goto("/auth/signin");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByText(
      "No CHART account uses that email address. Ask your CHART administrator to add you.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Your access code")).toHaveCount(0);
  await page.waitForTimeout(3_000);
  expect(await inboxCount(page, email)).toBe(0);
});

test("on a phone the sign-in screens fit, say where the code went and let you start over", async ({
  browser,
}) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const code = await requestSignInCode(page, "india-planner");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(
    page.getByText(/We sent a 6-character code to in\*+@ex\*+\.invalid/),
  ).toBeVisible();
  // Keycloak's read-only address-and-restart row is replaced by one link.
  await expect(page.locator("#kc-attempted-username")).toBeHidden();
  const field = page.getByLabel("Your access code");
  await expect(field).toHaveCSS("font-size", "24px");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.screenshot({ path: `${evidence}/email-code-phone.png` });

  await page.getByRole("link", { name: "Use a different email" }).click();
  await expect(page.getByRole("heading", { name: "CHART login" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to CHART" })).toHaveAttribute(
    "href",
    new RegExp(`^${process.env.CHART_E2E_ORIGIN}`),
  );
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await page.close();
});

test("a workspace admin invites someone, who accepts from the email and lands on their dashboard", async ({
  browser,
  request,
}) => {
  test.setTimeout(150_000);
  const email = `invited-${Date.now()}@example.invalid`;
  const admin = await browser.newPage();
  await signInWithEmailCode(admin, "typography-admin");
  await admin.goto("/settings?tab=people");
  await admin.getByRole("combobox", { name: "Workspace" }).click();
  await admin.getByRole("option", { name: "Kenya", exact: true }).click();
  await admin.getByRole("button", { name: "Invite someone" }).click();
  const form = admin.getByRole("dialog");
  await form.getByLabel("Full name").fill("Invited Planner");
  await form.getByLabel("Email").fill(email);
  const grant = form.getByRole("group", { name: "Grant 1" });
  await grant.getByRole("combobox", { name: "Role", exact: true }).click();
  await admin.getByRole("option", { name: /^Planning lead/ }).click();
  await grant.getByRole("combobox", { name: "Place", exact: true }).click();
  await admin.getByRole("option", { name: /^Kajiado/ }).click();
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByRole("status")).toHaveText(`Invitation sent to ${email}.`);
  await admin.screenshot({ path: `${evidence}/people-invited.png`, fullPage: true });

  // Persisted: a pending invitation for Kajiado.
  const headers = await adminHeaders(request);
  const workspace = await kenya(request, headers);
  const listed = await (
    await request.get(`${api}/workspaces/${workspace.id}/invitations`, { headers })
  ).json();
  const pending = listed.items.find((item: { email: string }) => item.email === email);
  expect(pending.status).toBe("pending");
  expect(
    pending.grants.map((grant: { place_name: string }) => grant.place_name),
  ).toEqual(["Kajiado"]);

  const invitation = await newestEmail(admin, email);
  expect(invitation.Subject).toBe("You are invited to CHART");
  const link = invitation.Text.match(/https?:\/\/\S+/)![0];

  // Resend emails a second, working invitation.
  await admin
    .getByRole("list", { name: "Invitations" })
    .getByRole("listitem", { name: email })
    .getByRole("button", { name: "Resend" })
    .click();
  await expect(admin.getByRole("status")).toHaveText(
    `Invitation sent again to ${email}.`,
  );
  await newestEmail(admin, email, 1);
  await admin.close();

  const invitee = await browser.newPage();
  await invitee.goto(link);
  await expect(
    invitee.getByRole("heading", { name: "Accept your CHART invitation" }),
  ).toBeVisible();
  await invitee.getByRole("link", { name: "Accept invitation" }).click();
  await expect(
    invitee.getByRole("heading", { name: "Invitation accepted" }),
  ).toBeVisible();
  await invitee.getByRole("link", { name: "Go to CHART login" }).click();
  await expect(invitee.getByRole("heading", { name: "CHART login" })).toBeVisible();
  await signInWithEmailCode(invitee, email);
  await invitee.waitForURL(/\/dashboard\/geo-ke/);
  await invitee.close();
});

test("the Keycloak administration sign-in carries CHART's look", async ({ page }) => {
  await page.goto(`${process.env.CHART_E2E_IDENTITY}/admin/master/console/`);
  await expect(page.getByRole("heading", { name: "CHART admin" })).toBeVisible();
  await expect(page.locator("#kc-header-wrapper")).toHaveText("CHART");
  await expect(page.locator("#kc-header")).toHaveCSS(
    "background-color",
    "rgb(43, 45, 49)",
  );
  await page.screenshot({ path: `${evidence}/keycloak-admin-sign-in.png` });
});

test("the seeded admin signs in with admin/admin, must choose a password, and gains nothing once a platform admin exists", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await page.goto("/auth/signin");
  await page.getByLabel("Email address").fill("admin");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  // An account with a password is asked for it; no code is emailed.
  await expect(page.getByRole("heading", { name: "CHART admin" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("New Password").fill("e2e-admin-chosen-password");
  await page.getByLabel("Confirm password").fill("e2e-admin-chosen-password");
  await page.getByRole("button", { name: "Submit" }).click();
  // Keycloak's chart_admin only bootstraps the first platform admin; this
  // installation has one, so the seeded account opens the public map only.
  await page.waitForURL(/\/explore/);
  await page.goto("/settings?tab=people");
  await page.waitForURL(/\/explore/);
  await page.screenshot({
    path: `${evidence}/seeded-admin-no-access.png`,
    fullPage: true,
  });
  await page.close();

  // The first password is gone: admin/admin no longer signs in.
  const again = await browser.newPage();
  await again.goto("/auth/signin");
  await again.getByLabel("Email address").fill("admin");
  await again.getByRole("button", { name: "Log in", exact: true }).click();
  await again.getByLabel("Password", { exact: true }).fill("admin");
  await again.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(again.getByText(/Invalid (username or )?password/)).toBeVisible();
  await again.close();
});
