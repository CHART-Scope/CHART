import { readFileSync } from "node:fs";

import { type Page } from "@playwright/test";

import {
  catalogEntry,
  geographies,
  installFakeApi,
  json,
  type FakeApi,
} from "./fakeApi";

// Responses produced by the real Python service from the modeller's published
// Kenya tables (v2_2026_10_06) and the dev database's county shapes. The
// browser sees his numbers and real geometry, not invented ones.
type MapValues = Record<string, Record<string, Record<string, unknown>>>;
type Option = { code: string; label: string; exploratory?: boolean };
type Outlook = Record<string, unknown> & { selectors: Option[]; scenarios: Option[] };

export const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/heat-outlook-kenya.json", import.meta.url), "utf8"),
) as {
  outlook: Record<string, Outlook>;
  mapFrame: { areas: { geography_id: string }[] };
  mapValues: MapValues;
};

// Observed months scored by the real Python service from the dev database's
// ERA5 rows, keyed "<geography>|<outcome>|<selector>|<month>" ("latest" for
// the request without a month); map values keyed "<outcome>|<selector>|<month>".
type Observed = Record<string, unknown> & { selectors: Option[]; month: string | null };
export const observedFixtures = JSON.parse(
  readFileSync(new URL("../fixtures/observed-kenya.json", import.meta.url), "utf8"),
) as { observed: Record<string, Observed>; mapValues: MapValues };

const county = (slug: string, name: string) => ({
  id: `geo-ke-${slug}`,
  name,
  path: `/kenya/${slug}`,
  levelLabel: "County",
  parentId: "geo-ke",
  supportsPrediction: true,
  models: [
    { outcome: "lbw", modelAreaName: name, releaseId: "ke-lbw" },
    { outcome: "under_5_mortality", modelAreaName: name, releaseId: "ke-u5" },
  ],
});

const kenya = [
  {
    id: "geo-ke",
    name: "Kenya",
    path: "/kenya",
    levelLabel: "Country",
    parentId: null,
    models: [],
  },
  county("kajiado", "Kajiado"),
  county("garissa", "Garissa"),
  county("narok", "Narok"),
];

const OUTCOMES = ["lbw", "under_5_mortality"] as const;

type Values = {
  selectors: string[];
  default_selector: string | null;
  scenarios: string[];
  default_scenario: string | null;
  data_modes: string[];
};

/** The national file's options for one outcome, as the API lists them. */
function available(outcome: string) {
  const outlook = fixtures.outlook[`geo-ke|${outcome}|${defaultSelectorFor(outcome)}`];
  const view = (option: Option) => ({
    code: option.code,
    label: option.label,
    views: ["outlook"],
  });
  return {
    selector_label: outcome === "lbw" ? "Pregnancy windows" : "Age groups",
    selectors: outlook.selectors.map(view),
    scenarios: outlook.scenarios.map(view),
    data_modes: [
      {
        code: "observed",
        label: "Observed months (Copernicus ERA5)",
        views: ["outlook"],
      },
      {
        code: "projection",
        label: "Long-term projections (climate scenarios)",
        views: ["outlook"],
      },
    ],
  };
}

function defaultSelectorFor(outcome: string) {
  return outcome === "lbw" ? "P" : "postneonatal";
}

/** The API's defaults: LBW shows only the whole pregnancy, the rest all on. */
function defaults(outcome: string): Values {
  const options = available(outcome);
  return {
    selectors:
      outcome === "lbw" ? ["P"] : options.selectors.map((option) => option.code),
    default_selector: defaultSelectorFor(outcome),
    scenarios: options.scenarios.map((option) => option.code),
    default_scenario: "ssp585",
    data_modes: ["observed", "projection"],
  };
}

/** The same refusals the API makes, so the settings page shows them. */
function refusal(values: Values): string | null {
  if (!values.selectors.length || !values.scenarios.length || !values.data_modes.length)
    return "MODEL_SETTINGS_OPTION_REQUIRED";
  if (
    !values.default_selector ||
    !values.selectors.includes(values.default_selector) ||
    !values.default_scenario ||
    !values.scenarios.includes(values.default_scenario)
  )
    return "MODEL_SETTINGS_DEFAULT_NOT_ENABLED";
  return null;
}

export type KenyaApi = FakeApi & {
  /** Every model-settings PUT body, in order, keyed "KE/<outcome>". */
  settingsWrites: { path: string; body: Values }[];
};

export type KenyaOptions = {
  roles?: string[];
  /** HTTP status the observed endpoints answer with instead of a body. */
  observedStatus?: number;
  /** Saved settings to start from, per outcome; the defaults otherwise. */
  settings?: Partial<Record<(typeof OUTCOMES)[number], Partial<Values>>>;
};

export async function installKenya(
  page: Page,
  published = true,
  geographyScopes = ["/kenya"],
  options: KenyaOptions = {},
): Promise<KenyaApi> {
  const api = (await installFakeApi(page)) as KenyaApi;
  api.settingsWrites = [];
  const canReadKenya = geographyScopes.some((scope) => "/kenya".startsWith(scope));
  const saved = new Map<string, Values>(
    OUTCOMES.map((outcome) => [
      outcome,
      { ...defaults(outcome), ...options.settings?.[outcome] },
    ]),
  );
  const changed = new Set(Object.keys(options.settings ?? {}));
  const item = (outcome: string) => ({
    country_code: "KE",
    country_name: "Kenya",
    outcome,
    available: available(outcome),
    settings: saved.get(outcome),
    is_default: !changed.has(outcome),
    updated_by_user_id: changed.has(outcome) ? "e2e-user" : null,
    updated_at: null,
  });

  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "e2e-user",
      username: "planner",
      roles: options.roles ?? ["health_planning_lead"],
      geographyScopes,
    }),
  );
  api.on(/^\/api\/chart\/geographies$/, (route) =>
    json(route, [...geographies, ...kenya]),
  );
  api.on(/^\/api\/chart\/model-catalog$/, (route) =>
    json(route, {
      items: [
        catalogEntry("lbw", "Low birth weight", "ke-lbw"),
        catalogEntry("under_5_mortality", "Under-five mortality", "ke-u5"),
      ],
    }),
  );
  api.on(/^\/api\/chart\/model-settings$/, (route) =>
    json(route, { items: canReadKenya ? OUTCOMES.map(item) : [] }),
  );
  api.on(/^\/api\/chart\/model-settings\/KE\/[^/]+$/, (route, url) => {
    const outcome = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    if (route.request().method() !== "PUT" || !saved.has(outcome))
      return json(route, { error: "E2E_UNHANDLED" }, 404);
    if (!canReadKenya) return json(route, { error: "GEOGRAPHY_OUT_OF_SCOPE" }, 403);
    const body = route.request().postDataJSON() as Values;
    api.settingsWrites.push({ path: `KE/${outcome}`, body });
    const refused = refusal(body);
    if (refused) return json(route, { error: refused }, 422);
    saved.set(outcome, body);
    changed.add(outcome);
    return json(route, item(outcome));
  });

  // The outlook endpoints apply the saved settings the way the API does:
  // disabled options are left out of the lists and refused when asked for.
  const selection = (url: URL) => {
    const outcome = url.searchParams.get("outcome") ?? "lbw";
    const settings = saved.get(outcome) ?? defaults(outcome);
    const selector =
      url.searchParams.get("selector") ?? settings.default_selector ?? "";
    return {
      outcome,
      settings,
      selector,
      enabled: settings.selectors.includes(selector),
    };
  };
  const views = (settings: Values) =>
    ["observed", "projection"].filter((view) => settings.data_modes.includes(view));
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+\/observed\/map$/, (route, url) => {
    const { outcome, settings, selector, enabled } = selection(url);
    // Without a month the API maps Kenya's newest month, as captured.
    const national = observedFixtures.observed[`geo-ke|${outcome}|${selector}|latest`];
    const month = url.searchParams.get("month") ?? national?.month;
    const values = observedFixtures.mapValues[`${outcome}|${selector}|${month}`];
    if (options.observedStatus)
      return json(route, { error: "E2E_FAILURE" }, options.observedStatus);
    if (!settings.data_modes.includes("observed"))
      return json(route, { error: "VIEW_TURNED_OFF" }, 404);
    if (!values) return json(route, { error: "OBSERVED_NOT_AVAILABLE" }, 404);
    if (!enabled) return json(route, { error: "OUTLOOK_SELECTION_INVALID" }, 422);
    return json(route, {
      ...fixtures.mapFrame,
      outcome,
      metric: "heat_attributable_share_observed_month",
      areas: fixtures.mapFrame.areas.map((area) => ({
        ...area,
        ...values[area.geography_id],
      })),
    });
  });
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+\/observed$/, (route, url) => {
    const geography = url.pathname.split("/").slice(-2)[0];
    const { outcome, settings, selector, enabled } = selection(url);
    const month = url.searchParams.get("month") ?? "latest";
    if (options.observedStatus)
      return json(route, { error: "E2E_FAILURE" }, options.observedStatus);
    if (!settings.data_modes.includes("observed"))
      return json(route, { error: "VIEW_TURNED_OFF" }, 404);
    const body =
      observedFixtures.observed[`${geography}|${outcome}|${selector}|${month}`];
    if (!body) return json(route, { error: "OBSERVED_NOT_AVAILABLE" }, 404);
    if (!enabled) return json(route, { error: "OUTLOOK_SELECTION_INVALID" }, 422);
    return json(route, {
      ...body,
      selectors: body.selectors.filter((o) => settings.selectors.includes(o.code)),
      data_modes: views(settings),
    });
  });
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+\/map$/, (route, url) => {
    const { outcome, selector, enabled } = selection(url);
    const peak = url.searchParams.get("reference") === "peak" ? "|peak" : "";
    const values = fixtures.mapValues[`${outcome}|${selector}${peak}`];
    if (!published || !values)
      return json(route, { error: "OUTLOOK_NOT_PUBLISHED" }, 404);
    if (!enabled) return json(route, { error: "OUTLOOK_SELECTION_INVALID" }, 422);
    return json(route, {
      ...fixtures.mapFrame,
      outcome,
      areas: fixtures.mapFrame.areas.map((area) => ({
        ...area,
        ...values[area.geography_id],
      })),
    });
  });
  api.on(/^\/api\/chart\/heat-outlook\/[^/]+$/, (route, url) => {
    const geography = url.pathname.split("/").pop();
    const { outcome, settings, selector, enabled } = selection(url);
    const body = published
      ? fixtures.outlook[`${geography}|${outcome}|${selector}`]
      : undefined;
    if (!body) return json(route, { error: "OUTLOOK_NOT_PUBLISHED" }, 404);
    if (!enabled) return json(route, { error: "OUTLOOK_SELECTION_INVALID" }, 422);
    if (!settings.data_modes.includes("projection"))
      return json(route, { error: "VIEW_TURNED_OFF" }, 404);
    return json(route, {
      ...body,
      selectors: body.selectors.filter((o) => settings.selectors.includes(o.code)),
      scenarios: body.scenarios.filter((o) => settings.scenarios.includes(o.code)),
      data_modes: views(settings),
    });
  });
  return api;
}
