# Dashboard

The planning dashboard answers one question for a place, a health outcome and
a month: how much of this outcome may be attributed to heat, and where.

It is composed of three cards, all reading the same selection.

## The selection

The URL records the geography, optional `admin_unit`, `outcome`, `month`, and
`view` (`observed`, `forecast` or `projection`). The forecast keeps its own
month in `forecast_month`. Projected choices also retain `scenario`, `period`,
`selector`, and `reference`; the observed group uses `observed_selector`.

The filter bar labels every dropdown (place levels, **Climate hazard**,
**Health domain**, **Health outcome**) and ends with **Configure plan**, which
opens the recommended actions for the same place and outcome. Domains no model
covers yet are listed as "coming soon" and cannot be picked.

```
/dashboard/geo-in-madhya-pradesh?admin_unit=geo-in-madhya-pradesh-division-bhopal&outcome=lbw&month=2026-08
```

They live in the URL rather than in component state so a reload, the back
button and a shared link all land on the same view. Changing any of them
re-reads every card.

Each geography dropdown names its own level: **All divisions**, **All districts**,
**All counties**, or **All constituencies**. Choosing this first option clears
the child selection and returns to the current parent's map and available
results, retaining the other filters. The vulnerability page uses the same
place selectors. Routing-only roots such as India do not offer an aggregate
option when they lead directly to their supported state.

Which pregnancy windows or age groups, scenarios and data views the cards
offer is set per country and outcome under Settings → Models → Model
options. A pregnancy window or age group dropdown appears only when more
than one option is switched on; with just the default, the cards use it
without asking. The API
applies those settings, so the dashboard only lists what it is given. See
[Model settings](model-integration.md#model-settings).

The breadcrumb under the selectors is built by walking the geography ancestry
of the selected area, broadest first — `Kenya › Garissa`, or
`India › Madhya Pradesh › Bhopal Division`. It follows the sub-area picker, and
consecutive repeats collapse, so a country-level view shows `Kenya` once rather
than `Kenya › Kenya`.

Clicking an area with children opens its child map: Madhya Pradesh → division →
district, or Kenya → county → constituency. **Back to …** returns to the parent
map. Map navigation retains the outcome, view and compatible filters, as do
reload and browser history. Both view tabs remain selectable at finer levels.
Where an observed model is unavailable, the dashboard explains this and keeps
the geographic outlines visible with no health values; going back restores the
parent's available observed view.

## The risk overview tabs

The climate-attributable risk card has three tabs that share one layout:
switching changes the month or period controls, the figures, the icon array
and the map's shading, not the place, question or columns.

- **Observed** — a year and a month with observed data (ERA5); months
  without data stay in the grid, greyed.
- **Forecasted** — the C3S multi-system seasonal forecast, the same one
  Explore shows: up to six months ahead, shown as one row of month chips
  with the year written on the first month and on January (no year
  dropdown). It is loaded only when the tab opens, and a place without a
  saved forecast says so. Forecasts cannot be saved to a plan yet, so
  **Save plan** is disabled on this tab.
- **Projected** — three rows: **Time horizon** (the window lengths, e.g.
  10 or 20 years, when the release publishes several — picking one opens its
  first future period, named in the sentence; otherwise the periods
  themselves), **Emission scenario** (cards with the plain-language name over
  the SSP code) and **Reference period** (annual average; **peak heat
  season**, the share over the place's heat season as set in Settings › Heat
  seasons, named without its months for now; or **highest-risk months**, the
  three months the model ranks highest).

The panel shows no caveat card: a release's model caveat (for example the
national LBW model's climate-zone note) stays in the API's `selector_note` and
in the release documentation, and is used only as the message when no estimate
is reported. A **See more** link beside the panel label opens the published
methodology; there are no seasonal or all-periods tables.

Switching place, tab, month or scenario never blanks the card. The overview is
drawn by the dashboard layout (`web/src/app/(workspace)/dashboard/layout.tsx`)
rather than the `[geo]` page, so a new place updates the mounted dashboard
instead of rebuilding it. Reads go through one client-side query cache
(TanStack Query, `web/src/lib/queryClient.tsx`): the place list, model
catalogs, capabilities and each outlook view are kept for the session, so a
place, month or setting seen before answers from memory. Published views are
not re-read during a session; saving model settings in Settings clears them
(and the kept maps) so the dashboard reads them afresh.

All three tabs (Observed, Forecasted, Projected) load together, and once the
open tab is drawn the other tabs' maps are fetched too, so switching tab is
instant. The icon array and the map stay mounted throughout: while a new
selection loads, the icon array keeps its last share and the map its shapes and
last colours, then the figures shade over and the map's fills fade to the new
values. Each place's outlines are kept from its first map; every later map of
that place (another tab, month or setting) is requested with `geometry=false`
and carries only each area's value, reason and odds ratio, which are laid on
the kept outlines. Signing out clears the cache. Settings keeps a tab you have
opened mounted (hidden) so going back to it does not reload it.

The sentence under the icon array reads "At a [forecasted / projected
average annual] maximum temperature of X °C in <when>, N% of <outcome> cases
in <place> may be attributable to heat exposure." The temperature is the
month's ERA5 mean daily maximum (observed), the central forecast (forecasted)
or the mean of the period's typical months (projected); without one the
sentence starts at "In <when>". Beneath it: the share's 95% CI (or the
forecast-system / climate-model range), the odds or risk ratio with its 95% CI
and the precision badge (High, Moderate or Low, from the ratio's interval).

## The cards

### Risk vs protection

Illustrates what the selected model is about. The figures are not fixed: each
model release declares them in its manifest (`presentation.visualization`), so
low birth weight draws a newborn and a pregnant woman while under-five
mortality draws a child. A new outcome brings its own illustration rather than
inheriting another's.

### Heat and the health outcome

The number, for the selected month. Choosing a month is choosing a temperature:
the month's observed exposure is what the model scores.

Two things on this card are easy to misread and are therefore stated
explicitly:

- **The model reads a window, not one month.** A low-birth-weight model scores
  the selected month and the two before it, and the card lists all three
  temperatures beneath the headline. Two months can show the same temperature
  and return different answers because their earlier months differ.
- **A zero is explained, over the same window.** If none of the scored months
  reached the model's reference temperature, nothing is attributed to heat. If
  they did but the combined odds ratio is 1 or less, the card says the model
  finds no extra risk, gives the odds ratio and its range, and says when that
  range is too wide to tell either way. It never prints a bare "0%".

### Spatial risk map

Every administrative area beneath the selected geography, shaded by
attributable fraction. Areas are administrative shapes carrying an area-level
value — not a modelled grid, and they must not be drawn as cells, which would
imply a spatial resolution the model does not have.

Geometry is simplified for drawing only (the response discloses the tolerance);
every climate extraction uses the unsimplified boundary.

Moving around it stays smooth, as in Explore: resting the pointer on an area
for a moment fetches the map that clicking it opens, and opening a place whose
map is not loaded yet keeps the last map on screen, dimmed, until it arrives,
never a blank. Up to 60 maps are kept for the session (cleared on sign-out).
Custom maps with their own loader (outlook, vulnerability) keep the last-map
behaviour but are not fetched ahead.

A click never empties the risk card either. Which views a place and outcome
publish (its capabilities) are kept for the session, and while the next
place's arrive the current card stays drawn; only the first load of the
dashboard shows its placeholder.

For what the map queues by itself and what its four states mean, see
[Data pipeline](data-pipeline.md#what-the-dashboard-queues-on-its-own).

## Where a number comes from

Each stored prediction is a row in `prediction_result`, keyed by admin unit,
outcome, model release, month, scenario, horizon and pregnancy window. Results
are shared: a month computed by one planner is visible to everyone with access
to that place, and is never recomputed for the next person.

Each row carries the model release and artifact checksum that produced it, the
exposure vector it was scored on, and the reference it was measured against, so
a figure on screen can be traced back to the fitted model and the observations
behind it.

## Saved plans and recommendations

**Save plan** on the outlook card saves the outcome, place (with any sub-area)
and the observed or projected selection under a name. The API resolves the
selection and captures the estimate itself through the same outlook service
the card reads: the attributable share with its 95% CI, the odds or risk ratio,
the model release and the country's official heat season. A plan therefore
keeps the modelling it was made from after a newer release is published.
Observed views from India's live monthly model are saved without a figure, with
the reason recorded. Plans are private to their owner, at most 100 per user,
and hidden once their place leaves the user's geography scope
(`/saved-plans`, see the API reference).

Saved plans are listed on the **Planning center**, where each reopens its dashboard
view or its recommendations. The [action repository](actions.md) page opened
with `?plan=<id>` ranks the repository's actions for the plan:

- The API reads the figure as a **risk level**: *clearly raised* when the
  ratio's 95% CI lies above 1, *possibly raised* when only the central estimate
  does (or a share is reported without a ratio), *not detected* otherwise, and
  *unknown* without a figure.
- **Timing**: a projection plans ahead (*before the heat season*); an observed
  month inside the official season is *during*, up to two months after it
  *after*, otherwise *before*.
- The API ranks the actions (rules by default, or a self-hosted classifier)
  and shows the top three with the reasons they rank.

The insight beside them is a template unless an administrator chose a
language model; see [Recommendations and AI](recommendations.md). The figure
and the ranking never depend on it.

## Planning center

The **Planning center** (`/plan`, "Planning center" in the sidebar) builds one
sentence: "We're planning together for the impacts of [climate hazard] on
[health domain] in [place]." Both choices start empty, and **Start planning
together** stays disabled until both are made. The enabled options are the
hazards and domains the place's models cover; the roadmap's others (Flooding,
Air pollution; Vector-borne diseases, Heat-related illnesses, Non-communicable
diseases) are listed as "(coming soon)" and cannot be chosen. The outcome is
picked on the dashboard, which opens on the first one the models estimate.

Planning starts in Madhya Pradesh for India and in Kajiado, its co-design
county, for Kenya (`PREFERRED_START_AREAS` in
`web/src/features/planning/contextFamilies.ts`). Switching country on the
dashboard still opens the country or state as a whole.
