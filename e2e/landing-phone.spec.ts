import { expect, test } from "@playwright/test";

// The public landing page on phones, against the served page: the header is
// two rows (wordmark and buttons, then one scrolling line of links), the
// explainer video is on the first screen, sections keep the phone spacing,
// and nothing scrolls sideways. Desktop keeps the one-row header.
const box = (locator: import("@playwright/test").Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      height: r.height,
    };
  });

for (const [width, height] of [
  [390, 844],
  [360, 740],
] as const) {
  test(`landing header and spacing on a ${width}px phone`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const header = page.getByRole("banner");
    const nav = header.getByRole("navigation", { name: "Main navigation" });
    const brand = nav.getByRole("link", { name: "CHART home" });
    const logIn = nav.getByRole("button", { name: /Log in|Set up CHART|Please wait/ });
    const links = nav.getByRole("link", { name: "Climate x health risks" });

    // Header: wordmark and buttons share the first row, links sit below.
    const headerBox = await box(header);
    expect(headerBox.height).toBeLessThanOrEqual(112);
    const brandBox = await box(brand);
    const logInBox = await box(logIn);
    const linkBox = await box(links);
    expect(
      Math.abs(
        brandBox.top + brandBox.height / 2 - (logInBox.top + logInBox.height / 2),
      ),
    ).toBeLessThan(4);
    expect(linkBox.top).toBeGreaterThanOrEqual(brandBox.bottom);
    expect(logInBox.height).toBe(40);
    expect(logInBox.right).toBeLessThanOrEqual(width - 24 + 0.5);
    // The links are one line; the last one scrolls into view sideways.
    const linksRow = links.locator("xpath=..");
    const last = nav.getByRole("link", { name: "Actions repository" });
    expect((await box(last)).top).toBe(linkBox.top);
    expect(await linksRow.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await last.scrollIntoViewIfNeeded();
    expect((await box(last)).right).toBeLessThanOrEqual(width + 0.5);

    // The explainer video starts on the first screen.
    const video = page.getByLabel("CHART explainer video");
    expect((await box(video)).top).toBeLessThan(height);

    // Phone spacing from the tokens.
    const hero = page.locator("section[aria-labelledby='chart-landing-title']");
    expect(await hero.evaluate((el) => getComputedStyle(el).paddingTop)).toBe("32px");
    const section = page.locator("section[aria-labelledby='toolkit-title'] > div");
    expect(await section.evaluate((el) => getComputedStyle(el).paddingTop)).toBe(
      "48px",
    );
    expect(await section.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(
      "24px",
    );

    // Partner logos two to a row.
    const logos = page.getByRole("list", { name: "Partners" }).getByRole("link");
    const [first, second, third] = await Promise.all([
      box(logos.nth(0)),
      box(logos.nth(1)),
      box(logos.nth(2)),
    ]);
    expect(second.top).toBe(first.top);
    expect(third.top).toBeGreaterThan(first.bottom);
    expect(first.height).toBe(80);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("landing-phone.png"),
      fullPage: true,
    });
  });
}

test("landing header stays one row on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const brandBox = await box(nav.getByRole("link", { name: "CHART home" }));
  const linkBox = await box(nav.getByRole("link", { name: "Actions repository" }));
  const logInBox = await box(
    nav.getByRole("button", { name: /Log in|Set up CHART|Please wait/ }),
  );
  expect((await box(page.getByRole("banner"))).height).toBe(68);
  expect(linkBox.top).toBeLessThan(brandBox.bottom);
  expect(logInBox.top).toBeLessThan(brandBox.bottom);
  const section = page.locator("section[aria-labelledby='toolkit-title'] > div");
  expect(await section.evaluate((el) => getComputedStyle(el).paddingTop)).toBe("88px");
});
