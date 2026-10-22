# Madhya Pradesh VRA demo data: sources and method

Everything was downloaded on **2026-10-22**. `build.py` then turned the raw files in `raw/` into the outputs, with no values typed in by hand. To run it: `.venv/bin/python build.py`. It needs `pdftotext` (poppler 25.05.0), `openpyxl` and `xlrd`.

Outputs:

| File | Content |
|---|---|
| `mp_divisions_vra.csv` | Division values in the CHART VRA upload template (`area_code,area_name,indicator_code,value,vintage,source_name,source_url,notes`) |
| `mp_districts_source.csv` | The district values used, with Census numerators and denominators and the population weight |
| `district_name_map.csv` | Every district spelling seen in each source, the crosswalk district it maps to, and its division |
| `spotchecks.csv` | Every automated cross-check and whether it matched |
| `raw_manifest.csv` | Path, size and SHA-256 of every raw file (the full table is at the end of this file) |

The district→division mapping comes from `pipelines/boundaries/data/mp_district_division_crosswalk.csv`, which was only read.

## Sources

### 1. NFHS-5 (2019-21) district fact sheets: Madhya Pradesh compendium (official)
- File: `raw/NFHS5_MP_district_compendium.pdf`. It has 318 pages: the state fact sheet plus 51 district fact sheets. Its title page reads "Compendium of Fact Sheets, Key Indicators, State and Districts of Madhya Pradesh, NFHS-5 2019-21", and the PDF ModDate is 2021-12-13.
- Original URL: `http://rchiips.org/nfhs/NFHS-5_FCTS/COMPENDIUM/Madhya_Pradesh.pdf`. rchiips.org now returns 404 because NFHS moved to nfhsiips.in, which does not list the fact sheets publicly.
- Retrieved from the Internet Archive capture `https://web.archive.org/web/20230420150640id_/http://rchiips.org/nfhs/NFHS-5_FCTS/COMPENDIUM/Madhya_Pradesh.pdf`. **The file's SHA-1 (base32 `UVBRWL5DD5QR5KAZKFMMHFV4MX42HZSU`) matches the digest that the Wayback CDX index recorded for the original rchiips.org response**, so these are the bytes IIPS served.
- Licence and terms: © International Institute for Population Sciences (IIPS), Mumbai. The suggested citation is "IIPS and ICF. 2021. NFHS-5, State and District Factsheets, Madhya Pradesh. Mumbai: IIPS." No open-data licence is stated. These are public government statistics, used here with attribution.
- What was taken: district fact-sheet items 8, 9, 10, 12, 15, 39, 49, 73, 74, 76, 77, 84, 88, 91, 94 and 97 (NFHS-5 column) for 51 districts. The code asserts each item's label text and its Women/Men block before using the value. The state page is used only for a plausibility check.
- Parenthesised values are "based on 25-49 unweighted cases". They are used and flagged in the notes. `*` means "fewer than 25 unweighted cases, suppressed". Those are left missing and listed in the notes.

### 2. NFHS-5 individual district fact sheets (official, used only for spot checks)
- `raw/nfhs5_official_wayback/{Bhopal,Ratlam,Shahdol,Sheopur}.pdf`, from Wayback captures of `http://rchiips.org/nfhs/NFHS-5_FCTS/MP/<District>.pdf` taken at 20220818163916, 20220218113705, 20220430110905 and 20220430110919 respectively (`id_` raw mode).

### 3. Independent machine-readable mirror (used only for spot checks)
- `raw/ssk_MP.csv` and `raw/ssk_README.md` come from https://github.com/SaiSiddhardhaKalla/NFHS at commit `3403a17c5717fe08dc6414980965e5af83209411` (`_states/MP.csv`). This is a community conversion of the rchiips PDFs. The repository has no licence file. It covers 50 MP districts and omits Agar Malwa. It is **not** a source of any output value.
- Not used: https://github.com/pratapvardhan/NFHS-5 (CC BY 4.0). It covers only NFHS-5 Phase-1 states and has no Madhya Pradesh data.

### 4. Census of India 2011 (Office of the Registrar General & Census Commissioner, India; NADA catalogue)
These were downloaded from censusindia.gov.in. The server sends an incomplete TLS certificate chain, so curl ran with `-k`. File integrity was confirmed instead: every file's size equals the server's Content-Length, and every xlsx passes a zip integrity test. The NADA pages state no licence. The data are Census of India publications, © ORGI, and are used with attribution.

| Raw file | Catalogue / download URL | What was taken |
|---|---|---|
| `census2011/DDW_PCA0000_2011_Indiastatedist.xlsx` | https://censusindia.gov.in/nada/index.php/catalog/6191 (download/9268), PCA SD: state and district level | MP district `Total` rows: TOT_P, P_06, TOT_WORK_P, MAIN_CL_P, MAIN_AL_P, MARG_CL_P, MARG_AL_P. `Urban` rows: TOT_P (the slum denominator) |
| `census2011/A-1_NO_OF_VILLAGES_TOWNS_HOUSEHOLDS_POPULATION_AND_AREA.xlsx` | https://censusindia.gov.in/nada/index.php/catalog/42526 (download/46152) | District population and area (km²). Shajapur sub-district populations for the Agar Malwa weight |
| `census2011/DDW-2300C-14.xls` | https://censusindia.gov.in/nada/index.php/catalog/1561 (download/4638), C-14 MP | Persons aged 65-69, 70-74, 75-79 and 80+. Females aged 15-19 and 20-49. "All ages" |
| `census2011/DDW-C20-2300.xlsx` | https://censusindia.gov.in/nada/index.php/catalog/43392 (download/47096), C-20 MP | Total disabled persons (Total, all ages) |
| `census2011/DDW-B18-2300-nic-final.xlsx` | https://censusindia.gov.in/nada/index.php/catalog/43257 (download/46925), B-18 MP | NIC-2008 divisions 41, 42 and 43 (construction): main plus marginal workers, persons |
| `census2011/slum_data_census_2011.xls` | https://censusindia.gov.in/nada/index.php/catalog/6190 (download/9267), PCA SLUM, town level | Slum population (TOT_P) for each MP slum town |
| `census2011/pca_tv/PC11_PCA-TV-23xx.xlsx` (50 files) | https://censusindia.gov.in/nada/index.php/catalog/<id> (ids and download URLs are in `census2011/pca_tv/fetched.txt`) | Only the town code → district code lookup, used to place slum towns in districts |

### 5. NITI Aayog: National Multidimensional Poverty Index, A Progress Review 2023
- `raw/niti/India-National-Multidimentional-Poverty-Index-2023.pdf` from https://www.niti.gov.in/sites/default/files/2023-08/India-National-Multidimentional-Poverty-Index-2023.pdf. © NITI Aayog, Government of India, a public report used with attribution.
- What was taken: the table "Madhya Pradesh: Overview of District Headcount Ratio, Intensity and MPI", NFHS-5 (2019-21) headcount ratio column, for 51 districts.

### 6. Agar Malwa composition
- `raw/misc/agarmalwa_about-district.html` from https://agarmalwa.nic.in/en/about-district/ (the official district website). It states: "The district was formed by removing Agar, Badod, Susner and Nalkheda tehsils from Shajapur District". This is used only to build the Census-2011 population weight for Agar Malwa.

### NFHS-6
NFHS-6 (2023-24) district data was not used. On nfhsiips.in it sits behind a "Guest Login" form that requires a name, mobile number, email address, profession and purpose. That counts as registration, so NFHS-6 was not reachable without credentials. All NFHS values here are from NFHS-5.

## Indicators produced

| Code | Definition used | Source | Division method |
|---|---|---|---|
| ac.improved_water_source | NFHS item 8: **population** living in households with an improved drinking-water source (the catalogue unit says "% of households") | NFHS-5 | population-weighted mean |
| ac.improved_sanitation | NFHS item 9: **population** living in households using an improved sanitation facility (the catalogue unit says "% of households") | NFHS-5 | weighted mean |
| ac.clean_cooking_fuel | NFHS item 10: households using clean fuel for cooking | NFHS-5 | weighted mean |
| ac.health_insurance | NFHS item 12: households with any usual member covered by a health insurance or financing scheme | NFHS-5 | weighted mean |
| ac.women_10yr_schooling | NFHS item 15: women aged 15-49 with 10 or more years of schooling | NFHS-5 | weighted mean |
| ac.oop_delivery_public | NFHS item 39: average out-of-pocket expenditure per delivery in a public health facility, Rs. (nominal, 2019-21) | NFHS-5 | weighted mean |
| ac.full_vaccination | NFHS item 49: children aged 12-23 months fully vaccinated (vaccination card or mother's recall) | NFHS-5 | weighted mean |
| sens.child_stunting / wasting / underweight / overweight | NFHS items 73 / 74 / 76 / 77 | NFHS-5 | weighted mean |
| sens.anaemia_women | NFHS item 84: all women aged 15-49 who are anaemic | NFHS-5 | weighted mean |
| sens.high_blood_sugar_women / men | NFHS items 88 / 91: blood sugar high or very high (>140 mg/dl) or taking medicine, adults 15+ | NFHS-5 | weighted mean |
| sens.high_bp_women / men | NFHS items 94 / 97: elevated blood pressure (≥140/90) or taking medicine, adults 15+ | NFHS-5 | weighted mean |
| ac.multidimensional_poverty | MPI headcount ratio, NFHS-5 (2019-21) | NITI MPI 2023 | weighted mean |
| exp.population_density | population ÷ area (km²) | A-1 | Σ population ÷ Σ area |
| exp.workers_share | TOT_WORK_P ÷ TOT_P | PCA | Σ numerator ÷ Σ denominator |
| exp.agri_workers_share | (MAIN_CL+MAIN_AL+MARG_CL+MARG_AL) ÷ TOT_WORK_P | PCA | Σ/Σ |
| exp.construction_workers_share | B-18 NIC divisions 41-43, main plus marginal ÷ PCA TOT_WORK_P | B-18 + PCA | Σ/Σ |
| sens.child_0_6_share | P_06 ÷ TOT_P | PCA | Σ/Σ |
| sens.elderly_share | persons 65+ ÷ all ages (age-not-stated stays in the denominator) | C-14 | Σ/Σ |
| sens.women_20_49_share | females 20-49 ÷ total persons | C-14 | Σ/Σ |
| sens.adolescent_girls_share | females 15-19 ÷ total persons | C-14 | Σ/Σ |
| sens.disability_share | C-20 total disabled ÷ PCA TOT_P | C-20 + PCA | Σ/Σ |
| sens.slum_population_share | slum population of the district's slum towns ÷ district urban population | PCA SLUM + PCA TV + PCA | Σ/Σ |

Not produced:

- **ac.men_10yr_schooling.** NFHS-5 *district* fact sheets carry only the women's item (item 15). The men's figure exists only on the state sheet.
- Every other catalogue indicator is out of scope for this pass. No hazard indicators were included.

## District → division mapping
- **NFHS-5 and MPI** use 51 districts, with boundaries as of 31 March 2017. That set includes Agar Malwa and excludes Niwari, Mauganj, Maihar and Pandhurna.
- **Census 2011** uses 50 districts, with Agar Malwa still part of Shajapur.
- Each source district is mapped straight to its division through the crosswalk (`district_name_map.csv`). Spelling aliases are applied explicitly: "Khargone (West Nimar)"→Khargone, "Khandwa (East Nimar)"→Khandwa, "Narsimhapur"→Narsinghpur, "Hoshangabad (Narmadapuram)"→Hoshangabad.
- Every later split stays inside its parent's division, according to the crosswalk:

| District | Carved from | Division |
|---|---|---|
| Agar Malwa | Shajapur | Ujjain |
| Niwari | Tikamgarh | Sagar (in the crosswalk as its own district; its 2019-21 data sit inside Tikamgarh's) |
| Mauganj | Rewa | Rewa (`parent_pre_split`) |
| Maihar | Satna | Rewa (`parent_pre_split`) |
| Pandhurna | Chhindwara | Jabalpur (`parent_pre_split`) |

  So division totals are unaffected by these later splits.

## Aggregation and approximations
- **NFHS and MPI rates use a population-weighted mean of district values.** The weights are Census 2011 **total population**, not each indicator's own base population (children under 5, women 15-49, households and so on). This is an approximation. Districts with a suppressed value are dropped and the remaining weights renormalised; the notes column lists them.
- Agar Malwa's weight is the 2011 population of the Agar, Badod, Susner and Nalkheda sub-districts from A-1. Shajapur's NFHS/MPI weight is Shajapur 2011 minus that figure.
- Plausibility check: the weighted mean of all 51 districts falls within 1 point (or 5%) of the official MP state value for all 16 NFHS indicators (`spotchecks.csv`, check `state_value_vs_weighted_district_mean`).
- **Census shares are exact.** The division value is the sum of district numerators divided by the sum of denominators.
- Values are rounded to 2 decimals.

## Caveats
- **Survey-time boundaries.** NFHS-5 was fielded in 2019-21 on 2017 district boundaries. Census figures are 2011. Neither has been re-cut to today's 55 districts. This is harmless at division level because every split stays inside one division.
- **Suppressed values.** Full vaccination is `*` (suppressed) for Bhopal, Jabalpur and Raisen. The Bhopal and Jabalpur division vaccination means therefore exclude their largest, urban districts and are biased. Small-sample values (25-49 cases, flagged in notes) are concentrated in vaccination and in Jabalpur's child anthropometry and out-of-pocket spending.
- **Unit mismatch.** For water and sanitation, NFHS reports % of *population*, not % of households as the catalogue unit says. The value is used as published.
- **Out-of-pocket spending** is nominal rupees from 2019-21 and is not inflation-adjusted.
- **MPI data quality.** NITI flags at least 25% sample loss for Agar Malwa, Bhopal, Raisen and Khandwa in NFHS-5, and advises interpreting those districts' MPI with discretion.
- **NFHS-5 fact sheets** are labelled provisional by IIPS. The district compendium has not been superseded by a final district report.
- **Census age shares.** "Age not stated" counts are in the denominator but not the numerator.
- **Construction workers.** B-18 excludes cultivators and agricultural labourers, which do not overlap with construction, so the numerator is complete.
- Slum share: all 303 MP slum towns in the PCA SLUM file were matched to a 2011 district by town code (none unmatched), and their summed slum population equals the MP state slum total row in the same file. Slum towns are reported as "(M + OG)" units and so include outgrowths. Slums exist only in statutory towns that reported them, so a 0 means no slum was enumerated.
- Raw downloads that were later discarded (the pratapvardhan repo and SaiSiddhardhaKalla's mirrored PDFs) are not used by build.py and are not in `raw/`.

## Spot checks (generated from spotchecks.csv)

| Check | Matched / total |
|---|---|
| state_value_vs_weighted_district_mean(approximation, not exact) | 16/16 |
| compendium_vs_official_district_pdf | 64/64 |
| compendium_vs_ssk_csv_mirror | 797/800 |
| census_pca_vs_a1_population | 50/50 |
| census_pca_vs_c14_population | 50/50 |

Compendium values compared with the official individual district PDFs (4 districts × 16 indicators; `None` = suppressed `*`):

| District | Indicator | Compendium (used) | Official district PDF | Match |
|---|---|---|---|---|
| Bhopal | ac.improved_water_source | 96.7 | 96.7 | True |
| Bhopal | ac.improved_sanitation | 79.6 | 79.6 | True |
| Bhopal | ac.clean_cooking_fuel | 83.6 | 83.6 | True |
| Bhopal | ac.health_insurance | 50.7 | 50.7 | True |
| Bhopal | ac.women_10yr_schooling | 47.4 | 47.4 | True |
| Bhopal | ac.oop_delivery_public | 3176.0 | 3176.0 | True |
| Bhopal | ac.full_vaccination | None | None | True |
| Bhopal | sens.child_stunting | 19.9 | 19.9 | True |
| Bhopal | sens.child_wasting | 20.6 | 20.6 | True |
| Bhopal | sens.child_underweight | 29.1 | 29.1 | True |
| Bhopal | sens.child_overweight | 1.8 | 1.8 | True |
| Bhopal | sens.anaemia_women | 53.5 | 53.5 | True |
| Bhopal | sens.high_blood_sugar_women | 14.3 | 14.3 | True |
| Bhopal | sens.high_blood_sugar_men | 12.9 | 12.9 | True |
| Bhopal | sens.high_bp_women | 22.4 | 22.4 | True |
| Bhopal | sens.high_bp_men | 24.9 | 24.9 | True |
| Ratlam | ac.improved_water_source | 91.0 | 91.0 | True |
| Ratlam | ac.improved_sanitation | 69.4 | 69.4 | True |
| Ratlam | ac.clean_cooking_fuel | 53.1 | 53.1 | True |
| Ratlam | ac.health_insurance | 37.9 | 37.9 | True |
| Ratlam | ac.women_10yr_schooling | 23.8 | 23.8 | True |
| Ratlam | ac.oop_delivery_public | 1729.0 | 1729.0 | True |
| Ratlam | ac.full_vaccination | 93.0 | 93.0 | True |
| Ratlam | sens.child_stunting | 29.0 | 29.0 | True |
| Ratlam | sens.child_wasting | 16.2 | 16.2 | True |
| Ratlam | sens.child_underweight | 28.6 | 28.6 | True |
| Ratlam | sens.child_overweight | 1.2 | 1.2 | True |
| Ratlam | sens.anaemia_women | 59.5 | 59.5 | True |
| Ratlam | sens.high_blood_sugar_women | 7.9 | 7.9 | True |
| Ratlam | sens.high_blood_sugar_men | 9.7 | 9.7 | True |
| Ratlam | sens.high_bp_women | 21.3 | 21.3 | True |
| Ratlam | sens.high_bp_men | 24.0 | 24.0 | True |
| Shahdol | ac.improved_water_source | 79.2 | 79.2 | True |
| Shahdol | ac.improved_sanitation | 61.4 | 61.4 | True |
| Shahdol | ac.clean_cooking_fuel | 26.5 | 26.5 | True |
| Shahdol | ac.health_insurance | 58.4 | 58.4 | True |
| Shahdol | ac.women_10yr_schooling | 30.7 | 30.7 | True |
| Shahdol | ac.oop_delivery_public | 1274.0 | 1274.0 | True |
| Shahdol | ac.full_vaccination | 86.1 | 86.1 | True |
| Shahdol | sens.child_stunting | 44.0 | 44.0 | True |
| Shahdol | sens.child_wasting | 20.4 | 20.4 | True |
| Shahdol | sens.child_underweight | 39.2 | 39.2 | True |
| Shahdol | sens.child_overweight | 2.1 | 2.1 | True |
| Shahdol | sens.anaemia_women | 56.4 | 56.4 | True |
| Shahdol | sens.high_blood_sugar_women | 11.5 | 11.5 | True |
| Shahdol | sens.high_blood_sugar_men | 16.6 | 16.6 | True |
| Shahdol | sens.high_bp_women | 19.8 | 19.8 | True |
| Shahdol | sens.high_bp_men | 23.2 | 23.2 | True |
| Sheopur | ac.improved_water_source | 91.1 | 91.1 | True |
| Sheopur | ac.improved_sanitation | 48.0 | 48.0 | True |
| Sheopur | ac.clean_cooking_fuel | 22.9 | 22.9 | True |
| Sheopur | ac.health_insurance | 27.1 | 27.1 | True |
| Sheopur | ac.women_10yr_schooling | 15.9 | 15.9 | True |
| Sheopur | ac.oop_delivery_public | 1409.0 | 1409.0 | True |
| Sheopur | ac.full_vaccination | 65.8 | 65.8 | True |
| Sheopur | sens.child_stunting | 45.8 | 45.8 | True |
| Sheopur | sens.child_wasting | 16.2 | 16.2 | True |
| Sheopur | sens.child_underweight | 37.7 | 37.7 | True |
| Sheopur | sens.child_overweight | 1.2 | 1.2 | True |
| Sheopur | sens.anaemia_women | 64.9 | 64.9 | True |
| Sheopur | sens.high_blood_sugar_women | 9.6 | 9.6 | True |
| Sheopur | sens.high_blood_sugar_men | 10.1 | 10.1 | True |
| Sheopur | sens.high_bp_women | 19.2 | 19.2 | True |
| Sheopur | sens.high_bp_men | 25.7 | 25.7 | True |

Mismatches against the community CSV mirror (the official compendium shows `*` (suppressed) for these; the mirror wrote 0.0):

| District | Indicator | Compendium (used) | Mirror |
|---|---|---|---|
| Bhopal | ac.full_vaccination | None (*) | 0.0 |
| Jabalpur | ac.full_vaccination | None (*) | 0.0 |
| Raisen | ac.full_vaccination | None (*) | 0.0 |

State plausibility (weighted mean of 51 districts vs official MP state Total):

| Indicator | Weighted district mean | State fact sheet |
|---|---|---|
| ac.improved_water_source | 89.3 | 89.0 |
| ac.improved_sanitation | 65.32 | 65.1 |
| ac.clean_cooking_fuel | 40.4 | 40.1 |
| ac.health_insurance | 38.58 | 38.1 |
| ac.women_10yr_schooling | 29.35 | 29.3 |
| ac.oop_delivery_public | 1622.37 | 1619.0 |
| ac.full_vaccination | 78.14 | 77.1 |
| sens.child_stunting | 34.6 | 35.7 |
| sens.child_wasting | 19.45 | 19.0 |
| sens.child_underweight | 32.85 | 33.0 |
| sens.child_overweight | 1.94 | 2.0 |
| sens.anaemia_women | 54.74 | 54.7 |
| sens.high_blood_sugar_women | 10.04 | 9.8 |
| sens.high_blood_sugar_men | 12.59 | 12.2 |
| sens.high_bp_women | 20.44 | 20.6 |
| sens.high_bp_men | 22.46 | 22.7 |

## Raw files (generated from raw_manifest.csv)

| Path | Bytes | SHA-256 |
|---|---|---|
| `raw/NFHS5_MP_district_compendium.pdf` | 10318793 | `5b65cc522dc839bbdc39eb105a43df0ad8849c5c0a9ae4a1274c98327cb8ce75` |
| `raw/census2011/A-1_NO_OF_VILLAGES_TOWNS_HOUSEHOLDS_POPULATION_AND_AREA.xlsx` | 2235660 | `6b649697ed5993da834b674173dab68e1ef9abb97e234155a80884c2fa4584f5` |
| `raw/census2011/DDW-2300C-14.xls` | 181248 | `5b5d4a708be64251ce20acf769c5b311588066e80116b14112e9e469e0840e23` |
| `raw/census2011/DDW-B18-2300-nic-final.xlsx` | 3824456 | `6cf1384c94c31a9503f05f0164927f7c59da99844895bdb128a4868204d0ad25` |
| `raw/census2011/DDW-C20-2300.xlsx` | 378481 | `782a6cfba0acff2020a3534813378b6115f03df686edd545e0e8e599c8b666d6` |
| `raw/census2011/DDW_PCA0000_2011_Indiastatedist.xlsx` | 1376414 | `7a8f70d46c43b5dd30eefe920f251752f69f6af8589594c21ac06499074646f5` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2301.xlsx` | 320640 | `ed416753a8505284dcd45c34e21eda1f9778664c4f8408ccf2369fd478b0421a` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2302.xlsx` | 496286 | `714c5dfe1abf365883b125ac1e2e5e8c8676cb1643daf973b0a3315f00101085` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2303.xlsx` | 565388 | `c77ff6b438dce423f5ae7b903c82cbda45f5aaf473cb42195ce367d92985226b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2304.xlsx` | 415666 | `bbd7a18ec1c5bab1223374252d3d880206815a80e7749f9dd4e252bc641951ec` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2305.xlsx` | 365751 | `a0287def79a100b21a5ef8c493bcc311afa2db7799a5fbf0950a5c3b3d524c18` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2306.xlsx` | 764324 | `d73f9c172e812009b015e59db50fe2746fd9fd1e2891391405e486a0fc73c3d7` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2307.xlsx` | 598918 | `32cc7657ce2383cb2943ce54c2fd525a2f0767a88f375984e00ad7d289e380ff` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2308.xlsx` | 740225 | `e62cfebddeb0be52473bd344c5eb8ef193428db1c42cd0de0d5740d6eae0cd79` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2309.xlsx` | 558602 | `7d0cf0233fbe777e45b82f55843dce4bf52786ae2b979b522be324d7ec071a8b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2310.xlsx` | 1136075 | `9a09d46e436ac3c5bc7688dafd053ef810c766e15ce7d3fafe47a2bd1944355b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2311.xlsx` | 668161 | `6c8d1d48df60882b892fe2148989dde8aed20d5e63680fb6e9e584ae7ec58f4c` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2312.xlsx` | 1073592 | `89ea306d5759c1ede39eec246e1d4d93b139d9fdb368bfe91e4c9ab3067a522d` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2313.xlsx` | 1407557 | `03ef6dd70092253d44fe45c6cdd0894962b315e2bfc1b605bdb8dc1098e0c5f9` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2314.xlsx` | 367525 | `f4b689280c56e07a193fa0d6a41b61218ea3a257c0e587e3638775b34174ab9b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2315.xlsx` | 462979 | `c1230b7ed7c21f93368f9c254b3221b7112e505fbd6120be1772082c953e4e68` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2316.xlsx` | 563390 | `b12ac68f372731075304050de7b2aeda6d678def436bf10fad45bda8c7918f0d` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2317.xlsx` | 638127 | `c4edf9c0d637d1ae08dcadf42bd9928ffd16fa7d1048708a62d0d79b369fbfd2` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2318.xlsx` | 667843 | `b5ef51b77c20a608aeab1da55c60b6feab916ba43f59ca5b553a2a73fdc3a12f` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2319.xlsx` | 670273 | `3da93d2c4588c0d08b201ab3fac4bf334909d9a4a5a7bc013ab3df6f80b687db` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2320.xlsx` | 680835 | `51603ebdbcb8867d8fdb1fc117d9c8c5849a4d7cb081403906e2e0f92ca03d15` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2321.xlsx` | 867425 | `d6dcbe4ca76587a690dbbfa38158671eda2b6c7fb7a4ccfbc75ff9f54c630c26` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2322.xlsx` | 447802 | `248ef226aa3448c4433ff2d8f8279b37b216cdc0ae8b972c54fa0458c8fa7d6b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2323.xlsx` | 757618 | `242d817aca3a4b0d2cb6288c0ee4d1f3ebe89792ddf1bd2913d225f542d8c34e` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2324.xlsx` | 440266 | `6dee1cbcb908a912beb41a254c4960a5d91c72176a01456b24b3d4cd84f35464` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2325.xlsx` | 949272 | `a9793e31cdf0a3356eecc6d52b1d651fa45dbd9238d244bb0cb6710c9624e3b2` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2326.xlsx` | 853619 | `2e66f293f72f4c1bbfd90264c235b1e752dd45dd573cf78435d204db84b4dcc6` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2327.xlsx` | 325794 | `6a388b263827da1c8815cd620a7741bbf999cd4550f18502ad86258eae839a48` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2328.xlsx` | 627348 | `67a74022b83b7dadc75db1268b46bc9ffe4ae1ff79257688a10b4bcfc07e99d4` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2329.xlsx` | 821954 | `5555be673ec951c541a5246b764cf3721a37df845b8f7646b48317c9b2eb2783` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2330.xlsx` | 799319 | `c99990c708e9ab027ff5767737128436266e5b9174aae7af194097d0782b3ede` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2331.xlsx` | 321757 | `e92ab4c7dc1eb5607348cd85ed47912cf53c6dc179aa320564ddff0dc176b20b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2332.xlsx` | 563508 | `5f4ef0ac3b18ffeefeb8efc977a2ef231a1167cdd3535e60126cf42b4f18497b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2333.xlsx` | 532127 | `c93fcb45a5ef9c13f23d18a03725e828fcc543e3686871b9747b4e1c0c7f8273` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2334.xlsx` | 832528 | `9e60610648925d4cfbbf3260c9794d26a6b374744a9cc7e49fef5aece61ae03d` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2335.xlsx` | 583943 | `da734fbec4ca869ab5d9be7bcf4cde36885651ffd828c54b5102ca9553d902ee` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2336.xlsx` | 474687 | `648b760e87e004fc7bf7085fd89ad9c3eda113b21c8ee4398efa8b4e4b2f7693` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2337.xlsx` | 659729 | `320988f1d26a57bf4b0db9d7aefabc49c5dff4219dd4455dd7b53d8e023e561e` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2338.xlsx` | 1134592 | `02d549c53451822c437460c9a2bbd50b7a6e8ef219a13d13ea9f50d78448d0fa` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2339.xlsx` | 827855 | `96e19daa0b5fb35e7c0183a5a3b644e811a51ea66c04c6acc1e6db8a13571dfb` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2340.xlsx` | 771825 | `4253ce0f547e051f4991c061597bef112e857b3f09ca0471df4e6d3d0f419120` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2341.xlsx` | 703231 | `4a6e8e932febff91b3d31d4680b6c767568f61cad7d6f6b9677e92d3a4fcba1f` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2342.xlsx` | 473547 | `a351e26161afb74d33a6df012d6de28a907a263068869cb4822f5ce577d5a0aa` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2343.xlsx` | 495866 | `7d38867365c96dfd1508724a3d5f94fc5c30fcd891068a32571c13e7653161f0` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2344.xlsx` | 355410 | `3d833eff932de521937d3edc2a63760122fa9776eca5a224c6b94b20ef1517cb` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2345.xlsx` | 563537 | `9220a0ef59e0d671faede7cb5990a7b187d31afe5f08321b0b6ad8e48bf3fd5f` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2346.xlsx` | 402710 | `3466c3faf3953c87ab3f0fae377a5d6cd964ea4342a70609d50d0537a8354f8e` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2347.xlsx` | 447967 | `c0201f5e27443f9df156da7dc091f04f484ddfb8e03f1ab7bb682c51f44b8bc4` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2348.xlsx` | 307020 | `aa55934b19823ad3d06b173f3798b87c5901a85961699c4f689b8971af11628b` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2349.xlsx` | 428710 | `9b2305890ef6d0a95359f9c30e808ec34d8c18ea79c4bfd7f14ef6a49f11be7a` |
| `raw/census2011/pca_tv/PC11_PCA-TV-2350.xlsx` | 191888 | `e904d089d5aa1ed486630b28bab5f680a1bb89fbd5b192325bfb0f6c242ad798` |
| `raw/census2011/pca_tv/fetch.sh` | 1099 | `edd0c3e5ff0a947fd31e4fc1c45e5ca05f609edf47da8a299898b496ed5d616f` |
| `raw/census2011/pca_tv/fetched.txt` | 8854 | `2129ffa895410cb1e76331025cba0a2ef7d2517b4ca1a4f8b25b9ba970180091` |
| `raw/census2011/pca_tv/ids.txt` | 1100 | `5e1c96a33c5a19f7fbdd71e88bad0556d32709de50361cb2abeb4e6e09f17986` |
| `raw/census2011/slum_data_census_2011.xls` | 1658368 | `693dc15454e8ad53cffd74cac7f5cea792beae73a018365b2e6b4e1a72e1598e` |
| `raw/misc/agarmalwa_about-district.html` | 123050 | `1da06151bc3ea8415b0a4e6e65aaee087306156db0f6bfb6cec20521e7cfb0bb` |
| `raw/nfhs5_official_wayback/Bhopal.pdf` | 432506 | `d10d9ead7000f934118ab8a95360aa6e0c5d1f466325c1d28680f0348abc8e69` |
| `raw/nfhs5_official_wayback/Ratlam.pdf` | 432495 | `4cd8be0abdb07f9efa9865824a8d23464c7298414579bec8bfa70cdccfa24392` |
| `raw/nfhs5_official_wayback/Shahdol.pdf` | 432284 | `3a4274db07e90524a39893ae6c7098ab713659efa9b9d064851e27fe3c787faa` |
| `raw/nfhs5_official_wayback/Sheopur.pdf` | 432549 | `f74553b4f086558de6bd0ba6102fafdf06af8a55713b0a7a13914939d73dbdb8` |
| `raw/niti/India-National-Multidimentional-Poverty-Index-2023.pdf` | 22713906 | `4c694f54b919704bc78d7dd2340c7d99e3aada3abff90d118202f2234c556fdf` |
| `raw/ssk_MP.csv` | 779193 | `fbadb7ce9cb2c16ef62afd4d56c316387547a25d179f8262fe2c5fbc84be7585` |
| `raw/ssk_README.md` | 3351 | `ca8ac9b76d76550393f3aac1cca1b82c5c667c4f7b8549dde396754ea5740368` |
