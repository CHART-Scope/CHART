import { expect, test, type Page } from "@playwright/test";

import { installFakeApi, json } from "./support/fakeApi";
import { installKenya } from "./support/kenya";
import { type Who } from "./support/access";

// Settings > People, Departments, Roles and Workspaces against the in-memory
// workspace service (support/workspaces.ts). The API's rules - who may grant
// what, invitation acceptance, department ownership - are tested end to end
// in core/tests/test_workspaces_api.py; these cover what each person is
// offered, what the browser sends, how refusals read, and the design-system
// values on the new controls.

const evidence = "../outputs/e2e/web/settings-people";
const admin: Who = { platformAdmin: true, role: "workspace_admin", places: ["/india"] };
const lead: Who = { role: "planning_lead", places: ["/india/madhya-pradesh"] };
const viewer: Who = { role: "viewer", places: ["/india/madhya-pradesh/bhopal"] };

const members = (page: Page) => page.getByRole("list", { name: "Members" });
const invitations = (page: Page) => page.getByRole("list", { name: "Invitations" });
const dialog = (page: Page) => page.getByRole("dialog");

async function choose(
  scope: ReturnType<Page["getByRole"]>,
  label: string,
  option: string,
) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await scope.page().getByRole("option", { name: option, exact: true }).click();
}

test("a workspace admin invites someone with a role at a place and departments", async ({
  page,
}) => {
  const api = await installFakeApi(page, { who: admin });
  await page.goto("/settings?tab=people");
  await expect(page.getByRole("heading", { name: "People in India" })).toBeVisible();
  await expect(members(page).getByRole("listitem")).toHaveCount(2);
  const priya = members(page).getByRole("listitem", { name: "Priya Sharma" });
  await expect(priya).toContainText("Planning lead · Madhya Pradesh");
  await expect(priya).toContainText("Health");

  const invite = page.getByRole("button", { name: "Invite someone" });
  // Design system: a header button is M (40px), Fira Sans, nexus.
  await expect(invite).toHaveCSS("height", "40px");
  await expect(invite).toHaveCSS("font-family", /Fira Sans/);
  await expect(invite).toHaveCSS("background-color", "rgb(56, 62, 233)");
  await invite.click();

  const form = dialog(page);
  await form.getByLabel("Full name").fill("Amina Okello");
  await form.getByLabel("Email").fill("Amina@Example.org");
  // Inputs are 44px high.
  await expect(form.getByLabel("Email")).toHaveCSS("height", "44px");
  const grant = form.getByRole("group", { name: "Grant 1" });
  await choose(grant, "Role", "Implementation officer");
  await choose(grant, "Place", "Bhopal Division (Division)");
  await form.getByRole("button", { name: "Add a place" }).click();
  const second = form.getByRole("group", { name: "Grant 2" });
  await choose(second, "Role", "Viewer");
  await form
    .getByRole("group", { name: "Departments" })
    .getByRole("button", { name: "Water" })
    .click();
  await form.getByLabel("Add a department for them (optional)").fill("Hydrology");

  const sent = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/invitations"),
  );
  await form.getByRole("button", { name: "Send invitation" }).click();
  const body = (await sent).postDataJSON();
  expect(body).toMatchObject({
    email: "Amina@Example.org",
    name: "Amina Okello",
    department_ids: [2],
    new_departments: ["Hydrology"],
  });
  expect(body.grants).toHaveLength(2);
  expect(body.grants[0]).toEqual({ role_id: 3, geography_id: "geo-in-mp-bhopal" });
  expect(body.grants[1].role_id).toBe(5);

  await expect(page.getByRole("status")).toHaveText(
    "Invitation sent to amina@example.org.",
  );
  const row = invitations(page).getByRole("listitem", { name: "amina@example.org" });
  await expect(row).toContainText("Implementation officer · Bhopal Division");
  // Status is a tint with full-strength text, tags are 28px.
  const pending = row.getByText("Pending", { exact: true });
  await expect(pending).toHaveCSS("height", "28px");
  await expect(pending).toHaveCSS("color", "rgb(154, 74, 28)");
  await page.screenshot({ path: `${evidence}/people-invited.png`, fullPage: true });
  expect(api.unhandled).toEqual([]);
});

test("a member's access is edited, then they are disabled and enabled again", async ({
  page,
}) => {
  const api = await installFakeApi(page, { who: admin });
  await page.goto("/settings?tab=people");
  const ravi = members(page).getByRole("listitem", { name: "Ravi Patel" });
  await ravi.getByRole("button", { name: "Edit access" }).click();
  const form = dialog(page);
  await expect(
    page.getByRole("dialog", { name: "Edit Ravi Patel's access" }),
  ).toBeVisible();
  await choose(
    form.getByRole("group", { name: "Grant 1" }),
    "Role",
    "Implementation officer",
  );
  await form
    .getByRole("group", { name: "Departments" })
    .getByRole("button", { name: "Health" })
    .click();
  const saved = page.waitForRequest((request) => request.method() === "PUT");
  await form.getByRole("button", { name: "Save access" }).click();
  expect((await saved).postDataJSON()).toEqual({
    grants: [{ geography_id: "geo-in-mp-bhopal", role_id: 3 }],
    department_ids: [2, 1],
  });
  await expect(page.getByRole("status")).toHaveText(
    "Ravi Patel's access is saved and applies now.",
  );
  await expect(ravi).toContainText("Implementation officer · Bhopal Division");

  await ravi.getByRole("button", { name: "Disable" }).click();
  await expect(ravi.getByText("Disabled", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Ravi Patel is disabled and signed out.",
  );
  await ravi.getByRole("button", { name: "Enable" }).click();
  await expect(ravi.getByText("Active", { exact: true })).toBeVisible();
  expect(api.workspaces.writes).toEqual([
    "PUT /workspaces/workspace-in/members/ravi",
    "POST /workspaces/workspace-in/members/ravi/disable",
    "POST /workspaces/workspace-in/members/ravi/enable",
  ]);
});

test("pending invitations are resent and revoked, and refusals say why", async ({
  page,
}) => {
  const api = await installFakeApi(page, { who: admin });
  api.workspaces.invitations.push({
    id: "00000000-0000-4000-8000-000000000001",
    email: "late@example.org",
    status: "expired",
    grants: [{ role_id: 5, geography_id: "geo-in" }],
    departments: [],
  });
  await page.goto("/settings?tab=people");
  const late = invitations(page).getByRole("listitem", { name: "late@example.org" });
  await expect(late.getByText("Expired", { exact: true })).toBeVisible();
  await expect(late.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await late.getByRole("button", { name: "Resend" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Invitation sent again to late@example.org.",
  );
  await expect(late.getByText("Pending", { exact: true })).toBeVisible();
  await late.getByRole("button", { name: "Revoke" }).click();
  await expect(late.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(late.getByRole("button", { name: "Resend" })).toHaveCount(0);

  // The API refuses a role above the inviter's: the dialog says so and stays.
  api.on(/\/invitations$/, (route) =>
    route.request().method() === "POST"
      ? json(route, { error: "GRANT_EXCEEDS_YOUR_ACCESS" }, 403)
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Invite someone" }).click();
  await dialog(page).getByLabel("Full name").fill("Kofi");
  await dialog(page).getByLabel("Email").fill("kofi@example.org");
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText(
    "You cannot give a role higher than your own at that place.",
  );
  await expect(dialog(page)).toBeVisible();
});

test("a planning lead invites only within their places and up to their own role", async ({
  page,
}) => {
  const api = await installFakeApi(page, { who: lead });
  api.workspaces.canManage = false;
  await page.goto("/settings?tab=people");
  await expect(members(page).getByRole("button", { name: "Edit access" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Invite someone" }).click();
  const grant = dialog(page).getByRole("group", { name: "Grant 1" });
  await grant.getByRole("combobox", { name: "Role", exact: true }).click();
  await expect(page.getByRole("option")).toHaveText([
    /^Planning lead/,
    /^Implementation officer/,
    /^Viewer/,
  ]);
  await page.keyboard.press("Escape");
  await grant.getByRole("combobox", { name: "Place", exact: true }).click();
  // Their state and below; not the country above it.
  await expect(page.getByRole("option")).toHaveText([
    /^Madhya Pradesh \(State\)/,
    /^Bhopal Division \(Division\)/,
    /^Gwalior Division \(Division\)/,
  ]);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: `${evidence}/lead-invite.png`, fullPage: true });
});

test("a viewer reads people and departments but changes nothing", async ({ page }) => {
  const api = await installFakeApi(page, { who: viewer });
  api.workspaces.canManage = false;
  await page.goto("/settings?tab=people");
  await expect(members(page).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Departments" }).click();
  await expect(page.getByRole("list", { name: "Departments" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Add a department" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  // Roles and Workspaces are not theirs to see, even by URL.
  await page.goto("/settings?tab=roles");
  await expect(page).toHaveURL(/\/settings$/);
  expect(api.workspaces.writes).toEqual([]);
});

test("departments are rows: pick mine, add, rename, archive, delete, own", async ({
  page,
}) => {
  const api = await installFakeApi(page, { who: admin });
  await page.goto("/settings?tab=departments");
  const card = page.getByRole("region", { name: "Departments in India" });
  const mine = page.getByRole("group", { name: "My departments" });
  await mine.getByRole("button", { name: "Water" }).click();
  await expect(mine.getByRole("button", { name: "Water" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(api.workspaces.mine).toEqual([2]);

  await page.getByRole("textbox", { name: "Add a department" }).fill("Hydrology");
  await page
    .getByRole("form", { name: "Add a department" })
    .getByRole("button", { name: "Add" })
    .click();
  const list = page.getByRole("list", { name: "Departments" });
  await expect(list.getByRole("listitem", { name: "Hydrology" })).toBeVisible();
  await page.getByRole("textbox", { name: "Add a department" }).fill("hydrology");
  await page
    .getByRole("form", { name: "Add a department" })
    .getByRole("button", { name: "Add" })
    .click();
  await expect(card.getByRole("alert")).toHaveText(
    "That department is already on the list.",
  );

  const hydrology = list.getByRole("listitem", { name: "Hydrology" });
  await hydrology.getByRole("button", { name: "Rename" }).click();
  await hydrology.getByLabel("New name").fill("Water resources");
  await hydrology.getByRole("button", { name: "Save" }).click();
  await expect(list.getByRole("listitem", { name: "Water resources" })).toBeVisible();

  // In use: refused with a reason; archive instead.
  const health = list.getByRole("listitem", { name: "Health" });
  await health.getByRole("button", { name: "Delete" }).click();
  await expect(card.getByRole("alert")).toHaveText(
    "Departments with members or ownership can be archived, not deleted.",
  );
  await health.getByRole("button", { name: "Archive" }).click();
  await expect(health.getByText("Archived", { exact: true })).toBeVisible();
  await expect(mine.getByRole("button", { name: "Health" })).toHaveCount(0);
  await list
    .getByRole("listitem", { name: "Water resources" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(list.getByRole("listitem", { name: "Water resources" })).toHaveCount(0);

  // A Workspace admin sets what a department owns.
  await list
    .getByRole("listitem", { name: "Labour" })
    .getByRole("button", { name: "Ownership" })
    .click();
  await dialog(page)
    .getByRole("group", { name: "VRA indicator groups" })
    .getByRole("button", { name: "Occupational exposure" })
    .click();
  const owned = page.waitForRequest((request) => request.url().endsWith("/ownership"));
  await dialog(page).getByRole("button", { name: "Save ownership" }).click();
  expect((await owned).postDataJSON()).toEqual({
    resources: [{ kind: "vra_indicator_group", key: "Occupational exposure" }],
  });
  await expect(list.getByRole("listitem", { name: "Labour" })).toContainText(
    "owns Occupational exposure",
  );
  await page.screenshot({ path: `${evidence}/departments.png`, fullPage: true });
  expect(api.unhandled).toEqual([]);
});

test("the Roles tab shows what each role may do", async ({ page }) => {
  await installFakeApi(page, { who: admin });
  await page.goto("/settings?tab=roles");
  const table = page.getByRole("table", { name: "Role capabilities" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Area",
    "Workspace admin",
    "Planning lead",
    "Implementation officer",
    "Data officer",
    "Viewer",
  ]);
  const people = table.getByRole("row", { name: /^People/ });
  await expect(people.getByRole("cell")).toHaveText([
    "Manage",
    "Write",
    "Read",
    "Read",
    "Read",
  ]);
  const settings = table.getByRole("row", { name: /^Workspace settings/ });
  await expect(settings.getByRole("cell")).toHaveText(["Manage", "—", "—", "—", "—"]);
  await page.screenshot({ path: `${evidence}/roles.png`, fullPage: true });
});

test("a platform admin lists workspaces and creates one for a country", async ({
  page,
}) => {
  const api = await installKenya(page, true, ["/kenya"], {
    who: { ...admin, places: ["/india"] },
  });
  await page.goto("/settings?tab=workspaces");
  const list = page.getByRole("list", { name: "Workspaces" });
  await expect(list.getByRole("listitem")).toHaveText([/India/]);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Kenya has a workspace with the default roles and departments.",
  );
  await expect(list.getByRole("listitem", { name: "Kenya" })).toBeVisible();
  // With two workspaces, People offers a switch between them.
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page.getByRole("combobox", { name: "Workspace" })).toBeVisible();
  expect(api.workspaces.writes).toEqual(["POST /workspaces"]);
});

test("the access tabs fit a phone without sideways scrolling", async ({ page }) => {
  await installFakeApi(page, { who: admin });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["people", "departments", "roles"]) {
    await page.goto(`/settings?tab=${tab}`);
    await expect(page.getByRole("status", { name: /^Loading/ })).toHaveCount(0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${evidence}/${tab}-phone.png`, fullPage: true });
  }
});
