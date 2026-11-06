import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  enterCode,
  inboxCount,
  inboxOf,
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
  await expect(page.getByText("Invalid code")).toBeVisible();
  await expect(page).not.toHaveURL(/\/(plan|dashboard)/);

  await enterCode(page, code);
  await page.waitForURL(/\/(plan|dashboard)/);
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
    second.getByText("Account is disabled, contact your administrator."),
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
  await expect(page.getByText("Invalid username or email.")).toBeVisible();
  await expect(page.getByLabel("Your access code")).toHaveCount(0);
  await page.waitForTimeout(3_000);
  expect(await inboxCount(page, email)).toBe(0);
});
