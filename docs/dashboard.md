# Dashboard

The planning dashboard answers one question for a place, a health outcome and
a month: how much of this outcome may be attributed to heat, and where.

It is composed of three cards, all reading the same selection.

## The selection

The URL records the geography, optional `admin_unit`, `outcome`, `month`, and
`view` (`observed` or `projection`). Projected choices also retain `scenario`,
`period`, `selector`, and `reference`; the observed group uses
`observed_selector`.

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
offer is set per country and outcome under Settings → Workspace → Model
options. The API
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

Saved plans are listed on **Start planning**, where each reopens its dashboard
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
