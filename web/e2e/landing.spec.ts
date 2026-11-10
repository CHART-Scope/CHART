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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CHART");
    await expect(
      page.getByText("Climate x Health Adaptation and Resilience Tool", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Log in", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("header")).toHaveCSS(
      "background-color",
      "rgb(43, 45, 49)",
    );
    await expect(
      page.locator("header").getByRole("link", { name: "CHART home" }),
    ).toHaveCSS("color", "rgb(190, 242, 116)");
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    // Anyone can open the published estimates; signing in is for planning.
    await expect(
      navigation.getByRole("link", { name: "Climate x health risks", exact: true }),
    ).toHaveAttribute("href", "/explore");
    for (const name of ["VRAs", "Actions repository"]) {
      await expect(navigation.getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        "#toolkit",
      );
    }
    for (const title of [
      "Plan for climate-health risk, together",
      "Explore CHART toolkit",
      "CHART co-design government partners",
      "A Digital Public Good, stewarded together",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    for (const step of [
      "1. Understand the risk",
      "2. Get recommended actions",
      "3. Coordinate, track, and report",
    ]) {
      await expect(page.getByRole("heading", { level: 3, name: step })).toBeVisible();
    }
    // The hero call to action scrolls to the toolkit, whose live card opens the map.
    await page.getByRole("link", { name: "Explore the toolkit" }).click();
    await expect(page).toHaveURL(/#toolkit$/);
    const toolkit = page.locator("#toolkit");
    await expect(toolkit).toBeInViewport();
    await expect(
      toolkit.getByRole("link", { name: "Explore", exact: true }),
    ).toHaveAttribute("href", "/explore");
    await expect(toolkit.getByText("Coming soon")).toHaveCount(2);
    // No placeholder copy from the design reaches the public page.
    await expect(page.getByText(/placeholder/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Request access" })).toHaveCount(0);

    // Contact: each entry point preselects its reason, and Send opens the
    // visitor's email app addressed to the coalition (there is no backend).
    for (const [opener, reason] of [
      [
        page.getByRole("button", { name: "Request a demo" }).first(),
        "Requesting a demo",
      ],
      [
        page.getByRole("button", { name: "Notify me about Action repository" }),
        "Hearing when VRAs and the Action repository launch",
      ],
      [
        page.locator("main").getByRole("button", { name: "Contact us" }),
        "Becoming a co-creator partner",
      ],
    ] as const) {
      await opener.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("radio", { name: reason })).toBeChecked();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Contact us" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: "Something else" })).toBeChecked();
    // Required fields block an empty submission.
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("dialog", { name: "Contact us" })).toBeVisible();
    await page.evaluate(() => {
      // Record the mailto navigation instead of leaving the page.
      const opened: string[] = [];
      Object.assign(window, { __mailto: opened });
      window.open = (url?: string | URL) => {
        opened.push(String(url));
        return null;
      };
    });
    await dialog.getByLabel("Name").fill("Asha Rao");
    await dialog.getByLabel("Work email").fill("asha@health.gov.in");
    await dialog.getByLabel("Organisation / department").fill("Health department");
    await dialog.getByRole("radio", { name: "Requesting a demo" }).check();
    await dialog.getByLabel("Message (optional)").fill("Bhopal division");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("dialog", { name: "Almost there" })).toBeVisible();
    const mailto = await page.evaluate(
      () => (window as unknown as { __mailto: string[] }).__mailto,
    );
    expect(mailto).toHaveLength(1);
    const url = new URL(mailto[0]);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("info@scopeimpact.fi");
    expect(url.searchParams.get("subject")).toBe("CHART: Requesting a demo");
    expect(url.searchParams.get("body")).toContain("Work email: asha@health.gov.in");
    expect(url.searchParams.get("body")).toContain("Bhopal division");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);

    const partners = page.getByRole("list", { name: "Partners" });
    await expect(partners.getByRole("link")).toHaveCount(5);
    for (const [name, href] of [
      ["Amref Health Africa", "https://amref.org/"],
      ["AMP Health", "https://amphealth.org/"],
      ["SCOPE Impact", "https://scopeimpact.fi/"],
      ["PATH", "https://www.path.org/"],
      ["CEEW", "https://www.ceew.in/"],
    ]) {
      const link = partners.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
      const logo = link.getByRole("img", { name, exact: true });
      await expect
        .poll(() =>
          logo.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `../outputs/e2e/web/landing-${width}.png`,
      fullPage: true,
    });
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
    await page.goto("/learning");
    const publicNav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(
      publicNav.getByRole("link", { name: "Explore the map", exact: true }),
    ).toHaveAttribute("href", "/explore");
    await expect(
      publicNav.getByRole("link", { name: "Learning Hub", exact: true }),
    ).toHaveAttribute("aria-current", "page");
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
  await page.route("**/api/**", (route) =>
    // A visitor has no refresh cookie, which the refresh route answers with
    // 401 however the services behind it are doing. (A 503 there means the
    // provider is down mid-session, which waits rather than signing in.)
    route.request().url().endsWith("/api/auth/keycloak-refresh")
      ? json(route, { error: "AUTH_SESSION_REQUIRED" }, 401)
      : json(route, {}, 503),
  );
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
        name: requiresOnboarding ? "Set up CHART" : "Log in",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

// Regression: a fixed 24px gutter ran the content to the window's edge on a
// laptop. The gutter grows with the window (6vw, 24–120px) and every block
// (header, hero, sections, footer) starts on the same line.
for (const [width, gutter] of [
  [390, 24],
  [1440, 86.4],
  [2560, 120],
] as const) {
  test(`landing content keeps the design's side gutter at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await installFakeApi(page);
    api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
    await page.goto("/");
    const left = (locator: ReturnType<typeof page.locator>) =>
      locator.evaluate((element) => element.getBoundingClientRect().left);
    const brand = page.locator("header").getByRole("link", { name: "CHART home" });
    const start = await left(brand);
    // Content is centred within 1592px once the window is wide enough.
    const expected = Math.max(gutter, (width - 1592) / 2);
    expect(start).toBeCloseTo(expected, 0);
    for (const block of [
      page.getByRole("heading", { level: 1 }),
      page.getByRole("heading", {
        level: 2,
        name: "Plan for climate-health risk, together",
      }),
      page.getByRole("heading", { level: 2, name: "Explore CHART toolkit" }),
      page.getByRole("heading", {
        level: 2,
        name: "A Digital Public Good, stewarded together",
      }),
      page.locator("footer").getByRole("link", { name: "CHART home" }),
    ]) {
      expect(await left(block)).toBeCloseTo(start, 0);
    }
    const strip = page.getByText("Interested in seeing how it all comes together");
    const right = await strip
      .locator("xpath=..")
      .evaluate((element) => innerWidth - element.getBoundingClientRect().right);
    expect(right).toBeCloseTo(expected, 0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `../outputs/e2e/web/landing-gutter-${width}.png`,
      fullPage: true,
    });
  });
}
