# MP under-five mortality review

The 12 August 2026 archive passed ZIP integrity checks. CHART packages its
102 MB fitted-model source as a 5.2 KB respondent-free review artifact containing
only basis definitions, coefficients, covariance, references, support limits,
and aggregate counts.

## Model shape

- Ten separately fitted Madhya Pradesh division blocks; no state block.
- Conditional-logistic case-crossover DLNM.
- Four daily maximum-temperature inputs: lag 0 through lag 3.
- Under-five review total: 10,676 fitted rows and 2,421 events.
- Interactive review repeats the selected slider temperature across all four
  lags. Batch prediction is disabled pending modeller confirmation.

Madhya Pradesh remains a navigation parent. Only divisions receive active
under-five mortality mappings.

## Review blockers

The modeller must confirm the approved direct versus meta-analysis/BLUP curve,
temperature cadence, reference-temperature rule, odds-ratio versus relative-risk
label, support-range definition, and whether the supplied statewide projections
were intentionally generated from the Sagar response object.

See `pipelines/models/under_five_mortality/README.md` for artifact provenance and
the reproducible packaging command.
