import { expect, type Page } from "@playwright/test";

// Keycloak emails each sign-in code; the harness's Mailpit receives it.
const mailpit = process.env.CHART_E2E_MAILPIT!;

type MailSummary = { ID: string; Created: string };

export function inboxOf(account: string) {
  return account.includes("@") ? account : `${account}@example.invalid`;
}

async function inbox(page: Page, email: string) {
  const query = encodeURIComponent(`to:"${email}"`);
  const search = await page.request.get(`${mailpit}/api/v1/search?query=${query}`);
  expect(search.ok()).toBe(true);
  return ((await search.json()) as { messages: MailSummary[] }).messages;
}

export async function inboxCount(page: Page, email: string) {
  return (await inbox(page, email)).length;
}

/** Codes sent to `email` since `since` (ms), newest first. */
async function codesSince(page: Page, email: string, since: number) {
  const messages = await inbox(page, email);
  const codes: string[] = [];
  for (const message of messages) {
    if (Date.parse(message.Created) < since - 1000) continue;
    const full = await page.request.get(`${mailpit}/api/v1/message/${message.ID}`);
    const { Text } = (await full.json()) as { Text: string };
    const code = Text.match(/access code is:\s*([A-Z0-9]{6})/)?.[1];
    if (code) codes.push(code);
  }
  return codes;
}

/** Asks Keycloak for a code and returns the one emailed. */
export async function requestSignInCode(page: Page, account: string) {
  const since = Date.now();
  await page.goto("/auth/signin");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  // People sign in with their address; the field only takes an email.
  await page.getByLabel("Email address").fill(inboxOf(account));
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Your access code")).toBeVisible();
  let code: string | undefined;
  await expect(async () => {
    code = (await codesSince(page, inboxOf(account), since))[0];
    expect(code).toBeTruthy();
  }).toPass({ timeout: 20_000 });
  return code!;
}

export async function enterCode(page: Page, code: string) {
  await page.getByLabel("Your access code").fill(code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

export async function signInWithEmailCode(page: Page, account: string) {
  await enterCode(page, await requestSignInCode(page, account));
  await page.waitForURL(/\/(plan|dashboard)/);
}
