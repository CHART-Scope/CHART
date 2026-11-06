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

test("an account an administrator adds has no password, signs in by email and stops when disabled", async ({
  browser,
  request,
}) => {
  const headers = await adminHeaders(request);
  const email = `added-planner-${Date.now()}@example.invalid`;
  const created = await request.post(`${api}/users`, {
    headers,
    data: {
      name: "Added Planner",
      email,
      username: email,
      roles: ["health_planning_lead"],
      geographyIds: ["geo-ke-kajiado"],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { userId } = await created.json();

  const first = await browser.newPage();
  await signInWithEmailCode(first, email);
  await first.close();

  const disabled = await request.post(`${api}/users/${userId}/disable`, { headers });
  expect(disabled.ok()).toBe(true);
  const people = await request.get(`${api}/users`, { headers });
  const person = (await people.json()).find(
    (item: { userId: string }) => item.userId === userId,
  );
  expect(person.status).toBe("disabled");

  const second = await browser.newPage();
  const sent = await inboxCount(second, email);
  await second.goto("/auth/signin");
  await second.getByLabel("Email address").fill(email);
  await second.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    second.getByText("This account is turned off. Ask your CHART administrator."),
  ).toBeVisible();
  await second.waitForTimeout(3_000);
  expect(await inboxCount(second, email)).toBe(sent);
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
  await expect(page.getByRole("heading", { name: "Sign in to CHART" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to CHART" })).toHaveAttribute(
    "href",
    new RegExp(`^${process.env.CHART_E2E_ORIGIN}`),
  );
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await page.close();
});

test("an administrator invites someone, who accepts from the email and lands on their dashboard", async ({
  browser,
  request,
}) => {
  test.setTimeout(150_000);
  const email = `invited-${Date.now()}@example.invalid`;
  const admin = await browser.newPage();
  await signInWithEmailCode(admin, "typography-admin");
  await admin.goto("/settings?tab=users");
  const form = admin.getByRole("form", { name: "Invite a person" });
  await form.getByLabel("Full name").fill("Invited Planner");
  await form.getByLabel("Email address").fill(email);
  await form.getByRole("combobox", { name: "Planning area" }).click();
  await admin.getByRole("option", { name: /^Kajiado · / }).click();
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByRole("status")).toHaveText(`Invitation sent to ${email}.`);
  await admin.screenshot({ path: `${evidence}/people-invited.png`, fullPage: true });

  // Persisted: the account exists, active, with the chosen role and area.
  const people = await request.get(`${api}/users`, {
    headers: await adminHeaders(request),
  });
  const person = (await people.json()).find(
    (item: { email?: string }) => item.email === email,
  );
  expect(person).toMatchObject({ status: "active", roles: ["health_planning_lead"] });
  expect(person.geographyScopes.map((scope: { name: string }) => scope.name)).toEqual([
    "Kajiado",
  ]);

  const invitation = await newestEmail(admin, email);
  expect(invitation.Subject).toBe("You are invited to CHART");
  const link = invitation.Text.match(/https?:\/\/\S+/)![0];

  // "Send invitation again" emails a second, working invitation.
  await admin
    .getByRole("button", { name: `Send invitation again to ${email}` })
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
  await invitee.getByRole("link", { name: "Sign in to CHART" }).click();
  await expect(
    invitee.getByRole("heading", { name: "Sign in to CHART" }),
  ).toBeVisible();
  await signInWithEmailCode(invitee, email);
  await invitee.waitForURL(/\/dashboard\/geo-ke/);
  await invitee.close();
});

test("the Keycloak administration sign-in carries CHART's look", async ({ page }) => {
  await page.goto(`${process.env.CHART_E2E_IDENTITY}/admin/master/console/`);
  await expect(page.getByRole("heading", { name: "Sign in to CHART" })).toBeVisible();
  await expect(page.locator("#kc-header-wrapper")).toHaveText("CHART");
  await expect(page.locator("#kc-header")).toHaveCSS(
    "background-color",
    "rgb(43, 45, 49)",
  );
  await page.screenshot({ path: `${evidence}/keycloak-admin-sign-in.png` });
});
