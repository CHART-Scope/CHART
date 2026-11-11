# How the estimates are made

The dashboard asks one question: **what share of cases of a health outcome in
a place may be attributable to heat?** This page explains, briefly, where that
share comes from and how to read it. The detail is in
[Modeling](modeling.md) and [Model integration](model-integration.md).

## What the number is

The **attributable share** is the fraction of cases that the fitted model
links to temperatures above the minimum-risk temperature, for the place and
period shown. It describes a population, not individuals, and an association,
not proof of cause. The icon array shows the same share as figures out of 100.

## The models

The modelling team fits distributed-lag non-linear models (DLNM): each gives
an exposure–response curve of risk against daily maximum temperature (Tmax),
spread over the time before the outcome.

| Outcome | Exposure | Reference |
| --- | --- | --- |
| Low birth weight | Mean Tmax of the birth month and the eight months before it; whole pregnancy or one trimester | Minimum-risk temperature: 28 °C (Madhya Pradesh), 24.3 °C (Kenya) |
| Under-five mortality | Tmax on the day and the three days before; by age group (neonatal is the main analysis) | The area's 1991–2020 mean Tmax |

Curves are fitted for a state or a country. Districts, divisions, counties and
constituencies apply that curve to their own temperatures; they are not
separately fitted models.

## Where the temperatures come from

- **Observed:** Copernicus ERA5 daily maximum temperature, averaged over each
  area. Where the model was fitted on a different temperature product, ERA5 is
  shifted onto the model's scale with a fixed offset per area and month.
- **Forecasted:** the Copernicus C3S multi-system seasonal forecast, up to six
  months ahead. Each system's temperature anomaly is added to the area's ERA5
  normal; the figure uses the mean of the systems and the range runs from the
  coolest to the warmest.
- **Projected:** five CMIP6 climate models (about 0.5° grids) under three
  emission scenarios (SSP1-2.6, SSP3-7.0, SSP5-8.5). A time horizon is the
  average of its years, compared with the baseline (1981–2010 for low birth
  weight, 1991–2020 for under-five mortality). Projections are scenario
  averages, not forecasts of any particular year.

## Uncertainty and precision

- The **95% confidence interval** comes from the model's coefficient
  uncertainty. Shorter projected periods show the spread across climate
  models instead, which is not a confidence interval.
- The **ratio** (odds ratio for low birth weight, risk ratio for under-five)
  is derived from the share and its interval.
- The **precision** badge grades that interval: High (upper/lower ≤ 2.5),
  Moderate (≤ 5) or Low.
- A negative share, or one the modelling guides suppress, is shown as a
  message ("No excess heat risk estimated…") instead of a number, and as
  "No heat excess" on the map, so it is not read as low risk.
- Estimates relying on temperatures rarely seen when the model was fitted are
  flagged.

## Limits

- Area values aggregate coarser climate grids; they do not add spatial detail
  the data does not have.
- Missing data are shown as unavailable, never as zero.
- The estimates support planning. They do not by themselves establish
  causality, and they are not diagnoses or forecasts for individuals.
