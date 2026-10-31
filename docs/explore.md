# Explore: CHART without an account

`/explore` is the public, map-first view of CHART. A visitor picks India or
Kenya, a health outcome and a map layer, and clicks any place to see:

- its **observed** estimate for a month (share of low birth weight or
  under-five deaths linked to that month's heat, with the odds or risk ratio),
- its **seasonal cycle**: the typical share in each calendar month, with the
  country's official heat season marked,
- **how it changes** across the projection periods under the chosen emissions
  scenario.

Layers are the observed heat share (by year and month), the projected heat
share (by period and scenario), **temperature** and **heatwave days** (by
month, from Copernicus ERA5-Land at about 9 km) and the vulnerability
assessment index. Temperature and heatwave days are context: the health
estimates keep reading the data their models were fitted on (ERA5 for India;
the modellers' 0.1 °C product, reached by calibrated ERA5, for Kenya). A
double click, or "Open its …", moves down a level (state → divisions →
districts; country → counties → constituencies). The URL holds every choice,
so a view can be shared as a link.

## Historical and projected

Layers are grouped by where their numbers come from. **Historical** layers
(observed heat share, temperature, heatwave days) come from Copernicus
reanalysis of what happened; **Projections** from climate-model scenarios.
On a historical layer the seasonal cycle is the selected year's observed
months against the average year, with the year's average share; months with
no heat excess count as 0%. On the projected layer it is the period's typical
year against 1981–2010.

**Heatwave days** follow each country's own rule. Kenya: days in runs of 3
or more at or above the county's KMD threshold (Nairobi 32 °C, Mombasa 36,
Kisumu 37, Turkana, Marsabit and Mandera 38; 35 °C elsewhere); a
constituency uses its county's. India: days whose maximum reached 40 °C,
labelled "Days ≥ 40 °C", because IMD's full heatwave definition also needs
4.5 °C above the normal, which this count does not test. Both are computed
on each area's mean daily maximum, so a single hot spot inside a large area
can be missed.

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

**Act on it** opens the action repository (heat actions first, searchable,
filterable by type and cost, with sources) and links to the planning
dashboard for the place. A visitor who is not signed in goes through sign-in
and returns to that place's dashboard (`chart.auth.returnTo`, same-site paths
only).

Drilling back is as direct as drilling in: the **↑** button on the map first
leaves the selected place (zooming back out to the whole area), then goes up a
level with the place you came from outlined; the breadcrumb jumps to any
ancestor; and the browser's Back and Forward step through the places visited.
Outcome, layer, month, period and emissions are kept throughout.

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

| Open to visitors | Still requires sign-in |
|---|---|
| `GET /heat-outlook/{place}`, `/map`, `/observed`, `/observed/map`, `/climate`, `/capabilities` | Predictions and climate pulls (`POST /climate/...`) |
| `GET /vra/indicators`, `/vra/{place}/assessment`, `/map`, `/areas/{area}` | Model settings, VRA uploads and coverage, users, workspaces, audit |
| `GET /geographies` (already public) | Saved plans and the planning dashboard |

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
