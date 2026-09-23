# Dashboard

The planning dashboard answers one question for a place, a health outcome and
a month: how much of this outcome may be attributed to heat, and where.

It is composed of three cards, all reading the same selection.

## The selection

Everything on the page derives from four things in the URL: the geography, an
optional `admin_unit`, the `outcome`, and the `month`.

```
/dashboard/geo-in-madhya-pradesh?admin_unit=geo-in-madhya-pradesh-division-bhopal&outcome=lbw&month=2026-08
```

They live in the URL rather than in component state so a reload, the back
button and a shared link all land on the same view. Changing any of them
re-reads every card.

The breadcrumb under the selectors is built by walking the geography ancestry
of the selected area, broadest first — `Kenya › Garissa`, or
`India › Madhya Pradesh › Bhopal Division`. It follows the sub-area picker, and
consecutive repeats collapse, so a country-level view shows `Kenya` once rather
than `Kenya › Kenya`.

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

- **The model reads a window, not one month.** The card shows the selected
  month's temperature, but a low-birth-weight model scores three months and an
  under-five model scores four days. Two months can show the same temperature
  and return different answers because their earlier months differ, so the
  provenance panel lists the whole exposure vector.
- **A zero is explained.** Below the model's reference temperature nothing is
  attributed to heat, and an odds ratio under 1 means no excess. The card says
  which applies rather than printing a bare "0%".

### Spatial risk map

Every administrative area beneath the selected geography, shaded by
attributable fraction. Areas are administrative shapes carrying an area-level
value — not a modelled grid, and they must not be drawn as cells, which would
imply a spatial resolution the model does not have.

Geometry is simplified for drawing only (the response discloses the tolerance);
every climate extraction uses the unsimplified boundary.

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
