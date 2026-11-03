# Madhya Pradesh district indicators (VRA, v1)

District values for the vulnerability and resilience assessment, as published,
for 51 of CHART's 52 Madhya Pradesh districts: NFHS-5 (2019-21) district fact
sheets, Census of India 2011 and the NITI Aayog MPI. They come from the same
extracted, spot-checked rows as the division file
(`../mp-divisions-v1/mp_districts_source.csv`; sources, hashes and caveats in
`../mp-divisions-v1/SOURCES.md`), without aggregating to divisions.

- `mp_districts_vra.csv`: the upload, 1,262 rows (51 districts × 25
  indicators). Built by `build.py`.
- `chart_districts.csv`: CHART's districts (the boundary release's place
  codes), which uploads must use as `area_code`.
- Renamed to CHART's names: Khandwa → East Nimar, Khargone → West Nimar,
  Narsinghpur → Narsimhapur.
- **Niwari** (formed 2018) is not in these sources and has no rows: it stays
  missing, never copied from Tikamgarh or its division.
- **Held back**: `ac.improved_water_source` and `ac.improved_sanitation`.
  NFHS reports them as % of population; the catalogue says % of households.
  Settle the definition before adding them.

Load and score every district against every other in the state:

    POST /vra/geo-in-madhya-pradesh/values?level=district   (this CSV)
    POST /vra/geo-in-madhya-pradesh/runs?level=district

A division's VRA map and Explore's vulnerability overlay then read its
districts from that state-wide run.
