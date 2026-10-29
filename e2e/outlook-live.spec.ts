import { readFileSync } from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";

type Place = { id: string; name: string; parentId: string | null; levelLabel: string };

async function expectVulnerabilityFrame(
  page: Page,
  response: Response,
  frame: Place,
  areas: Place[],
  aggregate: string,
) {
  expect(response.status()).toBe(200);
  const assessment = await response.json();
  expect(assessment.geography_id).toBe(frame.id);
  expect(assessment.area_level_label).toBe(areas[0].levelLabel);
  expect(
    assessment.areas.map((area: { geography_id: string }) => area.geography_id).sort(),
  ).toEqual(areas.map((area) => area.id).sort());
  await expect(page).toHaveURL(new RegExp(`/vulnerability/${frame.id}$`));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `Vulnerability across ${frame.name}`,
      exact: true,
    }),
  ).toBeVisible();
  const places = page.getByRole("group", { name: "Place", exact: true });
  await expect(places).toBeVisible();
  await expect(
    places.getByRole("combobox", { name: areas[0].levelLabel, exact: true }),
  ).toContainText(aggregate);
  await expect(
    page.getByRole("combobox", { name: "Climate hazard", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Health outcome", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Loading the assessment" }),
  ).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  if (assessment.run === null) {
    await expect(
      page.getByRole("heading", {
        name: `${frame.name} has not been assessed yet`,
        exact: true,
      }),
    ).toBeVisible();
  }
}

const methodologyNote =
  "Published area tables retain the modeller's estimates and coefficient intervals. " +
  "Additional periods use original approximately 0.5-degree projection grids: " +
  "equal-month temporal averages and polygon-intersection area weights, separately " +
  "for each climate model before calculating the ensemble mean and range. " +
  "These grid estimates can differ from the area tables; they are not population " +
  "weighted or downscaled. Coefficient confidence intervals and temperature summaries " +
  "are unavailable for derived periods. Negative estimates are retained for audit " +
  "but must not be displayed as attributable burden.";

for (const [country, username, level] of [
  ["IN", "india-planner", "District"],
  ["KE", "kenya-planner", "Constituency"],
]) {
  test(`${country}: real sign-in, granular geography, projection filters, and VRA frame`, async ({
    page,
  }) => {
    const fixtures = JSON.parse(
      readFileSync(`${process.env.CHART_E2E_EVIDENCE}/browser-fixture.json`, "utf8"),
    );
    const place = fixtures[country];
    await page.goto("/auth/signin");
    await page.getByLabel("Email address").fill(username);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.CHART_E2E_PASSWORD!);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/\/(plan|dashboard)/);
    await page.goto(`/dashboard/${place.parentId}?admin_unit=${place.id}&outcome=lbw`);
    const outlook = page.getByTestId("heat-outlook");
    await expect(outlook).toBeVisible();
    await expect(
      outlook.getByRole("tab", { name: "Observed", exact: true }),
    ).toBeEnabled();
    await outlook.getByRole("tab", { name: "Observed", exact: true }).click();
    await expect(
      outlook.getByRole("status").filter({ hasText: "No observed model is available" }),
    ).toBeVisible();
    await expect(outlook.getByTestId("outlook-estimate")).toHaveCount(0);
    await outlook.getByRole("tab", { name: "Projected", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: level, exact: true }),
    ).toBeVisible();
    const periods = outlook.getByRole("group", { name: "Period length", exact: true });
    for (const years of [5, 10, 20]) {
      const selected = periods.getByRole("button", {
        name: `${years} years`,
        exact: true,
      });
      await selected.click();
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("outlook-estimate")).toBeVisible();
      await expect(
        outlook
          .getByRole("group", { name: "Time horizon", exact: true })
          .or(outlook.getByRole("combobox", { name: "Time horizon", exact: true })),
      ).toBeVisible();
    }
    await expect(outlook.getByTestId("outlook-estimate")).toBeVisible();
    await expect(
      outlook.locator("summary").filter({
        hasText: /^Seasonal pattern and all periods$/,
      }),
    ).toBeVisible();
    await expect(
      outlook.locator("summary").filter({
        hasText: /^Data and model details$/,
      }),
    ).toHaveCount(0);
    await expect(outlook.getByText(methodologyNote, { exact: true })).toHaveCount(0);
    await expect(outlook.getByText("handover://", { exact: false })).toHaveCount(0);
    await expect(
      outlook.getByText(/Projection release .* from the modelling team/),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${process.env.CHART_E2E_EVIDENCE}/${country}-projection.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(outlook).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: level, exact: true }),
    ).toBeVisible();

    // New descendants must not make Kenya silently choose its first county.
    // India still opens its single state; both paths use the real saved tree.
    const rootId = country === "IN" ? "geo-in" : "geo-ke";
    const geographyResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/chart/geographies",
    );
    const nextAssessment = () =>
      page.waitForResponse((response) =>
        /^\/api\/chart\/vra\/[^/]+\/assessment$/.test(new URL(response.url()).pathname),
      );
    const firstAssessment = nextAssessment();
    await page.goto(`/vulnerability/${rootId}`);
    const geographies: Place[] = await (await geographyResponse).json();
    const children = geographies.filter((geo) => geo.parentId === rootId);
    if (country === "IN") expect(children).toHaveLength(1);
    else expect(children.length).toBeGreaterThan(1);
    expect(
      children.every((child) => geographies.some((geo) => geo.parentId === child.id)),
    ).toBe(true);
    const frame =
      country === "IN" ? children[0] : geographies.find((geo) => geo.id === rootId)!;
    const areas = geographies.filter((geo) => geo.parentId === frame.id);
    const aggregate = country === "IN" ? "All divisions" : "All counties";
    await expectVulnerabilityFrame(
      page,
      await firstAssessment,
      frame,
      areas,
      aggregate,
    );

    const reloadedAssessment = nextAssessment();
    await page.reload();
    await expectVulnerabilityFrame(
      page,
      await reloadedAssessment,
      frame,
      areas,
      aggregate,
    );

    // The sidebar entry also resolves through defaultFrame/defaultAreaForFamily.
    const defaultAssessment = nextAssessment();
    await page.goto("/vulnerability");
    await expectVulnerabilityFrame(
      page,
      await defaultAssessment,
      frame,
      areas,
      aggregate,
    );
    await page.screenshot({
      path: `${process.env.CHART_E2E_EVIDENCE}/${country}-vulnerability-frame.png`,
      fullPage: true,
    });

    // The same shared picker names the finer level in VRA and clears only the
    // selected area when its aggregate option is chosen.
    const fineFrame = geographies.find((geo) => geo.id === place.parentId)!;
    const fineAreas = geographies.filter((geo) => geo.parentId === fineFrame.id);
    const fineAggregate = country === "IN" ? "All districts" : "All constituencies";
    const fineAssessment = nextAssessment();
    await page.goto(`/vulnerability/${fineFrame.id}`);
    await expectVulnerabilityFrame(
      page,
      await fineAssessment,
      fineFrame,
      fineAreas,
      fineAggregate,
    );
    const finePicker = page.getByRole("combobox", { name: level, exact: true });
    const selectedArea = fineAreas.find((area) => area.id === place.id)!;
    await finePicker.click();
    await page.getByRole("option", { name: selectedArea.name, exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/vulnerability/${fineFrame.id}` &&
        url.searchParams.get("area") === selectedArea.id,
    );
    await expect(finePicker).toContainText(selectedArea.name);
    await finePicker.click();
    await expect(
      page.getByRole("option", { name: fineAggregate, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `${process.env.CHART_E2E_EVIDENCE}/${country}-vra-aggregate-menu.png`,
      animations: "disabled",
    });
    await page.getByRole("option", { name: fineAggregate, exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/vulnerability/${fineFrame.id}` &&
        !url.searchParams.has("area"),
    );
    await expect(finePicker).toContainText(fineAggregate);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

    const outside = fixtures[country === "IN" ? "KE" : "IN"];
    const denied = page.waitForResponse(
      (response) =>
        response.url().includes(`/heat-outlook/${outside.id}/capabilities`) &&
        response.status() === 403,
    );
    await page.goto(
      `/dashboard/${outside.parentId}?admin_unit=${outside.id}&outcome=lbw`,
    );
    await denied;
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Available outlook views could not load",
    );
    await expect(outlook).toHaveCount(0);
  });
}
