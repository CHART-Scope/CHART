# Explore: CHART without an account

`/explore` is the public, map-first view of CHART. A visitor picks India or
Kenya and a health outcome, clicks any place on the map, and reads its
estimate: the share of low birth weight or under-five deaths linked to heat.
A double click, or "Open its …", moves down a level (state → divisions →
districts; country → counties → constituencies). The URL holds every choice,
so a view can be shared as a link.

## Layout

The panel reads top to bottom, and nothing repeats:

1. **Place and outcome.**
2. **Time, as three tabs**: **Observed** (a past month, from Copernicus ERA5
   reanalysis), **Next 6 months** (the Copernicus C3S seasonal forecast) and
   **Projections** (a future period under an emissions scenario, from ISIMIP
   climate models).
3. **The estimate**, always there and following the tab: the share, its
   precision bars (observed and projected), when it is for, and its ratio or
   range.
4. **That tab's controls only**: year and months for Observed (with the
   official heat season and its source); the six months and their line for
   Next 6 months; period length, period and emissions for Projections.
5. **Map shows**: heat share, temperature, heatwave days (both past months
   only, from Copernicus ERA5-Land at about 9 km) or population. The estimate
   above stays whatever the map shows.
6. **Vulnerability (VRA)**, a switch: the assessment index as dots over the
   map (larger and darker for more vulnerable areas), on any tab and any map
   choice, with each area's score in the hover card. It says so when no
   assessment is published.
7. **Seasonal cycle**, always, as context: the year against the average year
   (Observed), the average year (Next 6 months), the period against
   1981–2010 (Projections); then **How it changes** across periods
   (Projections only), **People**, and **Act on it**.

Temperature and heatwave days are context: the health estimates keep reading
the data their models were fitted on (ERA5 for India; the modellers' 0.1 °C
product, reached by calibrated ERA5, for Kenya). Every legend names its
source as a link; heatwave days also link the threshold's source (KMD, IMD).
Links from before the tabs (`layer=…`) still open the same view.

## Historical and projected

On Observed the seasonal cycle is the selected year's observed months against
the average year, with the year's average share; months with no heat excess
count as 0%. On Projections it is the period's typical year against
1981–2010.

**Heatwave days** follow each country's own rule. Kenya: days in runs of 3
or more at or above the county's KMD threshold (Nairobi 32 °C, Mombasa 36,
Kisumu 37, Turkana, Marsabit and Mandera 38; 35 °C elsewhere); a
constituency uses its county's. India: days whose maximum reached 40 °C,
labelled "Days ≥ 40 °C", because IMD's full heatwave definition also needs
4.5 °C above the normal, which this count does not test. Both are computed
on each area's mean daily maximum, so a single hot spot inside a large area
can be missed.

## Outside the covered places

A click on the map where no area is drawn is checked against each country's
outline (its population map, already cached by Explore): inside a covered
place, Explore moves there; anywhere else a card says CHART is not there yet
and links to `/support?near=<lat>,<lng>`. That public page says what is
covered (Kenya; Madhya Pradesh, India), the three ways to help (health data,
climate and modelling work, partnership or funding) and opens an email to
info@scopeimpact.fi with the area filled in. The landing page links to it too.

## Precision

Beside a place's estimate, signal bars show how firm it is: three for high,
two for moderate, one for low precision, in green, amber and red (the design
system's precision colours). These are the dashboard's classes,
computed by the API from the 95% interval of the odds or risk ratio
(`core/chart/risk/precision.py`, thresholds agreed with the health team);
hovering or focusing shows a small card with the level, the interval and what
it means. They follow the estimate as the tab, month, period or scenario
changes. A forecast month carries the model's own interval at the central
forecast (saved with each issue), so it shows its precision like an observed
month; its "Range" line is a different uncertainty, the spread across
forecast systems. A place shown as the mean of its places (Kenya as a whole)
has no single interval and shows no bars. A low-precision
figure is drawn a little softer. The map's colours do not carry precision.

## Next six months

The **Forecast heat share** layer and each place's **Next 6 months** panel come
from the Copernicus C3S multi-system seasonal forecast (nine centres: ECMWF,
Météo-France, DWD, CMCC, NCEP, UK Met Office, JMA, ECCC, BOM), the best
available source for the coming months: 1° grid, issued on the 10th of each
month, six months ahead. Raw forecast temperatures carry each system's bias,
so CHART uses C3S's maximum-temperature **anomalies** (each system against its
1993–2016 hindcast normal) and adds them to the place's own ERA5 normal for the
calendar month (2006–2016), so forecasts sit on the scale the models read.
The central value is the mean of systems; the range is the coolest and
warmest system. A month the model scores below a risk ratio of 1 is shown as
0% (no heat excess) in both countries, never as missing. A place with no
model of its own (Kenya as a whole, a state without an under-five curve)
shows the mean of the places directly beneath it, as the observed view
averages Kenya's counties. Each place's months are scored with its own models: Kenya's
calibrated national curves (counties and constituencies; under-five by
shifting each 2006–2016 year's daily series by the forecast's departure from
normal), India's live models (districts with their division's; under-five
with the forecast repeated over its lags, the release's interactive
profile). `python -m chart.climate.seasonal_forecast build --country KE`
builds an issue and saves it to `MODEL_CACHE_DIR/forecasts/{country}-{issue}.json`
(downloads are kept under `ERA5_CACHE_DIR/c3s-seasonal`, so a rebuild does not
queue at the CDS again); the Dagster `seasonal_forecast_sensor` checks daily and
rebuilds both countries when C3S publishes a new issue. Beyond six months
forecast skill is too low to show; the projections start in the next
five-year period.

The **Next 6 months** tab puts the six months right under the estimate: a
row of months (a firmer divider where the year turns, heat-season months
underlined in amber), then the place's line, in the seasonal cycle's style,
with the central forecast, the range across systems shaded behind it and the
heat season marked. Either picks the map's month, and the estimate follows.

## Population

The **Population** layer shades people per km² for everyone, children under
five or women aged 15–49, and every place's panel shows its counts. Figures
come from WorldPop Global2 R2025A for 2025 (constrained, UN-adjusted, 1 km,
CC BY 4.0), built from each country's census, summed over CHART's own
boundaries by `core/scripts/worldpop_population.py` into
`core/chart/population/worldpop_2025.json` (63 places in India, 337 in
Kenya; small places weight the cells they partly cover). Kenya's national
total is 56.8 million and its counties sum within 0.1%, its constituencies
within 0.7%; Madhya Pradesh is 91.1 million and its divisions and districts
sum within 0.01%. WorldPop applies one age structure across Madhya Pradesh,
so its under-five and women shares are the same in every district there;
Kenya's vary by place. Served at `GET /heat-outlook/{place}/population`.

## Finding a place, and acting on it

The search box autocompletes any state, division, district, county or
constituency in either country (names that start with the text first, larger
areas first); an empty box lists the areas being viewed. Picking a place
moves the view to its country, outlines it on the map, dims the rest and
zooms to it. Hovering an area shows its value, its rank among the areas
shown, and fetches its details so the click is instant.

Emissions scenarios read as **Low / Medium / High** (with the SSP code
beneath), ranked by the scenarios a release publishes: SSP1-2.6, SSP3-7.0 and
SSP5-8.5 for the current handover. The seasonal cycle is a line of the
typical share in each month for the chosen period, against the 1981–2010
baseline, with the official heat season shaded.

**Act on it** opens the [action repository](actions.md) for the place's
country (heat actions first, searchable, filterable by type and cost, with
sources) and links to the planning dashboard for the place. A visitor who is not signed in goes through sign-in
and returns to that place's dashboard (`chart.auth.returnTo`, same-site paths
only).

Drilling back is as direct as drilling in: the **↑** button on the map first
leaves the selected place (zooming back out to the whole area), then goes up a
level with the place you came from outlined; the breadcrumb jumps to any
ancestor; and the browser's Back and Forward step through the places visited.
Outcome, layer, month, period and emissions are kept throughout.

## Caching

Three layers keep a view from loading twice. The API builds each published
read once per **data version** (`core/chart/api/read_cache.py`: the newest
climate run, stored prediction, active model, VRA run, forecast and
population files, and the deployed image) and keeps it. The version is re-read
every five minutes, so new results appear within five minutes even while a
load writes rows. It sends an `ETag`
and `Cache-Control` (public for visitors, private for signed-in users, one
minute, then revalidate), so a browser reload either reuses its copy or gets
a 304 without the server rebuilding anything. Explore's own page cache
answers any read already made this visit, including hover prefetches.
Responses are keyed by the caller's Authorization header; the cache is on
where `CHART_READ_CACHE=1` (the deployed API).

## Loading

Each read is made once per page and only once every choice it depends on is
known, so a view loads in one step; shown values stay until their
replacement arrives, so the map recolours in place instead of blanking. Kenya's
county estimates, which are scored from stored ERA5 rather than read from
stored results, are cached on the server per county until a new ERA5 run is
stored, and warmed in the background when the API starts (twenty years of
daily under-five scoring otherwise took longer than the proxy allows).

## Public read

Explore only reads stored, published estimates; nothing is downloaded or
scored when a visitor opens a place (see [Observed climate data](observed-climate.md)).
The API serves those reads without a sign-in when `CHART_PUBLIC_READ=true`:

| Open to visitors                                                                               | Still requires sign-in                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /heat-outlook/{place}`, `/map`, `/observed`, `/observed/map`, `/climate`, `/capabilities` | Predictions and climate pulls (`POST /climate/...`)                |
| `GET /vra/indicators`, `/vra/{place}/assessment`, `/map`, `/areas/{area}`                      | Model settings, VRA uploads and coverage, users, workspaces, audit |
| `GET /geographies` (already public)                                                            | Saved plans and the planning dashboard                             |

A visitor reads as the `public_viewer` role over every published place. The
variable defaults to `false`: an installation holding data it may not publish
leaves it off, and every read then needs a signed-in user as before.

## Map

The map is MapLibre GL over OpenFreeMap's Positron basemap (open data from
OpenStreetMap, no API key; `NEXT_PUBLIC_EXPLORE_BASEMAP` overrides the style
URL). Areas are CHART's own simplified boundaries. Heat shares use 5-point classes
up to 35%: projected shares in Madhya Pradesh run 25–34% across divisions, and
the dashboard's top class ("over 15%") painted the whole state one colour. If the basemap cannot load, the areas are drawn on a plain
background, so the map never comes up empty.

## Phones and tablets

Up to 860 px wide (phones, portrait tablets) Explore is one page that scrolls:
the map on top at 58% of the screen height (at least 300 px), the panel full
width beneath, its sections at most 680 px wide on tablets. The legend keeps to
one line of band starts (0, 5, 10 … >35%). Wider screens, landscape tablets
included, keep the panel beside the map. `web/e2e/explore-responsive.spec.ts`
checks iPhone SE, iPhone 14, Pixel 7, iPad mini, iPad Air and iPad landscape:
no sideways scroll, map and legend sizes, the panel's place, the forecast row,
search and reaching the end of the panel.
