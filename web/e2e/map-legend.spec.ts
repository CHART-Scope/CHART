import { expect, test } from "@playwright/test";

import { installFakeApi } from "./support/fakeApi";

test("clicking a legend range highlights only the areas in it", async ({ page }) => {
  // Bhopal sits at 12% (the 10–15% range); Gwalior has no result yet.
  await installFakeApi(page);
  await page.goto(
    "/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw&month=2026-08",
  );
  const legend = page.getByRole("group", { name: "Highlight risk range" });
  const bhopal = page.locator("path[aria-label*='Bhopal']");
  const gwalior = page.locator("path[aria-label*='Gwalior']");
  await expect(bhopal).not.toHaveAttribute("data-muted", /.*/);

  await legend.getByRole("button", { name: "10–15%" }).click();
  await expect(legend.getByRole("button", { name: "10–15%" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(bhopal).not.toHaveAttribute("data-muted", /.*/);
  await expect(gwalior).toHaveAttribute("data-muted", "true");
  // What is drawn, not only the attribute: an animation once held every area
  // at full opacity, so the highlight changed nothing on screen.
  await expect(gwalior).toHaveCSS("opacity", "0.12");
  await expect(bhopal).not.toHaveCSS("opacity", "0.12");

  await legend.getByRole("button", { name: "Unavailable" }).click();
  await expect(bhopal).toHaveAttribute("data-muted", "true");
  await expect(gwalior).not.toHaveAttribute("data-muted", /.*/);

  // Clicking the active range again clears the highlight.
  await legend.getByRole("button", { name: "Unavailable" }).click();
  await expect(bhopal).not.toHaveAttribute("data-muted", /.*/);
  await expect(gwalior).not.toHaveAttribute("data-muted", /.*/);
  // Highlighting never changed what is selected on the dashboard.
  expect(new URL(page.url()).searchParams.get("admin_unit")).toBe("geo-in-mp-bhopal");
});
