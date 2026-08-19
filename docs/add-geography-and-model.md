# Add a geography and model

Use one release file to connect a CHART place, its climate area, and its model.

## Files supplied by the data and model teams

1. A versioned boundary source and licence.
2. A stable CHART place code for every model area.
3. The model file or files.
4. A `model-release.json` with the installation geography structure shown in
   `pipelines/models/lbw/model-release.kenya.review.json`.

Here, a boundary simply means the saved map shape for the area. Climate data
uses that shape to include the right grid cells and exclude neighbouring areas.

Each `geography.places` entry contains the user-facing administrative identity:

- `place_code`, `display_name`, `geography_id`, `app_level`, and `level_label`;
- `parent_place_code`, or null for the first administrative level;
- `path` and `sort_order` for navigation and dropdowns;
- `boundary_key`, matching `admin_unit_code` in the boundary GeoJSON.

The label in `geography.levels` is canonical. Every place's `app_level` must
reference that level key and its `level_label` must match exactly. This is how
the same generic `geo_level_1` becomes `State` for India and `County` for Kenya
without country-specific browser code.

Each supported `areas` entry contains the reusable inference mapping:

- `place_code`: the code stored on `admin_unit`;
- `country_code`: ISO 3166-1 alpha-2 (e.g. `IN`, `KE`) so onboarding can filter
  areas by installation country;
- `level`: geography level (`country`, `state`, `province`, `division`,
  `district`, `county`, `sub-county`, or `sub-district`);
- `model_area_name`: the exact area name expected by the scorer;
- `model_file`: a filename that also appears in the top-level `model_files`
  list.

The manifest also declares, at the top level:

- `module`: the analytical module (e.g. `prediction`);
- `outcome`: the health outcome this release predicts (e.g. `lbw`);
- `climate_hazard`: the climate driver the model is trained on
  (e.g. `extreme_heat`) — surfaced to operators during onboarding;
- `base_uri`: an `s3://<bucket>/<outcome>/<version>` prefix that owns every
  file in `model_files`;
- `runtime.adapter`: the backend adapter that prepares the artifact;
- `input_contract`: model-specific variables, units, dimensions, and ordering;
- `presentation.model_scope_label`: the human-readable fitted scope shown with
  onboarding and model results, such as `climate-zone model` or `division model`;
- `presentation.visualization`: the registered dashboard renderer and its
  model-appropriate `figure` and `context_figure` pictograms;
- `presentation.risk_description`: reviewed explanatory copy for the model's
  risk/protection panel;
- `geography`: country identity, analytical geography slug, optional boundary
  artifact, and ordered administrative level labels;
- file hashes, model version, and source Git reference.

Neither onboarding nor model discovery assumes a particular hazard, health
outcome, input variable, model file type, country, or administrative level.
Dashboard rendering also does not infer a view from the outcome code: it reads
the visualization contract from the active release manifest.
The current releases use the `compact_r_registry` adapter; a different model
family must supply and test its own adapter rather than adding outcome-specific
branches to setup.

The current temperature-health releases use Distributed Lag Non-linear Models
(DLNMs). MP and Kenya LBW accept three monthly temperature means in a binomial
logistic DLNM. MP under-five mortality accepts four daily lag values in a
conditional-logistic case-crossover DLNM. A new release must declare its own
input dimensions and order; the shared runtime does not make those contracts
interchangeable.

## S3 layout

Model files live under `base_uri` in the shape

```
s3://<bucket>/<outcome>/<version>/<filename>.rds
```

Each `<filename>` matches an entry in `model_files[].filename`, and its SHA-256
matches `model_files[].sha256`. The bootstrap process downloads only the files
referenced by the manifest, then verifies their hashes before activation.

## Adding a new country or model

1. Upload the trained model file(s) under a fresh
   `s3://<bucket>/<outcome>/<version>/` prefix and record each SHA-256.
2. Copy a manifest with an installation geography section, such as
   `model-release.kenya.review.json`, into the appropriate
   `pipelines/models/<family>/` directory. Update its identity, runtime,
   input contract, artifact records, and scientific taxonomy.
3. List each model-supported geography under `areas[]` with the fields above. Reuse
   `place_code`s already present on `admin_unit` where possible; new codes
   need matching boundaries loaded via
   `pipelines/boundaries/manifests/*.json`. A place declared only under
   `geography.places` is known for navigation or hierarchy but is not selectable
   during installation until at least one installed release maps it in `areas`.
4. Validate the manifest and cached artifacts by running the backend test
   subset that covers registration and warming (`pytest
   backend/tests/test_model_runtime.py backend/tests/test_place_sets.py`).
5. Restart the backend. It discovers `model-release*.json` recursively below
   `pipelines/models/`; onboarding is populated from its `geography` and
   `areas` records. Review releases appear only when the generic review-model
   gate is enabled.

## Load it

For the current MP release:

```bash
chart-bootstrap-mp \
  --source-manifest pipelines/boundaries/manifests/mp_model_areas_v1.json \
  --crosswalk pipelines/boundaries/data/mp_district_division_crosswalk.csv \
  --model-release pipelines/models/lbw/model-release.mp.compact.review.json \
  --activate-model
```

To register a later release after its places exist:

```bash
chart-register-model-release path/to/model-release.json \
  --model-dir path/to/versioned/model/files \
  --activate
```

Activation replaces the previous active release for the same outcome. Old
results keep their original release ID and climate-input hash.

## How each place picks its model block

Once activated, the runtime resolves every prediction request from one
`geography_id` through `admin_unit` → `model_area_mapping` → the RDS block
matching `model_area_key`. Two callers sending different `geography_id`s hit
different blocks with different training-support ranges and `n_training`.
Ensure that `admin_unit.code` (from `place_code`) and `model_area_key` (from
`model_area_name`) match the block names inside the artifact — the R scorer
routes on the area name, not on the file. The routing rule is documented in
[Modeling → How a place picks a model block](
modeling.md#how-a-place-picks-a-model-block).

Administrative and model geography do not have to be the same grain. Kenya is
the concrete example: Kajiado County has its own climate-extraction polygon but
explicitly maps to the `South-eastern` climate-zone model block. Put navigation
and onboarding places in `geography.places`; put only genuine model mappings in
`areas`. Disclose inherited model scope in the product and never imply it is a
separately fitted local model.

## Checks before activation

- every boundary has a source, version, licence, and file hash;
- every setup-selectable place maps to an analytical area in at least one
  installed release; navigation-only parents may remain unmapped;
- every model file exists and matches its SHA-256 hash;
- the scorer returns the same area and model filename that CHART selected;
- three consecutive monthly values are available for the same place and area
  calculation method;
- an out-of-scope user cannot submit or read the result.

Once the place has a saved boundary and active model mapping, the ISIMIP3b
adapter can use the same area without geography-specific code. Before enabling
it, run one live cut-out, confirm the map shape contains grid cells, and record
the scenario, period, five model files, source versions, checksums, and result
manifest hash.

The optional Expert Analytics downscaling step belongs in the climate adapter
before the monthly area value is saved. Keep the original source file and do
not enable downscaling until the method is approved.
