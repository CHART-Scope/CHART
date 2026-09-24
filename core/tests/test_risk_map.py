"""The spatial card: administrative areas shaded by attributable fraction.

The rule these exist to hold is the one that is easy to lose: an area with no
fitted model, or no computed month, must still be returned. A map that omits
uncovered areas redraws them as sea, which tells a reader those places carry
no risk - the opposite of what an absent model means.

``boundary`` is PostGIS in production and plain text on SQLite, so the two
geometry functions the query uses are registered as pass-through stubs here.
That keeps the real query under test rather than a paraphrase of it.
"""

from __future__ import annotations

import json
from datetime import date

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.risk.service import load_map_view
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    Base,
    DataLabel,
    Geography,
    ModelRelease,
    PredictionResult,
)

SQUARE = json.dumps(
    {
        "type": "Polygon",
        "coordinates": [
            [[74.0, 21.0], [76.0, 21.0], [76.0, 23.0], [74.0, 23.0], [74.0, 21.0]]
        ],
    }
)


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _register_geometry_stubs(dbapi_connection, _record):
        # Pass-through: the values stored below are already GeoJSON text, and
        # what is under test is the selection and shaping, not PostGIS.
        # GeoAlchemy2 drops the ST_ prefix on non-PostGIS dialects, so both
        # spellings are registered rather than guessing which one is emitted.
        for name in ("ST_SimplifyPreserveTopology", "SimplifyPreserveTopology"):
            dbapi_connection.create_function(
                name, 2, lambda geometry, _tolerance: geometry
            )
        for name in ("ST_AsGeoJSON", "AsGeoJSON"):
            dbapi_connection.create_function(name, 1, lambda geometry: geometry)

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as s:
        geography = Geography(slug="in-mp", country="India", name="Madhya Pradesh")
        s.add(geography)
        s.flush()
        s.add_all(
            [
                AppGeography(
                    id="geo-in-madhya-pradesh",
                    country_code="IN",
                    level="state",
                    level_label="State",
                    name="Madhya Pradesh",
                    path="/india/madhya-pradesh",
                    sort_order=0,
                ),
                AppGeography(
                    id="geo-in-mp-bhopal",
                    country_code="IN",
                    level="geo_level_1",
                    level_label="Division",
                    name="Bhopal",
                    parent_id="geo-in-madhya-pradesh",
                    path="/india/madhya-pradesh/bhopal",
                    sort_order=1,
                ),
                AppGeography(
                    id="geo-in-mp-rewa",
                    country_code="IN",
                    level="geo_level_1",
                    level_label="Division",
                    name="Rewa",
                    parent_id="geo-in-madhya-pradesh",
                    path="/india/madhya-pradesh/rewa",
                    sort_order=2,
                ),
                AppGeography(
                    id="geo-in-mp-indore",
                    country_code="IN",
                    level="geo_level_1",
                    level_label="Division",
                    name="Indore",
                    parent_id="geo-in-madhya-pradesh",
                    path="/india/madhya-pradesh/indore",
                    sort_order=3,
                ),
                ModelRelease(
                    id="rel-lbw",
                    module="prediction",
                    outcome="lbw",
                    version="v1",
                    status="active",
                    model_files=[],
                    input_spec={},
                ),
            ]
        )
        units = {}
        for code, app_id in (
            ("bhopal", "geo-in-mp-bhopal"),
            ("rewa", "geo-in-mp-rewa"),
            ("indore", "geo-in-mp-indore"),
        ):
            unit = AdminUnit(
                geography_id=geography.id,
                app_geography_id=app_id,
                level="division",
                code=code,
                name=code.title(),
                boundary=SQUARE,
                bbox_west=74.0,
                bbox_south=21.0,
                bbox_east=76.0,
                bbox_north=23.0,
            )
            s.add(unit)
            units[code] = unit
        s.flush()
        # Bhopal and Rewa are covered by a fitted model; Indore is not.
        for code in ("bhopal", "rewa"):
            s.add(
                ActiveModelAssignment(
                    admin_unit_id=units[code].id,
                    module="prediction",
                    outcome="lbw",
                    model_release_id="rel-lbw",
                )
            )
        # Only Bhopal has actually been computed.
        s.add(
            PredictionResult(
                admin_unit_id=units["bhopal"].id,
                outcome="lbw",
                model_release_id="rel-lbw",
                valid_month=date(2026, 8, 1),
                scenario="seas5_ensemble",
                horizon="m1",
                pregnancy_window=1,
                odds_ratio=1.15,
                ci95_low=0.9,
                ci95_high=1.4,
                attributable_fraction_milli=130,
                on_training_support=True,
                model_version="v1",
                data_label=DataLabel.reanalysis,
            )
        )
        s.flush()
        s.units = units
        yield s


def test_every_area_is_returned_even_with_no_model_or_no_result(session) -> None:
    """The rule the card exists to keep."""
    view = load_map_view(session, "geo-in-madhya-pradesh", "2026-08", outcome="lbw")

    by_name = {area.name: area for area in view.areas}
    assert set(by_name) == {"Bhopal", "Rewa", "Indore"}

    assert by_name["Bhopal"].value_percent == 13.0
    assert by_name["Bhopal"].missing_reason is None

    # Covered by a model, but this month was never run.
    assert by_name["Rewa"].value_percent is None
    assert by_name["Rewa"].missing_reason == "no_prediction"

    # No fitted model at all - the Turkana case.
    assert by_name["Indore"].value_percent is None
    assert by_name["Indore"].missing_reason == "no_model"


def test_areas_carry_drawable_geometry_and_the_view_carries_bounds(session) -> None:
    view = load_map_view(session, "geo-in-madhya-pradesh", "2026-08", outcome="lbw")

    assert view.bounds == [74.0, 21.0, 76.0, 23.0]
    assert all(area.geometry is not None for area in view.areas)
    assert view.areas[0].geometry["type"] == "Polygon"
    # Disclosed so display geometry is never mistaken for analysis geometry.
    assert view.simplify_tolerance_degrees > 0


def test_a_month_with_no_results_still_draws_every_area(session) -> None:
    """An empty month is a map of hatching, not an empty card."""
    view = load_map_view(session, "geo-in-madhya-pradesh", "2026-01", outcome="lbw")

    assert len(view.areas) == 3
    assert all(area.value_percent is None for area in view.areas)


def test_an_outcome_with_no_release_reports_every_area_as_unmodelled(
    session,
) -> None:
    view = load_map_view(
        session, "geo-in-madhya-pradesh", "2026-08", outcome="under_5_mortality"
    )

    assert len(view.areas) == 3
    assert {area.missing_reason for area in view.areas} == {"no_model"}


def test_an_area_with_a_job_in_flight_reports_running(session) -> None:
    """ "On its way" and "nobody asked" are different states.

    Without the distinction the map tells a planner to run a month that is
    already running, and they queue it twice.
    """
    from chart.shared.db.models import PredictionRequestRecord

    session.add(
        PredictionRequestRecord(
            request_key="in-flight",
            location_slug="geo-in-mp-rewa",
            timeframe_id="month",
            admin_unit_id=session.units["rewa"].id,
            planning_date=date(2026, 8, 1),
            status="running",
            stage="preparing_climate",
            request_payload={"geography_id": "geo-in-mp-rewa", "outcome": "lbw"},
        )
    )
    session.flush()

    view = load_map_view(session, "geo-in-madhya-pradesh", "2026-08", outcome="lbw")
    by_name = {area.name: area for area in view.areas}

    assert by_name["Rewa"].missing_reason == "running"
    # Unchanged: a value still wins, and no model still reads as no model.
    assert by_name["Bhopal"].missing_reason is None
    assert by_name["Indore"].missing_reason == "no_model"


def test_a_leaf_selection_is_framed_on_its_siblings(session) -> None:
    """Drilling into one division must not collapse the map to one shape.

    Bhopal has nothing beneath it, so framing on Bhopal returned Bhopal and
    nothing else: a lone polygon with no context, identical in outline to the
    one every other division drew, so switching between them looked like
    nothing happened.
    """
    view = load_map_view(session, "geo-in-mp-bhopal", "2026-08")
    names = sorted(area.name for area in view.areas)
    assert names == ["Bhopal", "Indore", "Rewa"]
    # The selected area keeps its own value; the siblings keep theirs, which
    # here means none - that is the honest state, not a reason to omit them.
    bhopal = next(area for area in view.areas if area.name == "Bhopal")
    assert bhopal.value_percent == 13.0
    indore = next(area for area in view.areas if area.name == "Indore")
    assert indore.value_percent is None
    assert indore.missing_reason == "no_model"


def test_a_parent_selection_still_frames_on_its_own_children(session) -> None:
    """The regression guard: the fix must not change the drilled-out view."""
    view = load_map_view(session, "geo-in-madhya-pradesh", "2026-08")
    assert sorted(area.name for area in view.areas) == ["Bhopal", "Indore", "Rewa"]


def test_a_place_with_its_own_outline_does_not_cover_its_children(session) -> None:
    """Madhya Pradesh has a state boundary as well as eleven divisions.

    Returning both drew the state polygon over its own divisions: one shape,
    one shade, and no visible change when switching between the divisions
    underneath it.
    """
    geography = session.query(Geography).first()
    session.add(
        AdminUnit(
            geography_id=geography.id,
            app_geography_id="geo-in-madhya-pradesh",
            level="state",
            code="mp",
            name="Madhya Pradesh",
            boundary=SQUARE,
            bbox_west=74.0,
            bbox_south=21.0,
            bbox_east=76.0,
            bbox_north=23.0,
        )
    )
    session.flush()

    view = load_map_view(session, "geo-in-madhya-pradesh", "2026-08")
    assert sorted(area.name for area in view.areas) == ["Bhopal", "Indore", "Rewa"]


def test_a_place_with_no_children_is_still_drawn(session) -> None:
    """The other half of the rule: only *containing* areas are dropped.

    An area with a boundary and nothing beneath it is the finest level there
    is, so it must survive - otherwise the map would empty itself.
    """
    view = load_map_view(session, "geo-in-mp-bhopal", "2026-08")
    assert "Bhopal" in [area.name for area in view.areas]
