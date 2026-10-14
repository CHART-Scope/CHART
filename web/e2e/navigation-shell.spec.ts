import { expect, test, type Page } from "@playwright/test";

import {
  FALLBACK_RESOURCES,
  FALLBACK_TRACKS,
} from "../src/features/learning/data/fallback";
import { accessToken, installFakeApi, json, type FakeApi } from "./support/fakeApi";

// Failure modes: the sidebar unmounting (and the page blanking) on every
// sidebar click, the full-page "Loading" card on client navigation, the bare
// card instead of the shell on a hard load, the signed-out Learning header
// flashing for a signed-in reader, and role/planning-area guards lost when
// they moved from the pages to the shared layout.

type ShellWatch = {
  tagged: boolean;
  replaced: number;
  absent: number;
  fullPageLoading: number;
  signInButton: number;
};

/**
 * Watches the DOM from the first byte. Every mutation checks that the sidebar
 * captured by `tagSidebar()` is still the one in the document, that no
 * full-page auth card ("Loading" / "Opening sign in") is shown, and that no
 * public "Sign in" button is rendered.
 */
async function watchShell(page: Page) {
  await page.addInitScript(() => {
    const watch = {
      tagged: false,
      replaced: 0,
      absent: 0,
      fullPageLoading: 0,
      signInButton: 0,
      node: null as Element | null,
    };
    (window as unknown as { __shell: typeof watch }).__shell = watch;
    const check = () => {
      const nav = document.getElementById("app-shell-nav");
      if (watch.tagged) {
        if (!nav) watch.absent += 1;
        else if (nav !== watch.node) watch.replaced += 1;
      }
      for (const heading of document.querySelectorAll("main section h1")) {
        if (/^(Loading|Opening sign in)$/.test(heading.textContent ?? "")) {
          watch.fullPageLoading += 1;
        }
      }
      for (const button of document.querySelectorAll("button")) {
        if (button.textContent?.trim() === "Sign in") watch.signInButton += 1;
      }
    };
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

async function tagSidebar(page: Page) {
  await page.evaluate(() => {
    const watch = (window as unknown as { __shell: { tagged: boolean; node: Element } })
      .__shell;
    watch.node = document.getElementById("app-shell-nav")!;
    watch.tagged = true;
  });
}

async function shellWatch(page: Page): Promise<ShellWatch> {
  return page.evaluate(() => {
    const { node: _node, ...rest } = (
      window as unknown as { __shell: ShellWatch & { node: unknown } }
    ).__shell;
    return rest;
  });
}

async function signInAs(
  page: Page,
  user: { roles: string[]; geographyScopes: string[] },
): Promise<FakeApi> {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, { userId: "e2e-admin", username: "admin", ...user }),
  );
  api.on(/^\/api\/chart\/learning\/resources$/, (route) =>
    json(route, { items: FALLBACK_RESOURCES, total: FALLBACK_RESOURCES.length }),
  );
  api.on(/^\/api\/chart\/learning\/tracks$/, (route) =>
    json(route, { tracks: FALLBACK_TRACKS }),
  );
  return api;
}

const admin = { roles: ["chart_admin"], geographyScopes: ["/india"] };

// Evidence screenshots wait for the entrance animations to finish.
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

test("sidebar navigation keeps one shell mounted across workspace pages", async ({
  page,
}) => {
  await watchShell(page);
  const api = await signInAs(page, admin);
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");
  const nav = page.getByRole("navigation", { name: "Main" });
  const entry = (name: string) => nav.getByRole("link", { name, exact: true });
  await expect(entry("Start planning")).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("combobox", { name: "State", exact: true }),
  ).toBeVisible();
  await tagSidebar(page);
  await page.screenshot({
    path: "../outputs/e2e/web/navigation-shell-1-dashboard.png",
  });

  await entry("Settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(entry("Settings")).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Planning location")).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: "../outputs/e2e/web/navigation-shell-2-settings.png",
    animations: "disabled",
  });

  await entry("Learning hub").click();
  await expect(page).toHaveURL(/\/learning$/);
  await expect(entry("Learning hub")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("searchbox", { name: "Search videos" })).toBeVisible();
  await page.screenshot({ path: "../outputs/e2e/web/navigation-shell-3-learning.png" });

  await entry("Start planning").click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByText("in Madhya Pradesh.")).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: "../outputs/e2e/web/navigation-shell-4-plan.png",
    animations: "disabled",
  });

  expect(await shellWatch(page)).toEqual({
    tagged: true,
    replaced: 0,
    absent: 0,
    fullPageLoading: 0,
    signInButton: 0,
  });
  // The session was restored once for the whole visit, not once per page.
  expect(api.requests.filter((r) => r.includes("/keycloak-refresh"))).toHaveLength(1);
});

test("a hard load draws the shell while the session is restored", async ({ page }) => {
  await watchShell(page);
  const api = await signInAs(page, admin);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  api.on(/^\/api\/auth\/keycloak-refresh$/, async (route) => {
    await held;
    return json(route, { access_token: accessToken });
  });

  await page.goto("/settings");
  // Shell frame with its nav in skeleton and the settings placeholder - not
  // the bare "Loading" card.
  await expect(page.locator("#app-shell-nav")).toBeVisible();
  await expect(page.locator("#app-shell-main [aria-busy='true']")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await tagSidebar(page);
  await page.screenshot({
    path: "../outputs/e2e/web/navigation-shell-restoring-settings.png",
  });

  release();
  await expect(page.getByText("Planning location")).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await shellWatch(page)).toMatchObject({
    replaced: 0,
    absent: 0,
    fullPageLoading: 0,
  });
});

test("signed-in Learning hub never shows the public Sign in header", async ({
  page,
}) => {
  await watchShell(page);
  const api = await signInAs(page, admin);
  await page.goto("/learning");
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", {
      name: "Learning hub",
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("searchbox", { name: "Search videos" })).toBeVisible();
  await page.screenshot({
    path: "../outputs/e2e/web/navigation-shell-signed-in-learning.png",
  });
  expect((await shellWatch(page)).signInButton).toBe(0);
  expect(api.unhandled).toEqual([]);
});

test("route guards still apply inside the shared shell", async ({ page }) => {
  // A planner without the admin role may use Settings (model settings) but
  // not model release management, which sends them back to Settings.
  await signInAs(page, {
    roles: ["health_planning_lead"],
    geographyScopes: ["/india"],
  });
  await page.goto("/settings/models");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Models" })).toHaveCount(0);
});

test("an account without a planning area lands on access-pending", async ({ page }) => {
  await signInAs(page, { roles: ["health_planning_lead"], geographyScopes: [] });
  await page.goto("/dashboard/geo-in-mp?outcome=lbw");
  await expect(page).toHaveURL(/\/access-pending$/);
  await expect(
    page.getByRole("heading", { name: "Your account has not been invited yet" }),
  ).toBeVisible();
});
