import { expect, test } from "@playwright/test";

// Exercise the served public page and real static assets without API mocks.
// Failure modes: broken assets/links, changed ordering, and narrow-screen overflow.
for (const width of [1440, 768, 390]) {
  test(`partner logos and website links at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const partners = page.getByRole("list", { name: "Partners" });
    // The coalition row, in the order of the design.
    const coalition = [
      ["Amref Health Africa", "https://amref.org/"],
      ["AMP Health", "https://amphealth.org/"],
      ["SCOPE Impact", "https://scopeimpact.fi/"],
      ["PATH", "https://www.path.org/"],
      ["CEEW", "https://www.ceew.in/"],
    ];
    await expect(partners.getByRole("link")).toHaveCount(coalition.length);
    for (const [index, [name]] of coalition.entries()) {
      await expect(partners.getByRole("link").nth(index)).toHaveAccessibleName(name);
    }
    for (const [name, href] of coalition) {
      const link = partners.getByRole("link", { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
      const logo = link.getByRole("img", { name, exact: true });
      await expect(logo).toBeVisible();
      await expect
        .poll(() =>
          logo.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await partners.screenshot({ path: testInfo.outputPath("partners.png") });
  });
}
