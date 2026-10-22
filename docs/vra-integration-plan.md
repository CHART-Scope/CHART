# Vulnerability and resilience assessment (VRA): data and integration plan

Status: proposal for review (21 Oct 2026). A first slice is built (22 Oct
2026); section 10 lists what exists and how it differs from this plan. Source: CEEW's draft
indicator list (`CEEW - Draft Indiactor list_VRA.xlsx`, all eight sheets,
including the hidden Sheet6, Sheet11, "Additional indicators" and "Trimmed
indicators").

The goal: for every district in a planning area, show how vulnerable it is to
climate-health risk, why (which indicators drive it), and how fresh the
evidence is. Later layers (population by gender and age, infrastructure)
reuse the same indicator store.

## 1. Decisions in brief

1. **One indicator store, three ways in.** Every indicator value is a row per
   district, indicator and vintage, with provenance. Values arrive by a
   scheduled pipeline pull, a checked CSV upload, or manual entry by an admin
   (for data only officials hold).
2. **Compute hazard ourselves where CHART already has the climate data.** Heat
   indicators come from the ERA5 pull CHART already runs (adding minimum
   temperature and dewpoint); projections from the ISIMIP pull (adding
   SSP2-4.5). This replaces CEEW's IMDAA and CORDEX processing and keeps the
   hazard side refreshable.
3. **Transparent, reproducible scoring.** Winsorised min-max normalisation
   within the state, equal weights by default (CEEW's AHP weights as a named
   alternative), Vulnerability = mean(Sensitivity, 1 − Adaptive capacity),
   Risk = geometric mean of Hazard, Exposure and Vulnerability. Every run
   stores its bounds, weights and inputs so a result can be reproduced.
4. **Districts first.** CHART holds Madhya Pradesh as a state and 10
   divisions, not 55 districts. Loading the districts with official LGD codes
   is the first piece of work, and everything else depends on it.
5. **Fix the sheet before computing.** Some directions and one definition in
   the draft are wrong (section 4); they would invert parts of the index.

## 2. How the assessment is computed

Framework: IPCC risk = hazard × exposure × vulnerability, with vulnerability
= sensitivity and lack of adaptive capacity (AR6). CEEW's 2021 and 2025
assessments use the same components; CEEW's V = E × S / AC form is avoided
because min-max scaling makes the best district's AC zero.

| Step | Default | Stored per run |
| --- | --- | --- |
| Comparison set | The districts of one state (or one country's counties). Scores only compare within it. | universe |
| Transform | Counts become shares or rates (section 3, "Transform") | transform, denominator |
| Orient | Every indicator scored so that higher = worse (`direction_to_risk` +1 / −1) | direction |
| Normalise | Clip to the 5th–95th percentile of the set, then (x − lo)/(hi − lo); flip if −1. An indicator with no spread (hi = lo, e.g. a state-level constant) is excluded and flagged. | lo, hi, n |
| Sub-index | Weighted mean per component, equal weights. Needs ≥ 2/3 of the component's weight present; weights re-normalise over what is present, otherwise the component is "insufficient data". | weight set, coverage |
| Combine | LAC = 1 − AC; V = (S + LAC)/2; Risk = (max(H,0.01)·max(E,0.01)·max(V,0.01))^(1/3) | method version |
| Classify | Very high / High / Moderate / Low by quartile within the set (Jenks as an option to match CEEW) | class breaks |
| Drivers | Indicators with normalised score ≥ 0.8 and the largest weighted contribution | per district |

Missing data: no statistical imputation by default. The latest vintage is
used and its age shown; a missing value is never zero. State-mean fill is an
explicit, flagged option only.

Mixed scales: gridded and raster inputs are reduced to districts before they
enter the store. Climate indices are computed per grid cell and then
area-weighted (fractional overlap), not averaged first; 30 m susceptibility
rasters become "% of district (or population) in high/very high class";
Ookla tiles are population-weighted.

## 3. Indicator catalogue and data availability

Route: **Pull** = scheduled pipeline (Dagster). **Upload** = admin uploads a
CSV prepared from a release (PDF/Excel) through Settings; re-run when a new
round appears. **Manual** = admin enters values held by officials. **Context**
= shown, not scored (no variation within a state). **Drop** = proposed for
removal.

Cadence: Continuous (can refresh on a schedule), Periodic (new round every
1–5 years), Static (one-off), Officials (request only).

### Hazard

| Code | Indicator | Recommended source | Vintage, level | Cadence | Route | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | Flood events (count) | Derived counts from EM-DAT + state disaster plans, prepared offline | 1970–2024, district | Periodic | Upload | EM-DAT terms forbid redistributing its records; store only derived counts and confirm with CRED. Sparse for small events. |
| H02 | % flood inundated area | — | — | — | Drop | CEEW itself suggests skipping (district too coarse). Revisit with Sentinel-1 flood maps by block. |
| H03 | Meteorological drought events | SPI-3 ≤ −1.5 months from IMD gridded rainfall (`imdlib`) | 1970–present, 0.25° | Continuous | Pull | Replaces EM-DAT counts; reproducible. |
| — | Cyclone events | — | — | — | Drop (MP) | Not applicable to MP. |
| H04 | Change in extreme hot days, 2015–24 vs 1982–2011 | ERA5 Tmax, calendar-day P98 | 1982–present, 0.25° | Continuous | Pull | Percentile tiers: hot P90, very hot P95, extreme P98 (IMD alert tiers). |
| H05 | Change in very hot days | ERA5 Tmax P95 | as H04 | Continuous | Pull | |
| H06 | Warm nights vs baseline | ERA5 **Tmin** P90 | as H04 | Continuous | Pull | Sheet defines this on maximum temperature; must be minimum (section 4). Tmin comes from the hourly temperature CHART already downloads. |
| H07 | Extreme warm nights | ERA5 Tmin P95 | as H04 | Continuous | Pull | as H06 |
| H08 | Heat index, 2015–24 | ERA5 T + dewpoint → NOAA Rothfusz, days with daily max HI ≥ 39.4 °C | as H04 | Continuous | Pull | Needs `2m_dewpoint_temperature` added to the ERA5 request. |
| H09 | Change in heat index vs baseline | as H08, seasonal mean of daily max HI | as H04 | Continuous | Pull | Near-duplicate of H08; keep one or the other. |
| H10 | Projected extreme hot days 2026–45 | ISIMIP3b SSP2-4.5 tasmax, 5 GCMs, median + range | 0.5° | Periodic | Pull | Adapter currently allows only SSP1-2.6/3-7.0/5-8.5 and 2031–40. SSP2-4.5 is the CMIP6 analogue of RCP4.5; label it. |
| H11 | Projected very warm nights 2026–45 | ISIMIP3b SSP2-4.5 tasmin | 0.5° | Periodic | Pull | |
| H12 | Extremely heavy rain days (≥ 204.5 mm) | IMD gridded rainfall | 1901–present, 0.25° | Continuous | Pull | ERA5 cannot resolve these (counts near zero). Kenya: CHIRPS. Seasons configurable (MP: JJAS). |
| H13 | Very heavy rain days (≥ 115.6 mm) | IMD gridded rainfall | as H12 | Continuous | Pull | Sheet says ≥ 115; IMD threshold is 115.6 mm. |
| H14 | Max 24-h rainfall, 2020–24 | IMD gridded rainfall (Rx1day) | as H12 | Continuous | Pull | Area-weighted district mean, not the wettest cell. |
| H15 | Projected heavy-rain days | ISIMIP3b SSP2-4.5 pr | 0.5° | Periodic | Pull | Sheet mixes "2050" and 2026–45; use 2026–45. Extremes damped at 0.5°. |
| H16 | (suggested) Heat-stress days, UTCI > 32 / 38 °C | Copernicus "Thermal comfort indices derived from ERA5" | 1940–present, 0.25° | Continuous | Pull | The sheet's WBGT/UTCI note. WBGT needs radiation and wind; UTCI is ready-made. |

### Exposure

| Code | Indicator | Recommended source | Vintage, level | Cadence | Route | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | Population density | WorldPop Global2 R2025A (or GHSL), zonal sum / area | 2015–2030, 100 m | Static per release | Pull (per release) | Covers the five post-2011 districts. Census 2011 as cross-check. |
| E02 | Total labour population | Census 2011 B-series → % of population | 2011, district | Static | Upload | Raw count would just measure district size. |
| E03 | Agricultural and allied workers | Census 2011 B-04/B-06 → % of workers | 2011, district | Static | Upload | |
| E04 | Construction workers | Census 2011 B-series, NIC section F → % of workers | 2011, district | Static | Upload | |
| E05 | Primary health facilities (PHC, SC) | Health Dynamics of India **2022-23** → per 100k population | 2023, district | Periodic | Upload | Sheet says 2023-24; latest published is 2022-23. **Move to Adaptive capacity, inverse** (more facilities = more capacity, as its own rationale says). |
| E06 | Secondary facilities (CHC, SDH, DH) | as E05 | 2023, district | Periodic | Upload | as E05 |
| E07 | Tertiary: medical colleges | HDOI 2022-23 | 2023, district | Periodic | Upload | Specialised centres have no source; keep medical colleges only, or drop. |
| E08 | Veterinary facilities | — | — | — | Drop | Sheet: "need not consider". |

### Sensitivity

| Code | Indicator | Recommended source | Vintage, level | Cadence | Route | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | Flood susceptibility | CEEW 30 m analysis → % of district area/population in high class | 2024, 30 m | Static | Upload | CEEW-produced raster; we store the district reduction and its method. |
| S02 | Heat susceptibility | CEEW 30 m analysis | 2024, 30 m | Static | Upload | Later computable from GHSL built-up + Landsat LST. |
| S03 | Cyclone susceptibility | — | — | — | Drop (MP) | |
| S04 | Drought susceptibility | CEEW 30 m analysis | 2024, 30 m | Static | Upload | |
| S05 | % population aged ≤ 5 or ≥ 65 | WorldPop age/sex, zonal | 2025, 100 m | Static per release | Pull | Census 2011 C-13 as cross-check; NFHS-6 has no age structure. |
| S06 | % slum population of urban | Census 2011 slum PCA | 2011, town → district | Static | Upload | Town-level, so re-adds exactly for new districts. |
| S07 | Women aged 20–49 | WorldPop age/sex → % of population | 2025, 100 m | Static per release | Pull | Sheet gives a count; convert to share. |
| S08 | Adolescent girls (15–19) | WorldPop age/sex → % of population | 2025, 100 m | Static per release | Pull | |
| S10 | % population with disability | Census 2011 C-20 | 2011, district | Static | Upload | |
| S11 | High blood sugar, raised blood pressure (women, men) | NFHS-6 district fact sheets | 2023-24, district | Periodic | Upload | PDFs only (guest login); extract once, check by hand. Men's values often suppressed (small samples). |
| S12 | HIV prevalence | — | — | — | Drop | CEEW's own comment; 2019 district data is in bands, low relevance to heat. |
| S13 | Child stunting, wasting, underweight, overweight | NFHS-6 | 2023-24, district | Periodic | Upload | NFHS-5 kept for trend. |
| S14 | Infant mortality | Census 2011 estimates | 2011, district | Static | Upload (low weight) | Old; NFHS-6 does not publish district IMR. Decide whether to keep. |
| S15 | Stage of groundwater extraction | CGWB Dynamic Ground Water Resources **2025** via IN-GRES | 2025, block → district | Periodic (annual) | Upload | Block names need a match table; aggregate by recharge-weighted mean. |
| S16 | Flood susceptibility of roads | CEEW analysis (OSM + flood susceptibility) | 2025, 30 m | Static | Upload | |
| S17 | Change in forest cover | Hansen Global Forest Change (or FSI) | annual, 30 m | Continuous (annual) | Pull | Replaces WRIS, which is view-only. |
| S18 | Green space per person | ESA WorldCover / Dynamic World + WorldPop → m² per person | annual, 10 m | Continuous (annual) | Pull | Inverse. |
| S19 | Climate-sensitive disease burden (malaria API; dengue, chikungunya, JE) | NCVBDC / state programme officers | district (malaria), state (others) | Officials | Manual | Sheet files it under Adaptive capacity; it is sensitivity. State-level diseases are context only. |
| S20 | (candidate) Kutcha housing | SECC 2011 (via SHRUG) | 2011, village → district | Static | Upload | From the hidden "Additional indicators" sheet; CEEW marked TBD. |

### Adaptive capacity

Directions below are relative to risk (+1 = more of it means more risk).

| Code | Indicator | Recommended source | Vintage, level | Cadence | Route | Direction |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Out-of-pocket spend per delivery, public facility | NFHS-6 | 2023-24, district | Periodic | Upload | +1 (sheet says Inverse) |
| A02 | Women 15–49 with ≥ 10 years schooling | NFHS-6 | 2023-24, district | Periodic | Upload | −1 (sheet says Direct) |
| A03 | Men 15–49 with ≥ 10 years schooling | NFHS-6 | 2023-24, district | Periodic | Upload | −1 (sheet says Direct); often suppressed |
| A04 | Households owning a vehicle | Census 2011 HH-14 | 2011, district | Static | Upload | −1 |
| A05 | Destitute / alms households (rural) | SECC 2011 via SHRUG | 2011, village → district | Static | Upload | +1 (sheet says Inverse) |
| A06 | Access to phone / internet / TV | Ookla open data (quarterly, population-weighted) + Census 2011 HH-14 | 2019–present, ~600 m | Continuous (quarterly) | Pull | −1. Ookla is CC BY-NC-SA: attribution and non-commercial terms shown in the app. |
| A07 | Children 12–23 months fully vaccinated | NFHS-6 | 2023-24, district | Periodic | Upload | −1 (sheet says Direct) |
| A08 | Households with health insurance | NFHS-6 | 2023-24, district | Periodic | Upload | −1 |
| A09 | Health workforce gap | HDOI 2022-23 (% sanctioned posts vacant) | 2023, district/state | Periodic | Upload | +1 |
| A10 | Safe drinking water on premises | NFHS-6 (NSS 78th is not district-level) | 2023-24, district | Periodic | Upload | −1 |
| A11 | Rural household latrines | NFHS-6 improved sanitation (SBM MIS sits near 100%) | 2023-24, district | Periodic | Upload | −1 |
| A12 | Schools/anganwadis with tap water | Jal Jeevan Mission F26 | live, district | Continuous | Pull (quarterly snapshot) | −1. Form-post portal, PDF export; low spread, low weight. |
| A13 | Schools/anganwadis with running water in toilets | JJM F26 | live, district | Continuous | Pull (quarterly snapshot) | −1 |
| A14 | Zoonotic outbreaks reported | IDSP / IHIP via officials | district | Officials | Manual | candidate |
| A15 | Sentinel surveillance hospitals (dengue) | — | — | — | Drop | ~4–6 in MP, no spread. |
| A16 | Heat-illness surveillance in place | IHIP via NCDC / state officials | district | Officials | Manual | −1 (sheet says Direct) |
| A17 | One Health / zoonotic units | — | — | — | Drop | Sheet: "can remove". |
| A18 | Heat action plan exists | Manual register (no national repository) | district | Officials | Manual | −1 |
| A19 | District Mental Health Programme coverage | NMHS / DMHP | state | Periodic | Context | No spread within MP. |
| A20 | Road network density | OpenStreetMap (Geofabrik MP extract) → km per km² | monthly, district | Continuous | Pull | −1 (sheet says Direct). ODbL attribution. |
| A21 | State health adaptation plans (SAPCCHH) | NCDC | state | Static | Context | Constant within MP. |
| A22 | Health facilities per 100k (moved from E05–E06) | HDOI 2022-23 | district | Periodic | Upload | −1 |
| A23 | (candidate) Multidimensional poverty | NITI Aayog district MPI (NFHS-5 based) | 2019-21, district | Periodic | Upload | +1. From Sheet6; rebuild when an NFHS-6 edition appears. |
| — | Air pollution (sheet question) | Satellite PM2.5 (e.g. ACAG) or CPCB | annual | Periodic | Later | Not in scope yet. |

Tally of the 68 rows: 24 can be pulled on a schedule (14 of them hazard), 30
are uploads from periodic or one-off releases, 4 need officials, 2 are
context only, 7 are proposed drops and 1 is deferred. Most social indicators
are periodic uploads tied to NFHS, Census and HDOI rounds.

Sources that change the sheet's assumptions:

- **NFHS-6** district fact sheets were published in August 2026 as PDFs only.
  Districts follow survey-time boundaries, so Maihar, Mauganj and Pandhurna
  are likely absent.
- **Census 2027** enumeration is in February 2027; district tables are
  expected around 2029–30. Census 2011 stays the baseline; loaders take the
  vintage as data so 2027 drops in later.
- **MoHA population projections** are state-level only; district density
  comes from WorldPop/GHSL.
- **IMDAA** after 2020 switches to an operational model, so 2015–2024 mixes
  two systems; ERA5 and IMD gridded data are consistent and refreshable.

## 4. Issues to raise with CEEW

1. **Warm nights (H06, H07)** are defined with maximum temperature > 90th/95th
   percentile. Warm nights are minimum-temperature indices (ETCCDI TN90p), as
   CEEW's own 2025 heat study used.
2. **Directions mix "relative to capacity" and "relative to risk".** Schooling,
   vaccination, road density and surveillance are marked Direct but lower
   risk; out-of-pocket spend and destitute households are marked Inverse but
   raise it. CHART stores one direction, always relative to risk.
3. **Health facilities sit under Exposure as Direct**, while the rationale
   says more facilities = more preparedness. Proposed: Adaptive capacity,
   per 100k population, inverse.
4. **Counts need denominators** (women 20–49, adolescent girls, labour,
   construction workers, facilities), otherwise they measure district size.
5. **Very heavy rainfall threshold** is 115.6 mm (IMD), not 115 mm.
6. **Projection windows** mix "2050" and 2026–2045; scenario RCP4.5 (CMIP5)
   becomes SSP2-4.5 (CMIP6) in CHART.
7. **HDOI 2023-24** does not appear to be published; the latest is 2022-23.
8. **Life expectancy** is not in NFHS (Sheet6 says NFHS-5); it needs SRS
   (state-level) or should be dropped.
9. **Disease burden** is filed under Adaptive capacity; it is sensitivity.
10. Duplicates to choose between: H08/H09 (heat index), H06/H07 (warm nights),
    H04/H05 (hot days), as the sheet's own comments ask.

## 5. Architecture

```
Sources ─► Pull (Dagster op)  ─┐
         ► Upload (CSV, admin) ─┼─► vra_indicator_value ─► vra_run ─► vra_result ─► map + drill-down
         ► Manual (admin form) ─┘        (+ provenance)    (bounds,     (H/E/S/AC,
                                                            weights)     class, drivers)
ERA5 / IMD / ISIMIP ─► climate pipeline ─► hazard indices (H03–H16) ─┘
```

- **Analytics stay independent of FastAPI and Dagster** (`core/chart/vra/`:
  catalogue, normalise, aggregate, classify as plain functions over rows).
  Routes and Dagster ops are thin wrappers, as for climate today.
- **Pulls reuse the climate ingestion pattern**: a job row in Postgres, a
  Dagster sensor that claims it, progress and failure reasons written back,
  shown in Settings → Jobs. Retries are safe because writes are upserts on
  (indicator, district, vintage).
- **Hazard engine** (`pipelines/vra_hazard/`): extends the ERA5 request with
  dewpoint and total precipitation (Tmin is derived from the hourly
  temperature already fetched), adds IMD gridded rainfall via `imdlib`, adds
  SSP2-4.5 and 2026–2045 to the ISIMIP adapter, computes per-cell indices and
  area-weights them to districts. The current cell-centre mask must become
  fractional-overlap weighting: at 0.5° an MP district covers about two
  cells.
- **Uploads**: an admin downloads a template CSV for a source (columns:
  `lgd_code`, `district_name`, indicator codes, `vintage`), fills it from the
  release, uploads it. The service validates codes, units and ranges, rejects
  unknown districts with row-level reasons, and stores the file hash. Raw
  survey files never go into Git (`docs/health-input-contract.md`).
- **Boundaries and old districts**: Census-era and NFHS-era values are mapped
  to current districts through a crosswalk. Village/town-level tables re-add
  exactly; district-only tables are split by population share, and the value
  is flagged "apportioned".
- **Permissions**: reading results follows the existing geography scopes and
  reader roles; uploads, manual entry, pulls and runs are `chart_admin` only.

## 6. Database changes

Two migrations after `027_model_display_settings`. Naming follows
`core/alembic/versions/NNN_snake_name.py`.

### 028_district_codes

| Table | Columns | Purpose |
| --- | --- | --- |
| `admin_unit_code` | `admin_unit_id` FK, `scheme` (`lgd`, `census2011`, `iso3166_2`, `knbs`), `code`, `valid_from`, `valid_to`; unique (`scheme`, `code`) | Official codes for joins to every source. `geographies.external_code` is unused today. |
| `admin_unit_crosswalk` | `target_admin_unit_id` FK, `source_scheme`, `source_code`, `weight` (0–1), `method` (`exact`, `population_share`, `area_share`), `provenance_id` FK | Maps 2011-era districts (50 in MP) onto current ones (55). |

Plus a new place set `in-mp-districts-v1` (55 districts, LGD codes,
boundaries). geoBoundaries 2021 covers 52; Maihar, Mauganj and Pandhurna need
boundaries from the state or Survey of India (open question).

### 029_vra

| Table | Key columns | Notes |
| --- | --- | --- |
| `vra_indicator` | `code` unique, `component` (hazard / exposure / sensitivity / adaptive_capacity), `category`, `name`, `unit`, `direction_to_risk` (+1/−1), `transform` (none / share / per_100k / per_km2 / log), `denominator_code`, `route` (pull / upload / manual / context), `status` (active / candidate / dropped), `rationale`, `catalogue_version` | The catalogue in section 3, seeded from a bundled JSON like recommended actions. |
| `vra_indicator_value` | `indicator_id`, `admin_unit_id`, `vintage` (e.g. `2011`, `2023-24`), `reference_year`, `value` (double), `method` (observed / computed / apportioned / aggregated / state_constant), `quality_flags` jsonb (suppressed, small sample), `provenance_id` FK, `ingestion_id` FK; unique (`indicator_id`, `admin_unit_id`, `vintage`) | One fact per row; upserts make pulls and re-uploads safe. |
| `vra_ingestion` | `data_source_id` FK, `route`, `status` (queued / running / completed / failed), `file_sha256`, `rows_accepted`, `rows_rejected`, `rejections` jsonb, `requested_by`, timestamps, `error_code` | Feeds Settings → Jobs alongside climate pulls. |
| `vra_weight_set` | `code` unique, `name`, `method` (equal / ahp / custom), `weights` jsonb {indicator code: weight}, `created_by` | Equal by default; CEEW AHP as a second set. |
| `vra_run` | `chart_geography_id` (comparison set), `method_version`, `catalogue_version`, `weight_set_id`, `params` jsonb (winsor percentiles, coverage threshold, classing), `input_hash`, `output_hash`, `git_sha`, `status`, `created_by`, timestamps | Identical inputs give identical outputs. |
| `vra_run_bound` | `run_id`, `indicator_id`, `lo`, `hi`, `n`, `excluded_reason` | Normalisation bounds per indicator per run. |
| `vra_result` | `run_id`, `admin_unit_id`, `hazard`, `exposure`, `sensitivity`, `adaptive_capacity`, `vulnerability`, `risk`, `risk_class`, `rank`, `coverage` jsonb, `drivers` jsonb; unique (`run_id`, `admin_unit_id`) | Map values. |
| `vra_result_indicator` | `run_id`, `admin_unit_id`, `indicator_id`, `value_id` FK, `raw`, `normalised`, `weight`, `contribution` | District drill-down: raw value, score, contribution. |

`data_source` and `provenance` (existing) carry source name, licence, URL,
release date and hash for each upload or pull. Climate-derived hazard values
reference their `climate_run`. The existing, unused `covariate` table is not
reused: it has no component, direction or vintage.

## 7. In the app

- **Dashboard → Vulnerability view**: district map coloured by risk class,
  with a toggle for each component (hazard, exposure, sensitivity, adaptive
  capacity). The existing `SpatialRiskMap` already accepts another data
  source; it needs configurable bands and labels (today they are fixed
  percent bands).
- **District drill-down**: H / E / S / AC bars, then each indicator's raw
  value with unit, normalised score and contribution, badges for vintage
  ("Census 2011"), "apportioned", "state-level" and coverage, and a caption
  that classes are relative within the state.
- **Settings → Data → Indicators**: a coverage matrix (indicator × vintage,
  % of districts present), template download and upload per source, manual
  entry for officials' data, and a "Run assessment" action. Pulls and runs
  appear in Settings → Jobs.
- **Later layers**: population by gender and age, and infrastructure, are
  more indicators in the same store and map, filtered by category.

## 8. Phased plan

| Phase | Scope | Unblocks |
| --- | --- | --- |
| 0 | MP district place set (55, LGD codes), migration 028, crosswalk 2011 → current | Everything |
| 1 | Migration 029, catalogue seed, upload route + validation, Census 2011 and NFHS-6 uploads, scoring engine, results API | First vulnerability map |
| 2 | Hazard engine: ERA5 dewpoint and Tmin, IMD rainfall, area weighting, H03–H09, H12–H14 | Refreshable hazard |
| 3 | Dashboard Vulnerability view and drill-down; configurable map bands | Planner-facing release |
| 4 | Continuous pulls: WorldPop, OSM roads, Ookla, forest and green space, JJM snapshots; ISIMIP SSP2-4.5 projections | Automated refresh |
| 5 | Officials' data (manual entry), CEEW susceptibility rasters, AHP weight set; Kenya counties (KNBS 2019, KDHS 2022, KMHFL facility registry, CHIRPS) | Full indicator set, second country |

Each phase ships with E2E coverage per `AGENTS.md`: upload acceptance and
row-level rejection, denied access for non-admins, scope isolation between
states, a pull that fails and retries, a run whose stored bounds reproduce its
result, and the map and drill-down in the browser.

## 9. Open questions

1. Does CEEW accept the fixes in section 4 and the direction convention?
2. Boundaries for Maihar, Mauganj and Pandhurna: who supplies them?
3. Equal weights or CEEW's AHP weights as the default shown to planners?
4. Which indicators CEEW can share as processed data (susceptibility rasters,
   EM-DAT counts) and under what licence.
5. Officials' data (IHIP heat illness, malaria, heat action plans): is there a
   data-sharing agreement, and who enters it?
6. Keep or drop the old indicators: infant mortality (2011), SECC (2011)?
7. Is the comparison set always one state, or do national comparisons
   matter (they change normalisation and the state-level indicators)?

## 10. Implemented so far (22 Oct 2026)

A first, working slice of phases 1 and 3's backend, at the areas CHART already
holds (Madhya Pradesh's 10 divisions, Kenya's 47 counties) rather than
districts. Details: `core/chart/vra/README.md`.

- **Migration `028_vra`** (one migration; `028_district_codes` is not built):
  `vra_indicator`, `vra_indicator_value` (unique indicator, area, vintage;
  source name and URL, method, quality flags, ingestion or `climate_run`),
  `vra_ingestion` (file hash, row counts, rejections), `vra_run` (frame,
  method version, parameters with per-indicator bounds and class breaks,
  input and output hashes), `vra_result` and `vra_result_indicator`. Weight
  sets and a separate bounds table are not built: weights are equal and
  bounds live in `vra_run.params`. Sources are stored on each value rather
  than in `data_source`/`provenance`, because an upload carries a source per
  row.
- **Catalogue** `core/chart/vra/catalogue.json`: 72 indicators with the
  direction and placement fixes of section 4, synced on API start and setup.
- **Method `vra-v1`** as in section 2 (equal weights, 5th-95th percentile
  min-max, two-thirds coverage, geometric mean, quartile classes), in
  `core/chart/vra/scoring.py`. Hazard for now is two indicators computed from
  the ERA5 months CHART already stores: heatwave days and mean monthly peak
  temperature over the latest 12 complete months.
- **API**: `GET /vra/indicators`; `GET /vra/{geography_id}/assessment`,
  `/map`, `/areas/{area_geography_id}` for readers; `GET .../coverage`,
  `GET .../template.csv`, `POST .../values` (CSV) and `POST .../runs` for
  `chart_admin`. Assessments always cover the child areas of the selected
  geography, framed as on the dashboard map, with no country-specific code.
- **E2E**: `core/tests/test_vra_api.py` in `make e2e-core`.

## References

- CEEW (2021), Mapping India's Climate Vulnerability.
- CEEW (2025), How Extreme Heat is Impacting India.
- IPCC AR6 WGII glossary (risk, vulnerability).
- INFORM Risk methodology (JRC, 2017); ND-GAIN technical report (2026);
  OECD/JRC Handbook on Constructing Composite Indicators (2008).
- NFHS-6 release notes (IIPS, 2026); Census of India 2011 tables (NADA);
  CGWB Dynamic Ground Water Resources 2025; WorldPop Global2 R2025A;
  Ookla open data; Geofabrik OSM extracts; ISIMIP3b secondary input data;
  IMD gridded data via `imdlib`; NOAA heat index equation.
