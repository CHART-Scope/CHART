# Add a geography and model

Use one release file to connect a CHART place, its climate area, and its model.

## Files supplied by the data and model teams

1. A versioned boundary source and licence.
2. A stable CHART place code for every model area.
3. The model file or files.
4. A `model-release.json` based on
   `pipelines/models/lbw/model-release.example.json`.

Here, a boundary simply means the saved map shape for the area. Climate data
uses that shape to include the right grid cells and exclude neighbouring areas.

Each area entry must contain:

- `place_code`: the code stored on `admin_unit`;
- `model_area_name`: the exact area name expected by the scorer;
- `model_file`: the exact versioned model filename.

The release also records file hashes, model version, source Git reference, the
required temperature variable, and the required three-month order.

## Load it

For the current MP release:

```bash
chart-bootstrap-mp \
  --source-manifest pipelines/boundaries/manifests/mp_model_areas_v1.json \
  --crosswalk pipelines/boundaries/data/mp_district_division_crosswalk.csv \
  --model-release pipelines/models/lbw/model-release.example.json \
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

## Checks before activation

- every boundary has a source, version, licence, and file hash;
- every release place maps to exactly one analytical area;
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
