import { type Page } from "@playwright/test";

import { catalogEntry, installFakeApi, json, type FakeApi } from "./fakeApi";
import { fixtures as kenyaFixtures } from "./kenya";

/**
 * The vulnerability assessment API as the contract describes it, held in
 * memory: a catalogue, indicator values per area, CSV upload with row-level
 * validation, coverage, and a run that scores a frame's child areas the way
 * the engine does (5th-95th percentile min-max, direction, 2/3 component
 * coverage, LAC = 1 - AC, geometric mean, quartile classes, drivers).
 *
 * Two frames: Madhya Pradesh state with its ten divisions (square test
 * shapes), and Kenya with its 47 counties (real shapes from the outlook
 * fixture). Every number here is test data; nothing reaches the app's source.
 */

type Indicator = {
  code: string;
  component: "hazard" | "exposure" | "sensitivity" | "adaptive_capacity";
  category: string;
  name: string;
  unit: string;
  direction_to_risk: 1 | -1;
  route: "computed" | "upload" | "manual" | "pull";
  status: "included" | "context" | "dropped";
  rationale: string;
};

const indicator = (
  code: string,
  component: Indicator["component"],
  name: string,
  unit: string,
  direction: 1 | -1,
  route: Indicator["route"] = "upload",
  status: Indicator["status"] = "included",
): Indicator => ({
  code,
  component,
  category: component,
  name,
  unit,
  direction_to_risk: direction,
  route,
  status,
  rationale: `${name} (test catalogue)`,
});

export const catalogue: Indicator[] = [
  indicator(
    "haz.heatwave_days_12m",
    "hazard",
    "Heatwave days, last 12 months",
    "days",
    1,
    "computed",
  ),
  indicator(
    "haz.tmax_monthly_max_12m",
    "hazard",
    "Hottest monthly maximum",
    "°C",
    1,
    "computed",
  ),
  indicator("haz.flood_events", "hazard", "Flood events", "events per decade", 1),
  indicator(
    "haz.utci_heat_stress_days",
    "hazard",
    "UTCI heat stress days",
    "days",
    1,
    "pull",
  ),
  indicator(
    "haz.cyclone_events",
    "hazard",
    "Cyclone events",
    "events",
    1,
    "upload",
    "dropped",
  ),
  indicator(
    "exp.population_density",
    "exposure",
    "Population density",
    "persons/km²",
    1,
  ),
  indicator(
    "exp.agri_workers_share",
    "exposure",
    "Agricultural workers",
    "% of workers",
    1,
  ),
  indicator(
    "sens.child_0_6_share",
    "sensitivity",
    "Children aged 0–6",
    "% of population",
    1,
  ),
  indicator(
    "sens.elderly_share",
    "sensitivity",
    "People aged 65+",
    "% of population",
    1,
  ),
  indicator(
    "sens.anaemia_women",
    "sensitivity",
    "Anaemia in women",
    "% women 15–49",
    1,
  ),
  indicator(
    "ac.women_10yr_schooling",
    "adaptive_capacity",
    "Women with 10+ years of schooling",
    "%",
    -1,
  ),
  indicator(
    "ac.health_insurance",
    "adaptive_capacity",
    "Households with health insurance",
    "%",
    -1,
  ),
  indicator(
    "ac.improved_sanitation",
    "adaptive_capacity",
    "Improved sanitation",
    "%",
    -1,
  ),
  indicator(
    "ac.heat_action_plan",
    "adaptive_capacity",
    "Heat action plan in place",
    "yes = 1",
    -1,
    "manual",
  ),
  indicator(
    "ctx.state_health_adaptation_plan",
    "adaptive_capacity",
    "State health adaptation plan",
    "yes = 1",
    -1,
    "manual",
    "context",
  ),
];

const MP_DIVISIONS = [
  "bhopal",
  "chambal",
  "gwalior",
  "indore",
  "jabalpur",
  "narmadapuram",
  "rewa",
  "sagar",
  "shahdol",
  "ujjain",
];

const title = (code: string) => `${code[0].toUpperCase()}${code.slice(1)}`;

type Area = {
  geography_id: string;
  admin_unit_id: number;
  code: string;
  name: string;
  level: string;
  geometry: { type: string; coordinates: unknown };
};

type Frame = {
  id: string;
  name: string;
  path: string;
  levelLabel: string;
  areaLevel: string;
  bounds: number[];
  areas: Area[];
};

const madhyaPradesh: Frame = {
  id: "geo-in-madhya-pradesh",
  name: "Madhya Pradesh",
  path: "/india/madhya-pradesh",
  levelLabel: "State",
  areaLevel: "Division",
  bounds: [74, 21, 84, 26],
  areas: MP_DIVISIONS.map((code, index) => {
    const west = 74 + (index % 5) * 2;
    const south = 21 + Math.floor(index / 5) * 2.5;
    return {
      geography_id: `geo-in-madhya-pradesh-division-${code}`,
      admin_unit_id: 100 + index,
      code,
      name: `${title(code)} Division`,
      level: "division",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [west + 1.9, south],
            [west + 1.9, south + 2.4],
            [west, south + 2.4],
            [west, south],
          ],
        ],
      },
    };
  }),
};

const kenya: Frame = {
  id: "geo-ke",
  name: "Kenya",
  path: "/kenya",
  levelLabel: "Country",
  areaLevel: "County",
  bounds: (kenyaFixtures.mapFrame as unknown as { bounds: number[] }).bounds,
  areas: (kenyaFixtures.mapFrame.areas as unknown as (Area & { name: string })[]).map(
    (area) => ({
      geography_id: area.geography_id,
      admin_unit_id: area.admin_unit_id,
      code: area.code,
      name: area.name,
      level: "county",
      geometry: area.geometry,
    }),
  ),
};

export const frames = { madhyaPradesh, kenya };

/** The places the app sees: India with MP and its divisions, Kenya and its counties. */
export const vraGeographies = [
  {
    id: "geo-in",
    name: "India",
    path: "/india",
    levelLabel: "Country",
    parentId: null,
    models: [],
  },
  {
    id: madhyaPradesh.id,
    name: madhyaPradesh.name,
    path: madhyaPradesh.path,
    levelLabel: "State",
    parentId: "geo-in",
    models: [{ outcome: "lbw", modelAreaName: "Madhya Pradesh", releaseId: "lbw-1" }],
  },
  ...madhyaPradesh.areas.map((area) => ({
    id: area.geography_id,
    name: area.name,
    path: `${madhyaPradesh.path}/${area.code}`,
    levelLabel: "Division",
    parentId: madhyaPradesh.id,
    models: [{ outcome: "lbw", modelAreaName: title(area.code), releaseId: "lbw-1" }],
  })),
  {
    id: kenya.id,
    name: "Kenya",
    path: "/kenya",
    levelLabel: "Country",
    parentId: null,
    models: [],
  },
  ...kenya.areas.map((area) => ({
    id: area.geography_id,
    name: area.name,
    path: `/kenya/${area.code}`,
    levelLabel: "County",
    parentId: kenya.id,
    models: [{ outcome: "lbw", modelAreaName: area.name, releaseId: "ke-lbw" }],
  })),
];

type Value = {
  indicator: string;
  area: string;
  value: number;
  vintage: string;
  source_name: string;
  source_url: string | null;
  method: "computed" | "upload" | "manual";
  updated_at: string;
  flags?: Record<string, unknown>;
};

/** A deterministic spread of test values, different per area and indicator. */
function testValue(code: string, index: number, count: number): number {
  const seed = [...code].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const position = ((index * 7 + seed) % count) / Math.max(count - 1, 1);
  const ranges: Record<string, [number, number]> = {
    "haz.heatwave_days_12m": [4, 38],
    "haz.tmax_monthly_max_12m": [38.5, 45.5],
    "haz.flood_events": [0, 6],
    "exp.population_density": [120, 860],
    "exp.agri_workers_share": [38, 78],
    "sens.child_0_6_share": [12, 19],
    "sens.elderly_share": [4.5, 8.5],
    "sens.anaemia_women": [42, 68],
    "ac.women_10yr_schooling": [18, 46],
    "ac.health_insurance": [22, 61],
    "ac.improved_sanitation": [35, 82],
  };
  const [low, high] = ranges[code] ?? [0, 1];
  return Math.round((low + position * (high - low)) * 10) / 10;
}

/** Census- and survey-style values for every uploadable indicator. */
export function seedValues(frame: Frame, options: { skip?: string[] } = {}): Value[] {
  const values: Value[] = [];
  for (const item of catalogue) {
    if (item.route !== "upload" || item.status !== "included") continue;
    frame.areas.forEach((area, index) => {
      // One area lacks exposure data, so it cannot be scored.
      if (options.skip?.includes(area.code) && item.component === "exposure") return;
      values.push({
        indicator: item.code,
        area: area.code,
        value: testValue(item.code, index, frame.areas.length),
        vintage:
          item.code.startsWith("sens.") || item.code.startsWith("ac.")
            ? "2019-21"
            : "2011",
        source_name: item.code.startsWith("exp.")
          ? "Census of India 2011"
          : "NFHS-5 district fact sheets",
        source_url: "https://example.org/test-source.csv",
        method: "upload",
        updated_at: "2026-10-20T09:00:00Z",
      });
    });
  }
  // A plan every area has: the same value everywhere, so it cannot spread.
  for (const area of frame.areas)
    values.push({
      indicator: "ac.heat_action_plan",
      area: area.code,
      value: 1,
      vintage: "2025",
      source_name: "State heat action plan register",
      source_url: null,
      method: "manual",
      updated_at: "2026-10-20T09:00:00Z",
      flags: { state_level: true },
    });
  return values;
}

/** Linear-interpolated percentile, as numpy's default. */
function percentile(sorted: number[], p: number): number {
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

type Scored = ReturnType<typeof score>;

function score(frame: Frame, values: Value[], runId: number) {
  const latest = new Map<string, Value>();
  for (const value of values) {
    const key = `${value.indicator}|${value.area}`;
    const held = latest.get(key);
    if (!held || held.vintage < value.vintage) latest.set(key, value);
  }
  const included = catalogue.filter((item) => item.status === "included");
  const bounds = new Map<
    string,
    { lo: number; hi: number } | "no_spread" | "too_few"
  >();
  for (const item of included) {
    const present = frame.areas
      .map((area) => latest.get(`${item.code}|${area.code}`)?.value)
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);
    if (present.length < 3) {
      bounds.set(item.code, "too_few");
      continue;
    }
    const lo = percentile(present, 0.05);
    const hi = percentile(present, 0.95);
    bounds.set(item.code, hi === lo ? "no_spread" : { lo, hi });
  }

  const components = [
    "hazard",
    "exposure",
    "sensitivity",
    "adaptive_capacity",
  ] as const;
  const usable = (component: string) =>
    included.filter(
      (item) =>
        item.component === component && typeof bounds.get(item.code) === "object",
    );

  const areas = frame.areas.map((area) => {
    const indicators = included.map((item) => {
      const held = latest.get(`${item.code}|${area.code}`);
      const bound = bounds.get(item.code);
      let normalised: number | null = null;
      if (held && typeof bound === "object") {
        const clipped = Math.min(Math.max(held.value, bound.lo), bound.hi);
        const s = (clipped - bound.lo) / (bound.hi - bound.lo);
        normalised = item.direction_to_risk === -1 ? 1 - s : s;
      }
      return { item, held, normalised, bound };
    });
    const componentScores = {} as Record<(typeof components)[number], number | null>;
    const coverage = {} as Record<(typeof components)[number], number | null>;
    const weights = new Map<string, number>();
    for (const component of components) {
      const candidates = usable(component);
      const present = indicators.filter(
        (row) => row.item.component === component && row.normalised !== null,
      );
      coverage[component] = candidates.length
        ? present.length / candidates.length
        : null;
      const enough =
        present.length >= 1 && present.length >= (2 / 3) * candidates.length;
      if (!enough) {
        componentScores[component] = null;
        continue;
      }
      const mean =
        present.reduce((sum, row) => sum + (row.normalised ?? 0), 0) / present.length;
      for (const row of present) weights.set(row.item.code, 1 / present.length);
      // Capacity: indicator scores are risk-oriented, so the component is
      // reported as capacity (higher = better) and enters as its lack.
      componentScores[component] = component === "adaptive_capacity" ? 1 - mean : mean;
    }
    const lac =
      componentScores.adaptive_capacity === null
        ? null
        : 1 - componentScores.adaptive_capacity;
    const parts = [componentScores.sensitivity, lac].filter(
      (v): v is number => v !== null,
    );
    const vulnerability = parts.length
      ? parts.reduce((a, b) => a + b, 0) / parts.length
      : null;
    const { hazard, exposure } = componentScores;
    const risk =
      hazard === null || exposure === null || vulnerability === null
        ? null
        : Math.cbrt(
            Math.max(hazard, 0.01) *
              Math.max(exposure, 0.01) *
              Math.max(vulnerability, 0.01),
          );
    const rows = indicators.map(({ item, held, normalised, bound }) => {
      const weight = weights.get(item.code) ?? null;
      return {
        code: item.code,
        name: item.name,
        component: item.component,
        unit: item.unit,
        direction_to_risk: item.direction_to_risk,
        raw: held?.value ?? null,
        vintage: held?.vintage ?? null,
        normalised,
        weight,
        contribution:
          weight !== null && normalised !== null ? weight * normalised : null,
        method: held?.method ?? (item.route === "computed" ? "computed" : null),
        source_name: held?.source_name ?? null,
        source_url: held?.source_url ?? null,
        quality_flags: held?.flags ?? {},
        excluded_reason: bound === "no_spread" ? "no_spread" : null,
      };
    });
    const drivers = rows
      .filter((row) => row.normalised !== null && row.normalised >= 0.8)
      .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0))
      .slice(0, 3)
      .map((row) => ({
        code: row.code,
        name: row.name,
        component: row.component,
        normalised: row.normalised as number,
      }));
    return {
      summary: {
        geography_id: area.geography_id,
        admin_unit_id: area.admin_unit_id,
        code: area.code,
        name: area.name,
        risk,
        risk_class: null as string | null,
        rank: null as number | null,
        components: { ...componentScores, vulnerability },
        coverage,
        drivers,
        missing_reason: risk === null ? "insufficient_data" : null,
      },
      indicators: rows,
    };
  });

  const risks = areas
    .map((area) => area.summary.risk)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const breaks = risks.length ? [0.25, 0.5, 0.75].map((p) => percentile(risks, p)) : [];
  const classOf = (risk: number) =>
    risk <= breaks[0]
      ? "low"
      : risk <= breaks[1]
        ? "moderate"
        : risk <= breaks[2]
          ? "high"
          : "very_high";
  [...areas]
    .filter((area) => area.summary.risk !== null)
    .sort((a, b) => (b.summary.risk ?? 0) - (a.summary.risk ?? 0))
    .forEach((area, index) => {
      area.summary.rank = index + 1;
      area.summary.risk_class = classOf(area.summary.risk as number);
    });
  areas.sort(
    (a, b) =>
      (a.summary.rank ?? Number.MAX_SAFE_INTEGER) -
      (b.summary.rank ?? Number.MAX_SAFE_INTEGER),
  );
  return {
    run: {
      id: runId,
      created_at: "2026-10-22T10:30:00Z",
      method_version: "vra-v1",
      weights: "equal",
      area_count: frame.areas.length,
      indicator_count: included.filter(
        (item) => typeof bounds.get(item.code) === "object",
      ).length,
      class_breaks: breaks,
    },
    areas,
  };
}

/** Hazard values the run computes from the climate store. */
function computedValues(frame: Frame): Value[] {
  return catalogue
    .filter((item) => item.route === "computed")
    .flatMap((item) =>
      frame.areas.map((area, index) => ({
        indicator: item.code,
        area: area.code,
        value: testValue(item.code, index, frame.areas.length),
        vintage: "2025-10/2026-09",
        source_name: "ERA5 (CHART climate store)",
        source_url: null,
        method: "computed" as const,
        updated_at: "2026-10-22T10:30:00Z",
        flags: { months: 12, variable: item.code, aggregation: "sum" },
      })),
    );
}

type Ingestion = {
  id: number;
  status: "completed" | "failed";
  file_name: string | null;
  rows_accepted: number;
  rows_rejected: number;
  rejections: { row: number; reason: string }[];
  created_at: string;
  requested_by: string | null;
};

export type VraApi = FakeApi & {
  /** CSV bodies posted to values, in order. */
  uploads: {
    frame: string;
    fileName: string | null;
    body: string;
    contentType: string;
  }[];
  runs: string[];
};

export type VraOptions = {
  roles?: string[];
  geographyScopes?: string[];
  /** Frames that already hold values and a stored run. */
  assessed?: ("mp" | "ke")[];
  /** Frames that hold uploaded values but have never been run. */
  seeded?: ("mp" | "ke")[];
};

export async function installVra(
  page: Page,
  options: VraOptions = {},
): Promise<VraApi> {
  const api = (await installFakeApi(page)) as VraApi;
  api.uploads = [];
  api.runs = [];
  const roles = options.roles ?? ["chart_admin", "health_planning_lead"];
  const scopes = options.geographyScopes ?? ["/india", "/kenya"];
  const isAdmin = roles.includes("chart_admin");
  const byId = new Map([
    [madhyaPradesh.id, madhyaPradesh],
    [kenya.id, kenya],
  ]);
  const key = (frame: Frame) => (frame === madhyaPradesh ? "mp" : "ke");
  const values = new Map<string, Value[]>();
  const results = new Map<string, Scored>();
  const ingestions = new Map<string, Ingestion[]>();
  let runIds = 0;
  for (const frame of [madhyaPradesh, kenya]) {
    const state = key(frame);
    const seeded = options.assessed?.includes(state) || options.seeded?.includes(state);
    values.set(
      frame.id,
      seeded ? seedValues(frame, { skip: ["shahdol", "lamu"] }) : [],
    );
    ingestions.set(frame.id, []);
    if (options.assessed?.includes(state)) {
      values.get(frame.id)?.push(...computedValues(frame));
      results.set(frame.id, score(frame, values.get(frame.id) ?? [], ++runIds));
    }
  }

  api.on(/^\/api\/chart\/auth\/me$/, (route) =>
    json(route, {
      userId: "e2e-user",
      username: isAdmin ? "admin" : "planner",
      roles,
      geographyScopes: scopes,
    }),
  );
  api.on(/^\/api\/chart\/geographies$/, (route) => json(route, vraGeographies));
  api.on(/^\/api\/chart\/model-catalog$/, (route) =>
    json(route, { items: [catalogEntry("lbw", "Low birth weight", "lbw-1")] }),
  );
  api.on(/^\/api\/chart\/vra\/indicators$/, (route) =>
    json(route, { items: catalogue }),
  );
  // Settings > Data also holds the climate card; nothing pulled here.
  api.on(/^\/api\/chart\/climate\/(coverage|ingestion-jobs)$/, (route) =>
    json(route, []),
  );

  api.on(/^\/api\/chart\/vra\/[^/]+\//, async (route, url) => {
    const [, , , , frameId, action, areaId] = url.pathname.split("/");
    const frame = byId.get(decodeURIComponent(frameId));
    if (!frame) return json(route, { error: "GEOGRAPHY_NOT_FOUND" }, 404);
    const inScope = scopes.some(
      (scope) => frame.path === scope || frame.path.startsWith(`${scope}/`),
    );
    if (!inScope) return json(route, { error: "GEOGRAPHY_OUT_OF_SCOPE" }, 403);
    const method = route.request().method();
    const adminOnly = ["coverage", "template.csv", "values", "runs"].includes(action);
    if (adminOnly && !isAdmin) return json(route, { error: "FORBIDDEN" }, 403);

    const result = results.get(frame.id);
    const assessment = () => ({
      geography_id: frame.id,
      name: frame.name,
      area_level_label: frame.areaLevel,
      run: result?.run ?? null,
      areas: result
        ? result.areas.map((area) => area.summary)
        : frame.areas.map((area) => ({
            geography_id: area.geography_id,
            admin_unit_id: area.admin_unit_id,
            code: area.code,
            name: area.name,
            risk: null,
            risk_class: null,
            rank: null,
            components: {
              hazard: null,
              exposure: null,
              sensitivity: null,
              adaptive_capacity: null,
              vulnerability: null,
            },
            coverage: {
              hazard: null,
              exposure: null,
              sensitivity: null,
              adaptive_capacity: null,
            },
            drivers: [],
            missing_reason: "not_assessed",
          })),
    });

    if (action === "assessment" && method === "GET") return json(route, assessment());
    if (action === "map" && method === "GET") {
      const summaries = new Map(
        result?.areas.map((area) => [area.summary.geography_id, area.summary]),
      );
      return json(route, {
        geography_id: frame.id,
        outcome: "vra",
        month: null,
        metric: "vra_risk",
        unit: "score",
        bounds: frame.bounds,
        simplify_tolerance_degrees: 0.01,
        areas: frame.areas.map((area) => {
          const summary = summaries.get(area.geography_id);
          return {
            ...area,
            value_percent: summary?.risk == null ? null : summary.risk * 100,
            missing_reason: !summary
              ? "not_assessed"
              : summary.risk === null
                ? "insufficient_data"
                : null,
            odds_ratio: null,
            on_training_support: null,
          };
        }),
      });
    }
    if (action === "areas" && method === "GET") {
      const area = result?.areas.find(
        (item) => item.summary.geography_id === decodeURIComponent(areaId ?? ""),
      );
      if (!area) return json(route, { error: "VRA_AREA_NOT_FOUND" }, 404);
      return json(route, { area: area.summary, indicators: area.indicators });
    }
    if (action === "coverage" && method === "GET") {
      const held = values.get(frame.id) ?? [];
      return json(route, {
        area_count: frame.areas.length,
        indicators: catalogue.map((item) => {
          const rows = held.filter((value) => value.indicator === item.code);
          return {
            code: item.code,
            name: item.name,
            component: item.component,
            route: item.route,
            status: item.status,
            present: new Set(rows.map((row) => row.area)).size,
            vintages: [...new Set(rows.map((row) => row.vintage))].sort(),
            updated_at: rows.length
              ? rows
                  .map((row) => row.updated_at)
                  .sort()
                  .at(-1)
              : null,
          };
        }),
        ingestions: [...(ingestions.get(frame.id) ?? [])].reverse(),
      });
    }
    if (action === "template.csv" && method === "GET") {
      const lines = [
        "area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes",
      ];
      for (const area of frame.areas)
        for (const item of catalogue)
          if (
            (item.route === "upload" || item.route === "manual") &&
            item.status !== "dropped"
          )
            lines.push(`${area.code},${area.name},${item.code},,,,,`);
      return route.fulfill({
        status: 200,
        contentType: "text/csv",
        body: `${lines.join("\n")}\n`,
      });
    }
    if (action === "values" && method === "POST") {
      const body = route.request().postData() ?? "";
      api.uploads.push({
        frame: frame.id,
        fileName: url.searchParams.get("file_name"),
        body,
        contentType: route.request().headers()["content-type"] ?? "",
      });
      return json(route, ingest(frame, body, url.searchParams.get("file_name")));
    }
    if (action === "runs" && method === "POST") {
      api.runs.push(frame.id);
      const held = (values.get(frame.id) ?? []).filter(
        (value) => value.method !== "computed",
      );
      held.push(...computedValues(frame));
      values.set(frame.id, held);
      results.set(frame.id, score(frame, held, ++runIds));
      const assessed = results.get(frame.id);
      return json(route, {
        geography_id: frame.id,
        name: frame.name,
        area_level_label: frame.areaLevel,
        run: assessed?.run ?? null,
        areas: assessed?.areas.map((area) => area.summary) ?? [],
      });
    }
    return json(route, { error: "E2E_UNHANDLED" }, 404);
  });

  /** Validate a filled template the way the contract says the API does. */
  function ingest(frame: Frame, csv: string, fileName: string | null) {
    const [header, ...lines] = csv.trim().split(/\r?\n/);
    const columns = header.split(",");
    const codes = new Set(frame.areas.map((area) => area.code));
    const accepted: Value[] = [];
    const rejections: { row: number; reason: string }[] = [];
    lines.forEach((line, index) => {
      const row = index + 2;
      const cells = Object.fromEntries(
        line.split(",").map((cell, column) => [columns[column], cell.trim()]),
      );
      const item = catalogue.find((entry) => entry.code === cells.indicator_code);
      if (!codes.has(cells.area_code))
        return rejections.push({
          row,
          reason: `area_code "${cells.area_code}" is not a ${frame.areaLevel.toLowerCase()} of ${frame.name}`,
        });
      if (!item)
        return rejections.push({
          row,
          reason: `indicator_code "${cells.indicator_code}" is not in the catalogue`,
        });
      if (item.status === "dropped" || item.route === "computed")
        return rejections.push({
          row,
          reason: `indicator_code "${item.code}" cannot be uploaded (${item.status === "dropped" ? "dropped" : "computed by CHART"})`,
        });
      if (cells.value === "" || cells.value === undefined) return;
      if (!Number.isFinite(Number(cells.value)))
        return rejections.push({
          row,
          reason: `value "${cells.value}" is not a number`,
        });
      if (!cells.vintage)
        return rejections.push({ row, reason: "vintage is required" });
      accepted.push({
        indicator: item.code,
        area: cells.area_code,
        value: Number(cells.value),
        vintage: cells.vintage,
        source_name: cells.source_name || "Uploaded file",
        source_url: cells.source_url || null,
        method: item.route === "manual" ? "manual" : "upload",
        updated_at: "2026-10-22T10:00:00Z",
      });
    });
    const failed = accepted.length === 0;
    if (!failed) {
      const held = (values.get(frame.id) ?? []).filter(
        (value) =>
          !accepted.some(
            (next) =>
              next.indicator === value.indicator &&
              next.area === value.area &&
              next.vintage === value.vintage,
          ),
      );
      values.set(frame.id, [...held, ...accepted]);
    }
    const list = ingestions.get(frame.id) ?? [];
    const ingestion: Ingestion = {
      id: list.length + 1,
      status: failed ? "failed" : "completed",
      file_name: fileName,
      rows_accepted: failed ? 0 : accepted.length,
      rows_rejected: rejections.length,
      rejections,
      created_at: "2026-10-22T10:00:00Z",
      requested_by: "admin",
    };
    list.push(ingestion);
    return {
      ingestion_id: ingestion.id,
      status: ingestion.status,
      rows_accepted: ingestion.rows_accepted,
      rows_rejected: ingestion.rows_rejected,
      rejections,
    };
  }

  return api;
}

/** A filled template for MP: every uploadable indicator for every division. */
export function filledTemplate(extraRows: string[] = []): string {
  const rows = seedValues(madhyaPradesh, { skip: ["shahdol"] }).map((value) => {
    const area = madhyaPradesh.areas.find((item) => item.code === value.area);
    return [
      value.area,
      area?.name ?? "",
      value.indicator,
      String(value.value),
      value.vintage,
      value.source_name,
      value.source_url ?? "",
      "",
    ].join(",");
  });
  return [
    "area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes",
    ...rows,
    ...extraRows,
  ].join("\n");
}
