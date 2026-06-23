# NFHS/DHS health input contract

Parent issue: https://github.com/CHART-Scope/CHART/issues/127

This document captures the first health-data handoff contract for CHART
modeling. It is intentionally a contract, not an ingestion implementation.
Restricted survey microdata must not be committed to the repository.

Related artifacts:

- exploration guide: `docs/health-survey-exploration-guide.md`;
- draft extraction map: `docs/health-survey-column-map.csv`.

## Sprint scope

The next MVP step is to prepare the health input side of the
climate-health modeling workflow:

- document NFHS-5 India and Kenya DHS access, rights, and storage constraints;
- confirm the first health outcome and exact source columns with MaQueens;
- draft a column map that can later drive automated extraction from large
  DHS/NFHS files;
- keep unresolved access/modeling blockers explicit.

Out of scope for this branch:

- committing raw DHS/NFHS files;
- fitting the health model;
- joining health rows to ERA5 rows;
- API/UI integration.

## Recommended issue order

1. **Access and storage constraints**: #146 is the richer version of #133.
   Use #146 as the working issue and close #133 as duplicate once #146 is
   documented.
2. **MaQueens indicator/R-code dependency**: #147 is the richer version of
   #134. Use #147 as the working issue and close #134 as duplicate once the
   column usage is confirmed or explicitly blocked.
3. **Column extraction map**: #148 is the richer version of #135. Use #148
   as the working issue and close #135 as duplicate once the draft map is
   accepted.
4. **Parent contract**: close #127 only after access constraints, selected
   indicators, and the extraction map are all documented.

## Current issue status

| Issue | Status | Notes |
| --- | --- | --- |
| #146 | Draft documented | Access links and storage rules are captured here; actual approved dataset access still needs confirmation. |
| #147 | Blocked on R workflow | Low birth weight is the working assumption; exact columns, filters, and lag windows need MaQueens' R code or column list. |
| #148 | Draft map created | See `docs/health-survey-column-map.csv`; exact fields remain marked as draft until confirmed. |
| #127 | In progress | Parent should remain open until #146, #147, and #148 are reviewed. |

## Current data-source assumptions

| Source | Intended use | Current sprint status | Access/storage note |
| --- | --- | --- | --- |
| NFHS-5 / India DHS 2019-21 | India birth outcome records and maternal covariates | Use as India source unless MaQueens confirms a different extract | Requires approved access/download. Do not commit raw files. |
| Kenya DHS 2022 | Kenya birth outcome records and maternal covariates | Use as Kenya source unless MaQueens confirms a different extract | Requires approved access/download. Do not commit raw files. |
| NFHS-6 | Future India update | Not in Sprint 4 contract until public microdata/access status is confirmed | Treat as unavailable for implementation unless access is confirmed. |
| DHS/NFHS GPS cluster files | Climate exposure join | Needed if modeling uses cluster-level climate exposure | Coordinates are privacy-displaced; document this caveat in analysis outputs. |

Useful source links:

- Kenya DHS 2022 dataset page: https://dhsprogram.com/data/dataset/Kenya_Standard-DHS_2022.cfm?flag=0
- India DHS/NFHS-5 dataset page: https://dhsprogram.com/data/dataset/India_Standard-DHS_2020.cfm?flag=0
- DHS data access portal: https://dhsprogram.com/data/

## Data handling rules

- Store restricted raw data outside Git, or under an ignored local path such as
  `data/restricted/health-surveys/`.
- Never commit raw `.DTA`, `.SAV`, `.DAT`, `.ZIP`, GPS, or respondent-level
  extracts.
- Commit only schemas, column maps, non-sensitive derived aggregate examples,
  and reproducible code.
- Keep survey access status and blockers visible in GitHub issues before
  implementation proceeds.
- Any CHART fixture should be fake/minimal or aggregated enough to avoid
  exposing respondent-level records.

## First outcome assumption

Primary working assumption: **low birth weight** is the first outcome to map
because it matches the current MaQueens modeling discussion.

Draft definition:

- outcome: `low_birth_weight`;
- source measure: measured birth weight in grams;
- threshold: `< 2500g`;
- source record family: likely DHS/NFHS birth or child record;
- climate exposure window: likely pregnancy window based on child birth date,
  with trimester logic confirmed by MaQueens' R workflow.

Candidate extension: neonatal/infant mortality. This depends on confirmation of
the exact birth/death record fields used by MaQueens and should not be treated
as implemented until the R column usage is shared.

## Draft source file families

| File family | Use | Current status |
| --- | --- | --- |
| Birth record / child record | Child birth date, birth weight, sex, survival/death fields | Required for selected outcome; exact recode file to be confirmed |
| Individual/women record | Maternal age, education, wealth, residence, survey weights/design | Required for covariates; exact joins to be confirmed |
| GPS cluster file | Cluster latitude/longitude or admin join to climate exposure | Required for cluster-level climate joins; privacy displacement caveat |
| Household/person record | Denominators or household covariates | Not first-scope unless MaQueens confirms use |

## Open questions for MaQueens, Satish, and Alessandro

1. Is the first Sprint 4 health outcome definitely low birth weight, or should
   the contract also prepare infant/neonatal mortality now?
2. Which files did the current R workflow read: BR, KR, IR, GE, or others?
3. What exact source columns are used for birth weight, birth date, death age,
   sample weights, region/admin geography, and GPS join?
4. How are invalid, missing, not-weighed, or recalled birth-weight values
   filtered?
5. Is the climate join expected at GPS cluster, admin district/county, or
   survey region level?
6. Does the model use survey weights/design variables directly, and if so
   which ones?
7. What is the expected output shape from health extraction: individual birth
   rows, monthly admin aggregates, or model-ready design matrix?

## Handoff shape target

The first implementation should produce a schema contract that can later become
a pipeline output:

```txt
country
survey_id
survey_year
record_id
cluster_id
admin1
admin2
birth_month
birth_year
birth_cmc
outcome_name
outcome_value
birth_weight_g
sample_weight
maternal_covariates...
climate_join_key
data_status
source_file_family
quality_flags
```

This is the health-data equivalent of the ERA5 handoff: stable enough for
future extraction/API/UI work, but honest about access blockers.
