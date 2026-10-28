import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const evidence = process.env.CHART_E2E_EVIDENCE!;
const fixtures = () =>
  JSON.parse(readFileSync(`${evidence}/browser-fixture.json`, "utf8"));

// The real browser cannot reach the old font hosts: typography must load from
// the app and identity server themselves, with no mocked application requests.
test.use({
  launchOptions: {
    args: [
      "--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND",
    ],
  },
});

test("production web package serves every bundled font license", async ({
  request,
}) => {
  for (const family of ["fira-sans", "noto-sans-display", "jetbrains-mono"]) {
    const response = await request.get(`/fonts/${family}-OFL.txt`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
  }
});

async function typography(locator: Locator, family: "Fira" | "Noto", size: number) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS("font-family", new RegExp(family));
  await expect(locator).toHaveCSS("font-size", `${size}px`);
}

async function dropdownSpacing(locator: Locator, compact = false) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS("padding", compact ? "4px 8px" : "8px 12px");
  await expect(locator).toHaveCSS("min-height", compact ? "32px" : "42px");
  await expect(locator).toHaveCSS("column-gap", "8px");
}

async function capture(page: Page, name: string, workspace = false) {
  if (workspace) {
    await expect(page.locator('#app-shell-nav a[href="/plan"]')).toBeAttached();
    if (page.viewportSize()!.width <= 900) {
      await expect(
        page.getByRole("button", { name: "Show navigation", exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
    }
    const content = await page.locator("#app-shell-main").evaluate((element) => ({
      width: element.clientWidth,
      content: element.scrollWidth,
    }));
    expect(
      content.content,
      `${name}: workspace content should not be clipped horizontally`,
    ).toBeLessThanOrEqual(content.width + 1);
  }
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() =>
    Array.from(document.fonts).map((face) => ({
      family: face.family,
      status: face.status,
      weight: face.weight,
    })),
  );
  const resources = await page.evaluate(() => ({
    origin: location.origin,
    fonts: performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /\.woff2?(?:\?|$)/.test(url)),
    google: performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),
  }));
  writeFileSync(
    `${evidence}/typography-${name}-font-resources.json`,
    JSON.stringify(resources, null, 2),
  );
  expect(resources.google, `${name}: Google Fonts must not be requested`).toEqual([]);
  expect(
    resources.fonts.length,
    `${name}: local font files must load`,
  ).toBeGreaterThanOrEqual(2);
  expect(
    resources.fonts.every((url) => new URL(url).origin === resources.origin),
    `${name}: fonts must share the page's origin`,
  ).toBe(true);
  writeFileSync(
    `${evidence}/typography-${name}-fonts.json`,
    JSON.stringify(fonts, null, 2),
  );
  for (const family of ["Fira Sans", "Noto Sans Display"]) {
    expect(
      fonts.some(
        (face) =>
          face.family.replaceAll('"', "") === family && face.status === "loaded",
      ),
      `${name}: ${family} must load, not merely appear in the CSS fallback stack`,
    ).toBe(true);
  }
  await expect(page.locator("body")).toHaveCSS("font-size", "13px");
  await expect(page.locator("body")).toHaveCSS("line-height", "20.8px");
  await expect(page.locator("body")).toHaveCSS("font-family", /Noto Sans Display/);
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(
    width.content,
    `${name}: page should fit without horizontal scrolling`,
  ).toBeLessThanOrEqual(width.viewport + 1);
  await page.screenshot({
    path: `${evidence}/typography-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

async function publicLearningBounds(page: Page) {
  for (const element of [
    page.getByRole("heading", { level: 1 }),
    page.getByRole("searchbox", { name: "Search videos" }),
  ]) {
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(16);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width - 16,
    );
  }
}

async function breadcrumbBounds(page: Page) {
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
  await expect(breadcrumb).toBeVisible();
  // Route data can replace breadcrumb children after the container is visible.
  // Re-read the whole layout until every original geometry assertion holds.
  await expect(async () => {
    const bounds = await breadcrumb.boundingBox();
    expect(bounds).not.toBeNull();
    const children = await breadcrumb.locator(":scope > span").all();
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      const item = await child.boundingBox();
      expect(item).not.toBeNull();
      expect(item!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
      expect(item!.x + item!.width).toBeLessThanOrEqual(
        Math.min(bounds!.x + bounds!.width, page.viewportSize()!.width) + 1,
      );
      expect(
        await child.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
    }
  }).toPass({ timeout: 10_000 });
}

async function signIn(page: Page, username = "india-planner") {
  await page.goto("/auth/signin");
  await typography(page.locator("#kc-page-title"), "Fira", 20);
  await typography(
    page.locator('label[for="username"] .pf-v5-c-form__label-text'),
    "Fira",
    11,
  );
  await typography(page.getByLabel("Email address"), "Noto", 13);
  await capture(page, `signin-${username}-${page.viewportSize()!.width}`);
  await page.getByLabel("Email address").fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.CHART_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/(plan|dashboard)/);
}

test("sign-in failure keeps the themed form readable and retryable", async ({
  page,
}) => {
  await page.goto("/auth/signin");
  await page.getByLabel("Email address").fill("missing-typography-account");
  await page
    .getByLabel("Password", { exact: true })
    .fill("invalid-disposable-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByText("Invalid username or password.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill("");
  await page.getByLabel("Password", { exact: true }).fill("");
  await typography(page.locator("#kc-page-title"), "Fira", 20);
  await capture(page, "signin-error");
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`${name}: shared typography across public and authenticated journeys`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await typography(page.getByRole("heading", { level: 1 }), "Fira", 28);
    await typography(
      page.getByRole("heading", { name: "Explore the CHART toolkit" }),
      "Fira",
      19,
    );
    await typography(
      page.getByRole("heading", { name: "Learning Hub", exact: true }),
      "Fira",
      15,
    );
    await capture(page, `${name}-landing`);

    await page.goto("/learning");
    await typography(
      page.getByRole("heading", { name: "Learn the case you need to make" }),
      "Fira",
      20,
    );
    await typography(
      page.getByRole("heading", { name: "What would you like to plan for, together?" }),
      "Fira",
      19,
    );
    const search = page.getByRole("searchbox", { name: "Search videos" });
    await typography(search, "Noto", 13);
    await publicLearningBounds(page);
    await capture(page, `${name}-learning`);
    if (name === "mobile") {
      await page.setViewportSize({ width: 360, height });
      await publicLearningBounds(page);
      await capture(page, "narrow-learning-public");
      await page.setViewportSize({ width, height });
    }
    await page.getByRole("article").first().getByRole("button").click();
    const player = page.getByRole("dialog");
    const playerTitleId = await player.getAttribute("aria-labelledby");
    expect(playerTitleId).toBeTruthy();
    await typography(page.locator(`[id="${playerTitleId}"]`), "Fira", 15);
    await capture(page, `${name}-learning-modal`);
    await page.keyboard.press("Escape");
    await expect(player).not.toBeVisible();
    await search.fill("no-such-learning-resource-typography-check");
    await expect(page.getByRole("status")).toContainText("Nothing here");
    await capture(page, `${name}-learning-empty`);

    // The unconfigured disposable installation exercises the real setup boundary.
    await page.goto("/onboarding");
    const setupHeading = page.getByText("What geography do you represent?", {
      exact: true,
    });
    await typography(setupHeading, "Fira", 20);
    await typography(
      page.getByRole("heading", { name: "Find your role in the CHART workspace" }),
      "Fira",
      15,
    );
    await typography(page.getByRole("combobox"), "Noto", 14);
    await dropdownSpacing(page.getByRole("combobox"));
    await capture(page, `${name}-onboarding`);

    await signIn(page);
    await page.goto("/plan");
    await typography(
      page.getByRole("heading", { name: "What would you like to plan for, together?" }),
      "Fira",
      20,
    );
    await typography(
      page.getByRole("heading", { name: "Saved scenarios" }),
      "Fira",
      11,
    );
    const hazard = page.getByRole("combobox", { name: "Choose the climate hazard" });
    await expect(hazard).toBeEnabled();
    await typography(hazard, "Noto", 14);
    await dropdownSpacing(hazard);
    await hazard.click();
    await typography(
      page.getByRole("option", { name: "Extreme heat", exact: true }),
      "Noto",
      13,
    );
    await page.keyboard.press("Escape");
    await capture(page, `${name}-planning`, true);

    await page.goto("/settings");
    await typography(
      page.getByRole("heading", { name: "Shape how CHART plans with you" }),
      "Fira",
      20,
    );
    await typography(
      page.getByRole("heading", { name: "Planning location" }),
      "Fira",
      15,
    );
    await typography(
      page.getByRole("heading", { name: "What the dashboard offers" }),
      "Fira",
      15,
    );
    await expect(
      page.getByRole("button", { name: "Save Low birth weight" }),
    ).toBeVisible();
    await dropdownSpacing(page.getByRole("combobox", { name: "Active context" }));
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/model-settings/") &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save Low birth weight" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Save Low birth weight" }),
    ).toBeVisible();
    await capture(page, `${name}-settings`, true);

    const place = fixtures().IN;
    const query = `admin_unit=${place.id}&outcome=lbw`;
    await page.goto(`/dashboard/${place.parentId}?${query}`);
    const outlook = page.getByTestId("heat-outlook");
    await expect(page.getByTestId("outlook-estimate")).toBeVisible();
    await typography(outlook.getByRole("heading", { level: 2 }).first(), "Fira", 15);
    await typography(
      page.getByRole("combobox", { name: "District", exact: true }),
      "Noto",
      14,
    );
    await dropdownSpacing(
      page.getByRole("combobox", { name: "District", exact: true }),
    );
    const years = outlook.getByRole("button", { name: "5 years", exact: true });
    await typography(years, "Fira", 12);
    await years.click();
    await expect(years).toHaveAttribute("aria-pressed", "true");
    await expect(outlook).toHaveAttribute("aria-busy", "false");
    await expect(outlook.locator('svg[role="group"][aria-busy="false"]')).toBeVisible();
    await capture(page, `${name}-dashboard`, true);

    await page.goto(`/dashboard/${place.parentId}/actions?${query}`);
    await typography(
      page.getByRole("heading", { name: "Recommended actions", exact: true }),
      "Fira",
      20,
    );
    const cards = page.getByRole("list", { name: /heat season actions/i });
    await expect(cards).toBeVisible();
    await breadcrumbBounds(page);
    await capture(page, `${name}-actions`, true);
    await cards.getByRole("button").first().click();
    const dialog = page.getByRole("dialog");
    await typography(dialog.getByRole("heading", { level: 2 }), "Fira", 15);
    const status = dialog.getByRole("combobox", { name: "Action status" });
    await typography(status, "Noto", 12);
    await dropdownSpacing(status, true);
    await status.click();
    await page.getByRole("option", { name: "In progress", exact: true }).click();
    await page.reload();
    await expect(status).toContainText("In progress");
    await capture(page, `${name}-action-detail`, true);
    await dialog
      .getByRole("button", { name: "Assign to districts →", exact: true })
      .click();
    const assignee = dialog.getByRole("combobox", { name: "Assign to", exact: true });
    await typography(assignee, "Noto", 14);
    await dropdownSpacing(assignee);
    await assignee.click();
    await page.getByRole("option", { name: "RCH Officer", exact: true }).click();
    await expect(assignee).toContainText("RCH Officer");
    const notes = dialog.getByRole("textbox", { name: "Notes (optional)" });
    await typography(notes, "Noto", 12.5);
    await notes.fill("Typography check using disposable browser data.");
    await capture(page, `${name}-action-form`, true);
    await dialog
      .getByRole("button", { name: "Assign to selected districts", exact: true })
      .click();
    await page.reload();
    await expect(dialog.getByRole("status")).toContainText("Assigned to");
    await expect(dialog.getByRole("status")).toContainText("RCH Officer");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Persisted identity still permits the public content within the workspace.
    await page.goto("/learning");
    await typography(page.getByRole("heading", { level: 1 }), "Fira", 20);
    await typography(
      page.getByRole("searchbox", { name: "Search videos" }),
      "Noto",
      13,
    );
    await capture(page, `${name}-learning-workspace`, true);
    if (name === "mobile") {
      await page.setViewportSize({ width: 360, height });
      await capture(page, "narrow-learning-workspace", true);
      await page.setViewportSize({ width, height });
    }
  });
}

test("administrator: every settings section keeps shared heading typography", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, "typography-admin");
  for (const [tab, heading] of [
    ["data", "Observations held per country"],
    ["models", "Installed model releases"],
    ["users", "People and access"],
    ["jobs", "Running and recent work"],
  ]) {
    await page.goto(`/settings?tab=${tab}`);
    await typography(page.getByRole("heading", { level: 1 }), "Fira", 20);
    await typography(page.getByRole("heading", { name: heading }), "Fira", 15);
    await capture(page, `admin-${tab}`, true);
  }
});
