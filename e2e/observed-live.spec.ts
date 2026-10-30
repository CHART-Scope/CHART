import { expect, test } from "@playwright/test";

for (const [country, username, frame, place, observedRelease] of [
  ["KE", "kenya-planner", "geo-ke", "geo-ke-kajiado", "v2_2026_10_06"],
  [
    "IN",
    "india-planner",
    "geo-in-madhya-pradesh",
    "geo-in-madhya-pradesh-division-bhopal",
    "",
  ],
]) {
  for (const outcome of ["lbw", "under_5_mortality"]) {
    test(`${country} ${outcome}: existing Observed and new Projected coexist`, async ({
      page,
    }) => {
      await page.goto("/auth/signin");
      await page.getByLabel("Email address").fill(username);
      await page
        .getByLabel("Password", { exact: true })
        .fill(process.env.CHART_E2E_PASSWORD!);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await page.waitForURL(/\/(plan|dashboard)/);
      const dashboard = `/dashboard/${frame}?admin_unit=${place}&outcome=${outcome}&month=2026-09`;
      await page.goto(dashboard);
      const panel = page.getByTestId("heat-outlook");
      const observed = panel.getByRole("tab", { name: "Observed", exact: true });
      const projected = panel.getByRole("tab", { name: "Projected", exact: true });
      await expect(observed).toBeEnabled();
      await observed.click();
      await expect(observed).toHaveAttribute("aria-selected", "true");
      const release =
        observedRelease ||
        (outcome === "lbw"
          ? "lbw-mp-1.0.1-compact-review"
          : "under5-mortality-mp-0.1.0-review");
      await expect(panel.getByTestId("outlook-source")).toContainText(release);
      // Both countries share the compact observed view and month strip.
      const estimate = panel.getByTestId("outlook-estimate");
      await expect(estimate).toContainText("Sep 2026");
      await expect(panel.getByTestId("monthly-risk")).toHaveCount(0);
      if (country === "IN") {
        // India's stored result, unchanged: 20% (LBW) or 9% (under five).
        await expect(estimate).toContainText(
          outcome === "lbw" ? /20(\.0)?%/ : /9(\.0)?%/,
        );
      }
      await expect(panel.getByRole("heading", { level: 2 })).toHaveCount(2);
      await expect(
        panel.getByRole("combobox", { name: "Year", exact: true }),
      ).toHaveCSS("padding", "4px 8px");
      const selectedArea = panel.getByRole("button", {
        name: country === "KE" ? /^Kajiado Central: / : /^Bhopal: /,
      });
      await expect(selectedArea).toBeVisible();
      await expect(selectedArea).not.toHaveAttribute(
        "aria-label",
        /\d.*% attributable/,
      );
      await page.screenshot({
        path: `${process.env.CHART_E2E_EVIDENCE}/${country}-${outcome}-observed.png`,
        fullPage: true,
      });
      await projected.click();
      await expect(projected).toHaveAttribute("aria-selected", "true");
      await expect(panel.getByTestId("outlook-source")).toContainText("2026-10-22");
      await expect(panel.getByTestId("monthly-risk")).toHaveCount(0);
      for (const duration of [5, 10]) {
        const choice = panel
          .getByRole("group", { name: "Period length", exact: true })
          .getByRole("button", { name: `${duration} years`, exact: true });
        await choice.click();
        await expect(choice).toHaveAttribute("aria-pressed", "true");
        await expect(panel.getByTestId("outlook-estimate")).toBeVisible();
      }
      await observed.click();
      await expect(panel.getByTestId("outlook-source")).toContainText(release);
      await expect(panel.getByRole("alert")).toHaveCount(0);
      await page.reload();
      await expect(observed).toBeEnabled();
      await observed.click();
      await expect(panel.getByTestId("outlook-source")).toContainText(release);
      if (country === "IN") {
        await expect(panel.getByTestId("outlook-estimate")).toContainText("Sep 2026");
        // A month scored by an earlier release names that release.
        await page.goto(dashboard.replace("month=2026-09", "month=2026-08"));
        await expect(panel.getByTestId("outlook-source")).toContainText(
          `e2e-prior-${outcome}`,
        );
        await expect(panel.getByTestId("outlook-estimate")).toContainText("Aug 2026");
        await page.goto(dashboard);
        await expect(panel.getByTestId("outlook-source")).toContainText(release);
      }
      await page.setViewportSize({ width: 360, height: 800 });
      await expect(
        page.getByRole("button", { name: "Show navigation", exact: true }),
      ).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toBeVisible();
      await expect(selectedArea).toBeVisible();
      await page.screenshot({
        path: `${process.env.CHART_E2E_EVIDENCE}/${country}-${outcome}-observed-mobile.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
}
