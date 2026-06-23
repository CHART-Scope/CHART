# NFHS/DHS health survey exploration guide

Parent issue: https://github.com/CHART-Scope/CHART/issues/127

This guide is the first safe exploration step for the health-data side of the
CHART modeling workflow. It is designed for restricted DHS/NFHS microdata:
inspect structure and metadata, but do not commit raw records or respondent
extracts.

## Working order

1. **Confirm access and storage** (#146): record which India NFHS-5 and Kenya
   DHS files are accessible, where they are stored locally, and what cannot be
   shared.
2. **Confirm MaQueens workflow dependency** (#147): get the R code or a column
   list for the first outcome. Until then, treat the first outcome as low birth
   weight and mark exact columns as draft.
3. **Fill the column map** (#148): update
   `docs/health-survey-column-map.csv` with exact source columns, filters, and
   output shape.
4. **Close the parent** (#127): only after access/storage, selected indicators,
   and the extraction map are reviewable.

## Files to look for after approved access

| File family | Why it matters | Exploration output |
| --- | --- | --- |
| BR or KR birth/child record | Birth date, birth weight, child sex, survival/death fields | List exact columns used for outcome and timing |
| IR individual/women record | Maternal covariates and survey design fields | Confirm whether covariates are already present in BR/KR or need joins |
| GE GPS cluster file | Cluster coordinates or region metadata for climate exposure joins | Confirm join key and privacy displacement caveat |
| Recode dictionary / variable labels | Field meanings and special missing codes | Record filters for invalid or non-measured values |

## First-pass exploration checklist

- Record dataset name, country, survey years, file family, and file format.
- List available columns and labels for birth date, birth weight, survival,
  age at death, cluster, region, sample weight, PSU, strata, and GPS join.
- Count rows and missingness for candidate outcome fields.
- Identify special codes for missing, not weighed, refused, or implausible
  birth-weight values.
- Confirm whether the model needs individual birth rows or aggregated
  geography-month rows.
- Confirm climate join level: GPS cluster, admin/state/county, or survey
  region.
- Do not copy raw records into GitHub, docs, screenshots, or fixtures.

## Current assumption for exploration

Use **low birth weight** as the first health outcome unless MaQueens confirms a
different Sprint 4 target.

Expected derived field:

```txt
low_birth_weight = birth_weight_g < 2500
```

This is not enough by itself. The implementation still needs MaQueens'
confirmed filters for special/missing birth-weight values and the exact lag
window used to connect births to climate exposure.

## Safe outputs from exploration

Safe to commit:

- column names and labels;
- field availability/missingness summaries;
- extraction contracts and pseudocode;
- small fake examples that do not come from respondent records.

Do not commit:

- raw `.DTA`, `.SAV`, `.DAT`, `.ZIP`, or GPS files;
- respondent-level CSV exports;
- screenshots showing real respondent rows;
- exact displaced GPS points unless access/data-rights allow it.
