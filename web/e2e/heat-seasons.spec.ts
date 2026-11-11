import { expect, test, type Page } from "@playwright/test";

import { json } from "./support/fakeApi";
import { installKenya, type KenyaApi } from "./support/kenya";

// Settings > Heat seasons (design frame 17b) against an in-memory calendar
// service that inherits like the real one: a place without its own months
// takes its parent's, and the country falls back to its official season.

type Place = { id: string; name: string; level: string; parent: string | null };
const places: Place[] = [
  { id: "geo-ke", name: "Kenya", level: "Country", parent: null },
  { id: "geo-ke-kajiado", name: "Kajiado", level: "County", parent: "geo-ke" },
  { id: "geo-ke-garissa", name: "Garissa", level: "County", parent: "geo-ke" },
  {
    id: "geo-ke-kajiado-central",
    name: "Kajiado Central",
    level: "Constituency",
    parent: "geo-ke-kajiado",
  },
];
const depthOf = (place: Place): number =>
  place.parent ? 1 + depthOf(places.find((item) => item.id === place.parent)!) : 0;
const OFFICIAL = "dddaaaabbbbd";

function serveSeasons(api: KenyaApi, fail?: string) {
  const own = new Map<string, string>();
  const writes: { method: string; id: string; months?: string }[] = [];
  // The Jobs tab's badge polls for running work; there is none here.
  api.on(/^\/api\/chart\/climate\/ingestion-jobs$/, (route) => json(route, []));
  const calendar = (place: Place) => {
    let origin: Place | undefined = place;
    while (origin && !own.has(origin.id))
      origin = places.find((item) => item.id === origin!.parent);
    return {
      geography_id: place.id,
      name: place.name,
      level_label: place.level,
      parent_id: place.parent,
      depth: depthOf(place),
      own: own.get(place.id) ?? null,
      months: origin ? own.get(origin.id)! : OFFICIAL,
      state: own.has(place.id) ? "custom" : origin ? "inherited" : "official",
      inherited_from: origin && origin.id !== place.id ? origin.name : null,
      source: origin ? null : "Kenya Meteorological Department",
    };
  };
  api.on(/^\/api\/chart\/heat-seasons$/, (route) =>
    json(route, { items: places.map(calendar) }),
  );
  api.on(/^\/api\/chart\/heat-seasons\/[^/]+$/, async (route, url) => {
    const id = url.pathname.split("/").pop()!;
    const place = places.find((item) => item.id === id)!;
    const method = route.request().method();
    if (method === "PUT") {
      const body = route.request().postDataJSON() as { months: string };
      writes.push({ method, id, months: body.months });
      if (fail) return json(route, { detail: fail }, 422);
      own.set(id, body.months);
    } else if (method === "DELETE") {
      writes.push({ method, id });
      own.delete(id);
    }
    return json(route, calendar(place));
  });
  return writes;
}

/** A place's row button: its name, then its level (not the fold button). */
const place = (page: Page, name: string) =>
  page.getByRole("list", { name: "Places" }).getByRole("button", {
    name: new RegExp(`^${name}\\s*(Country|County|Constituency)`),
  });

const months = (page: Page) =>
  page.getByRole("group", { name: "Months" }).getByRole("button");

test("an administrator paints a county's months, saves them and can return to inheriting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const api = await installKenya(page, true, ["/kenya"], { roles: ["chart_admin"] });
  const writes = serveSeasons(api);
  await page.goto("/settings?tab=seasons");

  await expect(page.getByRole("tab", { name: "Heat seasons" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Heat season calendar" }),
  ).toBeVisible();
  const list = page.getByRole("list", { name: "Places" });
  // Countries open on their counties; constituencies stay folded away.
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("listitem").first()).toContainText("Official season");

  await place(page, "Kajiado").click();
  await expect(place(page, "Kajiado")).toContainText("Inherits the official season");
  // Kenya's December–March season, read January first.
  await expect(months(page).first()).toHaveAccessibleName("Jan: During");
  await expect(months(page).nth(4)).toHaveAccessibleName("May: After");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();

  // Paint April as "During": the counts and the preview follow the draft.
  await page.getByRole("radio", { name: "During" }).click();
  await months(page).nth(3).click();
  await expect(months(page).nth(3)).toHaveAccessibleName("Apr: During");
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();
  await expect(page.getByText("During 5")).toBeVisible();
  await expect(page.getByRole("list", { name: "Gantt preview" })).toContainText(
    "Response",
  );
  await page.screenshot({
    path: "../outputs/e2e/web/heat-seasons-settings.png",
    fullPage: true,
  });

  await save.click();
  await expect(page.getByRole("status")).toHaveText("Saved the Kajiado calendar.");
  expect(writes).toEqual([
    { method: "PUT", id: "geo-ke-kajiado", months: "ddddaaabbbbd" },
  ]);
  await expect(place(page, "Kajiado")).toContainText("Custom");
  // Garissa keeps the official season: only Kajiado changed.
  await expect(place(page, "Garissa")).toContainText("Inherits the official season");

  // Saved calendars survive a reload.
  await page.reload();
  await place(page, "Kajiado").click();
  await expect(months(page).nth(3)).toHaveAccessibleName("Apr: During");

  await page.getByRole("button", { name: "Use Kenya" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Kajiado now inherits its calendar.",
  );
  await expect(months(page).nth(3)).toHaveAccessibleName("Apr: After");
  expect(writes.at(-1)).toEqual({ method: "DELETE", id: "geo-ke-kajiado" });
  expect(api.unhandled).toEqual([]);
});

test("places fold under their parents, expand all at once and can be searched", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], { roles: ["chart_admin"] });
  serveSeasons(api);
  await page.goto("/settings?tab=seasons");
  const list = page.getByRole("list", { name: "Places" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(place(page, "Kajiado Central")).toHaveCount(0);

  // One parent opens on its own.
  const kajiado = list.getByRole("button", { name: "Expand Kajiado" });
  await expect(kajiado).toHaveAttribute("aria-expanded", "false");
  await kajiado.click();
  await expect(place(page, "Kajiado Central")).toBeVisible();
  await list.getByRole("button", { name: "Collapse Kajiado" }).click();
  await expect(place(page, "Kajiado Central")).toHaveCount(0);

  // Collapsing the country hides everything beneath it.
  await list.getByRole("button", { name: "Collapse Kenya" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);

  // One button opens and closes the whole tree.
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);

  // Search shows matches with the parents they sit under, folded or not.
  const search = page.getByRole("searchbox", { name: "Search places" });
  await search.fill("central");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(place(page, "Kajiado Central")).toBeVisible();
  await expect(place(page, "Garissa")).toHaveCount(0);
  await place(page, "Kajiado Central").click();
  await expect(page.getByRole("heading", { name: "Kajiado Central" })).toBeVisible();
  await search.fill("nairobi");
  await expect(page.getByRole("status")).toHaveText("No place matches “nairobi”.");
  await search.fill("");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  expect(api.unhandled).toEqual([]);
});

test("a refused calendar says why and keeps the draft", async ({ page }) => {
  const api = await installKenya(page, true, ["/kenya"], { roles: ["chart_admin"] });
  serveSeasons(api, "HEAT_SEASON_INVALID");
  await page.goto("/settings?tab=seasons");
  await page.getByRole("radio", { name: "Before" }).click();
  await months(page).nth(1).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "the months must run before, during, after, then off" }),
  ).toBeVisible();
  await expect(months(page).nth(1)).toHaveAccessibleName("Feb: Before");
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("a planning lead has no heat-season tab and cannot open it by URL", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], {
    roles: ["health_planning_lead"],
  });
  serveSeasons(api);
  await page.goto("/settings?tab=seasons");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Heat season calendar" })).toHaveCount(
    0,
  );
  expect(api.requests.some((request) => request.includes("/heat-seasons"))).toBe(false);
});
