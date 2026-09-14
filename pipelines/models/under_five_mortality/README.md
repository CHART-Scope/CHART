# MP under-five mortality model

Review-only integration of the Madhya Pradesh under-five mortality model supplied
on 12 August 2026. The compact artifact contains coefficients, covariance,
basis definitions, references, support limits, and aggregate fitted counts only.
It excludes DHS respondent rows, fitted values, residuals, and spatial points.

The release is division-only. Madhya Pradesh is a navigation parent, not a
prediction target, because the supplied archive contains no fitted state model.

The source archive and recovered RDS stay outside Git. Rebuild the review artifact:

```bash
Rscript pipelines/models/under_five_mortality/inference/package_mp_model.R \
  /path/to/Dlnm_Mod_obj_by_Under_5_Mortality_and_Division_MP_2026_08_12.rds \
  pipelines/models/under_five_mortality/model/IN_MP_under5_mortality_tmax_v0.1.0-review.rds
```

Activation remains review-only until the modeller confirms the approved direct
versus BLUP curve, temperature cadence, reference temperature, effect-measure
label, and projection method.
