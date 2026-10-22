# Madhya Pradesh division indicators (VRA demo data, v1)

Real, sourced values for the vulnerability and resilience assessment (VRA),
aggregated from districts to MP's 10 divisions. Upload `mp_divisions_vra.csv`
in Settings → Data → Vulnerability indicators, then run the assessment.

- 27 indicators × 10 divisions (270 rows): NFHS-5 2019-21 district fact
  sheets, Census of India 2011, NITI Aayog MPI 2023.
- NFHS rates are Census 2011 population-weighted means of districts; Census
  shares are sums of numerators over sums of denominators.
- `SOURCES.md` lists every source (URL, SHA-256, terms), the district-name
  mapping, the spot checks and the caveats. Raw downloads (~74 MB) are not
  committed; `raw_manifest.csv` records their hashes so `build.py` can be
  re-run against the same bytes.
