import { expect, test } from "@playwright/test";

import {
  FALLBACK_RESOURCES,
  FALLBACK_TRACKS,
} from "../src/features/learning/data/fallback";
import { installFakeApi, json } from "./support/fakeApi";

// Failure modes: hidden mobile content, broken demo contact, accidental repository
// navigation, guest auth redirects/progress writes, and lost signed-in navigation.
for (const width of [1440, 390]) {
  test(`public landing and Learning Hub at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await installFakeApi(page);
    api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
    api.on(/^\/api\/auth\/keycloak-refresh$/, (route) => json(route, {}, 401));
    api.on(/^\/api\/chart\/learning\/resources$/, (route) =>
      json(route, { items: FALLBACK_RESOURCES, total: FALLBACK_RESOURCES.length }),
    );
    api.on(/^\/api\/chart\/learning\/tracks$/, (route) =>
      json(route, { tracks: FALLBACK_TRACKS }),
    );
    await page.goto("/");
    await expect(page).toHaveTitle(
      "CHART — Climate & health adaptation and resilience Toolkit",
    );
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Climate & health adaptation and resilience Toolkit",
    );
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("header")).toHaveCSS(
      "background-color",
      "rgb(43, 45, 49)",
    );
    await expect(
      page.locator("header").getByRole("link", { name: "CHART home" }),
    ).toHaveCSS("color", "rgb(190, 242, 116)");
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(
      navigation.getByRole("link", { name: "Learning Hub", exact: true }),
    ).toHaveAttribute("href", "/learning");
    await expect(
      navigation.getByRole("button", { name: /Solutions Repository/ }),
    ).toBeDisabled();
    await expect(
      page.locator("main").getByRole("link", { name: "Request access" }),
    ).toHaveAttribute("href", "mailto:info@scopeimpact.fi");
    await expect(
      page.getByRole("button", { name: "Explore solutions" }),
    ).toBeDisabled();
    const preview = page.getByRole("figure", { name: "CHART dashboard previews" });
    const choices = page.getByRole("group", { name: "Choose dashboard preview" });
    await expect(preview.getByRole("img")).toHaveCount(3);
    for (const label of ["Dashboard", "Health risks", "Precision"]) {
      const choice = choices.getByRole("button", { name: label, exact: true });
      await choice.click();
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      const enlarge = preview.getByRole("button", {
        name: `Enlarge ${label.toLowerCase()} screenshot`,
        exact: true,
      });
      await enlarge.click();
      const dialog = page.getByRole("dialog", { name: label, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("img")).toBeVisible();
      expect(
        await dialog
          .getByRole("img")
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      ).toBe(true);
      if (label === "Health risks")
        await dialog.getByRole("button", { name: "Close dashboard preview" }).click();
      else await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(enlarge).toBeFocused();
    }
    await choices.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.getByText("Inside CHART · Madhya Pradesh, India")).toHaveCount(0);
    const partners = page.getByRole("list", { name: "Partners" });
    await expect(partners.getByRole("link")).toHaveCount(5);
    await expect(partners.getByRole("link").nth(1)).toHaveAccessibleName(
      "UBS Optimus Foundation",
    );
    for (const [name, href] of [
      ["SCOPE Impact", "https://scopeimpact.fi/"],
      ["CEEW", "https://www.ceew.in/"],
      ["PATH", "https://www.path.org/"],
      [
        "UBS Optimus Foundation",
        "https://www.ubs.com/global/en/sustainability-impact/social-impact-and-philanthropy/optimus-foundation.html",
      ],
      [
        "Global Development Incubator South Asia",
        "https://globaldevincubator.org/south-asia/",
      ],
    ]) {
      const link = partners.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
    }
    await expect(
      page.locator("section[aria-labelledby='chart-landing-title']"),
    ).toHaveCSS("background-image", "none");
    for (const logo of await page
      .getByRole("list", { name: "Partners" })
      .getByRole("img")
      .all()) {
      await expect(logo).toBeVisible();
      expect(
        await logo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      ).toBe(true);
    }
    const resources = page.getByRole("navigation", { name: "Resources" });
    for (const [name, href] of [
      ["Documentation", "https://chart-scope.github.io/CHART/docs/"],
      ["Brand Kit", "https://chart-scope.github.io/CHART/"],
      ["GitHub", "https://github.com/CHART-Scope/CHART"],
      ["License", "https://github.com/CHART-Scope/CHART/blob/main/LICENSE"],
    ]) {
      const link = resources.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
    }
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Request access" }),
    ).toHaveCount(0);
    await expect(page.getByRole("contentinfo").getByText("Get in touch")).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
    await navigation.getByRole("link", { name: "Learning Hub", exact: true }).click();
    await expect(page).toHaveURL(/\/learning$/);
    await expect(page.locator("header").first()).toHaveCSS(
      "background-color",
      "rgb(43, 45, 49)",
    );
    await expect(page.getByRole("searchbox", { name: "Search videos" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.getByRole("searchbox").fill("no-such-learning-resource");
    await expect(page.getByRole("status")).toContainText("Nothing here");
    await page.getByRole("searchbox").clear();
    await page
      .getByRole("button", { name: /^(Play|Open) / })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.requests.some((request) => request.includes("/learning/me"))).toBe(
      false,
    );
    expect(api.unhandled).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("public-learning.png"),
      fullPage: true,
    });
  });
}

test("direct public Learning Hub survives unavailable services", async ({ page }) => {
  await page.route("**/api/**", (route) => json(route, {}, 503));
  await page.goto("/learning");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Play|Open) / }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/learning$/);
  // Planning still requires authentication.
  await page.route("**/auth/signin", (route) => route.fulfill({ body: "Sign in" }));
  await page.getByRole("button", { name: "Start planning together" }).click();
  await expect(page).toHaveURL(/\/auth\/signin$/);
});

test("signed-in Learning Hub keeps workspace navigation", async ({ page }) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/chart\/learning\/resources$/, (route) =>
    json(route, { items: FALLBACK_RESOURCES }),
  );
  api.on(/^\/api\/chart\/learning\/tracks$/, (route) =>
    json(route, { tracks: FALLBACK_TRACKS }),
  );
  await page.goto("/learning");
  await expect(
    page.getByRole("link", { name: "Start planning", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(
    0,
  );
  expect(api.unhandled).toEqual([]);
});

for (const requiresOnboarding of [false, true]) {
  test(`landing access keeps ${requiresOnboarding ? "setup" : "sign-in"} routing`, async ({
    page,
  }) => {
    await page.route("**/api/setup", (route) => json(route, { requiresOnboarding }));
    const destination = requiresOnboarding ? "/onboarding" : "/auth/signin";
    await page.route(`**${destination}`, (route) =>
      route.fulfill({ body: "Access destination" }),
    );
    await page.goto("/");
    await page
      .getByRole("button", {
        name: requiresOnboarding ? "Set up CHART" : "Sign in",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}
