# CHART model-area boundaries

This package builds the 11 Madhya Pradesh areas used by the LBW demo: the
whole state and its 10 model divisions. It does not call the health model or
fetch climate data.

## Sources and decision

- Preferred: Government of India OGD Admin Boundaries. On 2026-07-21 its
  catalog metadata was available but it exposed no downloadable resource.
- Explicit fallback: the versioned geoBoundaries India ADM2 artifact recorded
  in `manifests/mp_model_areas_v1.json`.
- District-to-division crosswalk: the current Government of Madhya Pradesh
  department directory at <https://narmada.mp.gov.in/Home/Contact>, captured in
  `data/mp_district_division_crosswalk.csv`.

The source files are kept under the repository's ignored `data/boundaries/`
directory. Only the reproducible manifest, crosswalk, builder, and tests are
committed.

## Build

```bash
chart-build-mp-boundaries \
  --adm1 data/boundaries/source/geoBoundaries-IND-ADM1_simplified.geojson \
  --adm2 data/boundaries/source/geoBoundaries-IND-ADM2.geojson \
  --crosswalk pipelines/boundaries/data/mp_district_division_crosswalk.csv \
  --source-manifest pipelines/boundaries/manifests/mp_model_areas_v1.json \
  --output data/boundaries/generated/mp-model-areas.geojson \
  --build-manifest data/boundaries/generated/mp-model-areas.build.json
```

The build refuses changed source hashes, a missing or unexpected district
geometry, an unknown model division, an ambiguous crosswalk, invalid geometry,
or a non-WGS84 source.
