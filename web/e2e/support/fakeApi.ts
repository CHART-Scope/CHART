import { type Page, type Route } from "@playwright/test";

/**
 * The CHART API as the browser sees it, answered at the network boundary.
 *
 * Every request the app makes goes to same-origin `/api/*`, so the real Next
 * build runs unmodified and only the Python API and Keycloak behind it are
 * replaced. Fixtures model one country (India) with one state (Madhya
 * Pradesh) that has an LBW model but no under-five model, and two divisions
 * that have both - the shape that exercises the state/division selectors.
 */

export const accessToken = fakeJwt({ sub: "e2e-user", exp: 4_102_444_800 });

export const geographies = [
  {
    id: "geo-in",
    name: "India",
    path: "/india",
    levelLabel: "Country",
    parentId: null,
    models: [],
  },
  {
    id: "geo-in-mp",
    name: "Madhya Pradesh",
    path: "/india/madhya-pradesh",
    levelLabel: "State",
    parentId: "geo-in",
    models: [{ outcome: "lbw", modelAreaName: "Madhya Pradesh", releaseId: "lbw-1" }],
  },
  ...["Bhopal", "Gwalior"].map((name) => ({
    id: `geo-in-mp-${name.toLowerCase()}`,
    name: `${name} Division`,
    path: `/india/madhya-pradesh/${name.toLowerCase()}`,
    levelLabel: "Division",
    parentId: "geo-in-mp",
    models: [
      { outcome: "lbw", modelAreaName: name, releaseId: "lbw-1" },
      { outcome: "under_five_mortality", modelAreaName: name, releaseId: "u5-1" },
    ],
  })),
];

const catalog = [
  catalogEntry("lbw", "Low birth weight", "lbw-1"),
  catalogEntry("under_five_mortality", "Under-five mortality", "u5-1"),
];

export type FakeApi = {
  /** Every request the page sent, as "METHOD /path?query". */
  requests: string[];
  /** Requests no handler answered - a test fails if any remain. */
  unhandled: string[];
  /** Override or delay one endpoint. Matched against the path, first wins. */
  on: (
    pattern: RegExp,
    handler: (route: Route, url: URL) => Promise<void> | void,
  ) => void;
};

export async function installFakeApi(
  page: Page,
  options: { monthly?: (url: URL) => unknown; map?: (url: URL) => unknown } = {},
): Promise<FakeApi> {
  const overrides: [RegExp, (route: Route, url: URL) => Promise<void> | void][] = [];
  const api: FakeApi = {
    requests: [],
    unhandled: [],
    on: (pattern, handler) => overrides.push([pattern, handler]),
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    api.requests.push(`${method} ${url.pathname}${url.search}`);
    const override = overrides.find(([pattern]) => pattern.test(url.pathname));
    if (override) return override[1](route, url);

    const path = url.pathname;
    if (path === "/api/auth/keycloak-refresh")
      return json(route, { access_token: accessToken });
    if (path === "/api/chart/auth/me") {
      return json(route, {
        userId: "e2e-user",
        username: "planner",
        roles: ["health_planning_lead"],
        geographyScopes: ["/india"],
      });
    }
    if (path === "/api/chart/audit/events" || path.startsWith("/api/chart/audit")) {
      return json(route, {}, 202);
    }
    if (path === "/api/chart/geographies") return json(route, geographies);
    if (path === "/api/chart/model-catalog") return json(route, { items: catalog });
    if (/^\/api\/chart\/risk\/[^/]+\/map$/.test(path)) {
      return json(route, options.map?.(url) ?? mapFor(url));
    }
    if (/^\/api\/chart\/risk\/[^/]+\/monthly$/.test(path)) {
      return json(route, options.monthly?.(url) ?? { admin_unit_id: 1, months: {} });
    }
    if (path === "/api/chart/recommended-actions") return json(route, { items: [] });
    if (path === "/api/chart/climate/predict") {
      return json(route, { request_id: 1, status: "queued" }, 202);
    }
    const poll = path.match(/^\/api\/chart\/climate\/prediction-requests\/(\d+)$/);
    if (poll) {
      return json(route, {
        request_id: Number(poll[1]),
        status: "running",
        stage: "queued",
      });
    }
    api.unhandled.push(`${method} ${path}${url.search}`);
    return json(route, { error: "E2E_UNHANDLED" }, 404);
  });
  return api;
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Two division squares whose values depend on the outcome and month asked. */
export function mapFor(url: URL, overrides: { value?: number | null } = {}) {
  const outcome = url.searchParams.get("outcome") ?? "lbw";
  const month = url.searchParams.get("month");
  return {
    geography_id: url.pathname.split("/")[4],
    outcome,
    month,
    metric: "attributable_fraction",
    unit: "percent",
    bounds: [74, 21, 80, 24],
    simplify_tolerance_degrees: 0.01,
    areas: ["bhopal", "gwalior"].map((code, index) => ({
      geography_id: `geo-in-mp-${code}`,
      admin_unit_id: index + 1,
      code,
      name: `${code[0].toUpperCase()}${code.slice(1)} Division`,
      level: "division",
      value_percent:
        overrides.value === undefined ? (index === 0 ? 12 : null) : overrides.value,
      missing_reason: (
        overrides.value === undefined ? index === 0 : overrides.value !== null
      )
        ? null
        : "no_prediction",
      odds_ratio: 1.2,
      on_training_support: true,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [74 + index * 3, 21],
            [76.8 + index * 3, 21],
            [76.8 + index * 3, 24],
            [74 + index * 3, 24],
            [74 + index * 3, 21],
          ],
        ],
      },
    })),
  };
}

function catalogEntry(outcome: string, label: string, releaseId: string) {
  return {
    climate_hazard: "heat",
    climate_hazard_label: "Heat",
    health_domain: "maternal_child",
    health_domain_label: "Maternal and child health",
    outcome,
    outcome_label: label,
    dashboard_title: null,
    population_label: null,
    model_scope_label: null,
    effect_measure: "odds_ratio",
    batch_status: "ready",
    visualization_type: null,
    visualization_figure: null,
    visualization_context_figure: null,
    risk_description: null,
    release_ids: [releaseId],
  };
}

export function fakeJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}
