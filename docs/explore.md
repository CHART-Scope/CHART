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
