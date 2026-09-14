# Shared place sets

A place set owns user-facing place names, hierarchy, shape keys, spatial
provenance, and one checksummed shape artifact. Model release schema 2 refers
to a place set and lists only its fitted coverage.

- `ke-counties-v1`: 47 Kenya counties; model releases decide which counties
  have fitted coverage and which climate-zone block each supported county uses.
- `in-mp-v1`: Madhya Pradesh plus ten divisions. The state shape is the union
  of the ten modeller-supplied division shapes.

Place-set versions are immutable. Correcting a name, hierarchy, source, or
shape requires a new directory and version. Current schema-1 releases continue
to use their embedded geography until a new model release adopts schema 2.
