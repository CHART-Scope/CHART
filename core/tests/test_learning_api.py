"""HTTP + service tests for the Learning Hub catalogue and personal view."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.auth.schemas import CurrentUserContext
from chart.auth.service import require_current_user
from chart.learning import routes as learning_routes
from chart.shared.db.base import Base
from chart.shared.db.models import (
    AppGeography,
    AppUser,
    CountryGeoConfig,
    LearningResource,
    LearningTrack,
)

USER_ID = "user-kenya-planner"
GEOGRAPHY_ID = "geo-ke-homa-bay"


@pytest.fixture
def isolated_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with factory() as session:
        _seed_learning_fixture(session)
        session.commit()

    return factory


def _seed_learning_fixture(session: Session) -> None:
    # ``geographies`` carries a composite FK onto the per-country level config.
    session.add(
        CountryGeoConfig(
            country_code="KE",
            level_key="geo_level_1",
            level_label="County",
            sort_order=1,
        )
    )
    session.flush()
    session.add(
        CountryGeoConfig(
            country_code="KE",
            level_key="country",
            level_label="Country",
            sort_order=0,
        )
    )
    session.flush()
    session.add(
        AppGeography(
            id="geo-ke",
            country_code="KE",
            level="country",
            level_label="Country",
            name="Kenya",
            path="/kenya",
        )
    )
    session.flush()
    session.add(
        AppGeography(
            id=GEOGRAPHY_ID,
            country_code="KE",
            level="geo_level_1",
            level_label="County",
            name="Homa Bay",
            path="/kenya/homa-bay",
        )
    )
    session.add(AppUser(id=USER_ID, username="planner", display_name="County Planner"))
    session.add_all(
        [
            LearningTrack(
                slug="why-climate-and-health",
                title="Why Climate and Health Are Connected",
                summary="The exposure pathways.",
                position=1,
            ),
            LearningTrack(
                slug="funding-case",
                title="Building the Funding Case for Anticipatory Response",
                summary="Acting before a shock lands.",
                position=6,
            ),
        ]
    )
    session.add_all(
        [
            LearningResource(
                id=1,
                slug="why-climate-and-health-are-connected",
                url="https://www.youtube.com/watch?v=d0yjb3HuyQw",
                canonical_url="https://www.youtube.com/watch?v=d0yjb3HuyQw",
                youtube_id="d0yjb3HuyQw",
                kind="video",
                title="Why climate and health are connected",
                provider="WHO",
                objectives="Exposure pathways between climate and health.",
                audience_summary="District and county health officers",
                location_label="Global",
                countries=[],
                languages=["English"],
                duration_seconds=360,
                duration_label="6 min",
                format_label="Video - explainer",
                access_label="Open Access / Embeddable (WHO YouTube)",
                embed_status="embeddable",
                tracks=["why-climate-and-health"],
                tags=[],
                health_outcomes=[],
                is_published=True,
                is_featured=True,
                sort_weight=100,
            ),
            LearningResource(
                id=2,
                slug="anticipatory-action-homa-bay",
                url="https://www.youtube.com/watch?v=U_gVxlnyaeQ",
                canonical_url="https://www.youtube.com/watch?v=U_gVxlnyaeQ",
                youtube_id="U_gVxlnyaeQ",
                kind="video",
                title="Anticipatory Action in Flood-Prone Counties",
                provider="Kenya Red Cross Society",
                objectives="Early Action Protocols trigger early funding.",
                audience_summary="Disaster risk managers, county emergency planners",
                location_label="Homa Bay County, Kenya",
                countries=["Kenya"],
                languages=["English", "Swahili"],
                duration_seconds=300,
                duration_label="5 min",
                format_label="Field Documentary",
                access_label="Open Access / Embeddable (KRCS YouTube)",
                embed_status="embeddable",
                tracks=["funding-case"],
                tags=["Kenya context"],
                health_outcomes=["Heat-related illness"],
                is_featured=True,
                is_published=True,
                sort_weight=100,
            ),
            LearningResource(
                id=3,
                slug="uw-chart-namesake",
                url="https://earthlab.uw.edu/introducing-the-chart-tool",
                canonical_url="https://earthlab.uw.edu/introducing-the-chart-tool",
                youtube_id=None,
                kind="toolkit",
                title="UW EarthLab CHART tool",
                provider="UW EarthLab",
                location_label="Seattle, WA, USA",
                countries=["USA"],
                languages=["English"],
                duration_seconds=None,
                format_label="Tool writeup",
                access_label="",
                embed_status="restricted",
                tracks=[],
                tags=["External tool sharing the CHART name"],
                health_outcomes=["Health system capacity"],
                is_featured=False,
                # A different product that merely shares the name; it must
                # never reach the catalogue.
                is_published=False,
                sort_weight=25,
            ),
        ]
    )


def _override_user(
    *, roles: list[str] | None = None, scopes: list[str] | None = None
) -> CurrentUserContext:
    return CurrentUserContext(
        userId=USER_ID,
        username="planner",
        email=None,
        roles=roles if roles is not None else ["health_planning_lead"],
        geographyScopes=scopes if scopes is not None else [GEOGRAPHY_ID],
        activeGeographyId=GEOGRAPHY_ID,
        geographyLevel="geo_level_1",
    )


@pytest.fixture
def learning_client(isolated_session_factory, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        learning_routes, "get_session_factory", lambda: isolated_session_factory
    )
    app.dependency_overrides[require_current_user] = lambda: _override_user()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(require_current_user, None)


@pytest.fixture
def anonymous_client(isolated_session_factory, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        learning_routes, "get_session_factory", lambda: isolated_session_factory
    )
    yield TestClient(app)


def test_resources_are_public_and_exclude_unpublished(anonymous_client) -> None:
    response = anonymous_client.get("/learning/resources")

    assert response.status_code == 200
    body = response.json()
    slugs = [item["slug"] for item in body["items"]]
    assert body["total"] == 2
    assert "uw-chart-namesake" not in slugs


def test_resources_filter_by_track_and_length(anonymous_client) -> None:
    by_track = anonymous_client.get("/learning/resources?track=funding-case").json()
    assert [item["slug"] for item in by_track["items"]] == [
        "anticipatory-action-homa-bay"
    ]

    short_only = anonymous_client.get("/learning/resources?max_minutes=5").json()
    assert [item["slug"] for item in short_only["items"]] == [
        "anticipatory-action-homa-bay"
    ]


def test_search_matches_provider_and_tags(anonymous_client) -> None:
    hits = anonymous_client.get("/learning/resources?search=red cross").json()

    assert [item["slug"] for item in hits["items"]] == ["anticipatory-action-homa-bay"]


def test_taxonomies_are_derived_from_published_rows(anonymous_client) -> None:
    terms = anonymous_client.get("/learning/taxonomies").json()["terms"]

    languages = {term["label"] for term in terms if term["type"] == "language"}
    countries = {term["label"] for term in terms if term["type"] == "country"}
    assert languages == {"English", "Swahili"}
    # USA appears only on the unpublished namesake row.
    assert countries == {"Kenya"}


def test_tracks_report_their_resource_counts(anonymous_client) -> None:
    tracks = anonymous_client.get("/learning/tracks").json()["tracks"]

    assert [track["slug"] for track in tracks] == [
        "why-climate-and-health",
        "funding-case",
    ]
    assert all(track["resource_count"] == 1 for track in tracks)


def test_personal_view_requires_authentication(anonymous_client) -> None:
    assert anonymous_client.get("/learning/me").status_code == 401
    assert anonymous_client.put("/learning/me/preferences", json={}).status_code == 401
    assert (
        anonymous_client.put(
            "/learning/me/progress", json={"slug": "x", "seconds_watched": 1}
        ).status_code
        == 401
    )


def test_recommendations_rank_the_user_s_country_first(learning_client) -> None:
    body = learning_client.get("/learning/me").json()

    first = body["recommendations"][0]
    assert first["item"]["slug"] == "anticipatory-action-homa-bay"
    assert first["reason"] == "Because you work in Kenya"


def test_preferences_discard_unknown_tracks(learning_client) -> None:
    response = learning_client.put(
        "/learning/me/preferences",
        json={
            "audience_id": "county-planner",
            "interested_track_slugs": ["funding-case", "not-a-real-track"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["audience_id"] == "county-planner"
    assert body["interested_track_slugs"] == ["funding-case"]


def test_progress_never_moves_backwards_and_completes(learning_client) -> None:
    first = learning_client.put(
        "/learning/me/progress",
        json={"slug": "anticipatory-action-homa-bay", "seconds_watched": 200},
    ).json()
    assert first["seconds_watched"] == 200
    assert first["completed"] is False

    rewound = learning_client.put(
        "/learning/me/progress",
        json={"slug": "anticipatory-action-homa-bay", "seconds_watched": 10},
    ).json()
    assert rewound["seconds_watched"] == 200

    finished = learning_client.put(
        "/learning/me/progress",
        json={"slug": "anticipatory-action-homa-bay", "seconds_watched": 290},
    ).json()
    assert finished["completed"] is True


def test_progress_on_unknown_resource_is_404(learning_client) -> None:
    response = learning_client.put(
        "/learning/me/progress",
        json={"slug": "no-such-resource", "seconds_watched": 5},
    )

    assert response.status_code == 404
    assert response.json()["error"] == "LEARNING_RESOURCE_NOT_FOUND"


def test_continue_watching_offers_the_part_watched_item(learning_client) -> None:
    learning_client.put(
        "/learning/me/progress",
        json={"slug": "why-climate-and-health-are-connected", "seconds_watched": 120},
    )

    body = learning_client.get("/learning/me").json()

    assert body["continue_watching"]["item"]["slug"] == (
        "why-climate-and-health-are-connected"
    )
    assert body["continue_watching"]["reason"] == "4 min left"


def test_completed_resources_count_towards_their_track(learning_client) -> None:
    learning_client.put(
        "/learning/me/progress",
        json={
            "slug": "why-climate-and-health-are-connected",
            "seconds_watched": 360,
            "completed": True,
        },
    )

    body = learning_client.get("/learning/me").json()

    tracks = {track["slug"]: track for track in body["tracks"]}
    assert tracks["why-climate-and-health"]["completed_count"] == 1
    assert tracks["funding-case"]["completed_count"] == 0


def test_resources_filter_by_health_outcome(anonymous_client) -> None:
    hits = anonymous_client.get(
        "/learning/resources?outcome=Heat-related illness"
    ).json()

    assert [item["slug"] for item in hits["items"]] == ["anticipatory-action-homa-bay"]


def test_health_outcomes_appear_as_a_derived_facet(anonymous_client) -> None:
    terms = anonymous_client.get("/learning/taxonomies").json()["terms"]

    outcomes = {t["label"] for t in terms if t["type"] == "health_outcome"}
    # "Health system capacity" sits only on the unpublished namesake row.
    assert outcomes == {"Heat-related illness"}


def test_a_glance_does_not_count_as_watched(learning_client) -> None:
    """Opening and closing a player must not mark a resource complete."""

    result = learning_client.put(
        "/learning/me/progress",
        json={"slug": "anticipatory-action-homa-bay", "seconds_watched": 2},
    ).json()

    assert result["completed"] is False

    body = learning_client.get("/learning/me").json()
    tracks = {track["slug"]: track for track in body["tracks"]}
    assert tracks["funding-case"]["completed_count"] == 0


def test_only_the_shortlist_shows_by_default(anonymous_client) -> None:
    """A resource outside the hand-picked shortlist stays hidden for now."""

    featured = anonymous_client.get("/learning/resources").json()
    assert featured["total"] == 2

    everything = anonymous_client.get("/learning/resources?include=all").json()
    assert everything["total"] == 2  # the third row is unpublished, not unfeatured


def test_include_all_widens_beyond_the_shortlist(
    isolated_session_factory, anonymous_client
) -> None:
    from chart.shared.db.models import LearningResource

    with isolated_session_factory() as session:
        row = session.get(LearningResource, 2)
        row.is_featured = False
        session.commit()

    assert anonymous_client.get("/learning/resources").json()["total"] == 1
    assert anonymous_client.get("/learning/resources?include=all").json()["total"] == 2


def test_a_malformed_seed_row_does_not_truncate_the_catalogue(tmp_path) -> None:
    """One unparsable date must not silently drop every row after it."""

    import json

    from chart.setup import service as setup_service
    from chart.shared.db.models import LearningResource

    bundle = tmp_path / "seed.json"
    bundle.write_text(
        json.dumps(
            {
                "version": 1,
                "tracks": [],
                "items": [
                    {"slug": "first", "title": "First", "url": "https://a.example"},
                    {
                        "slug": "broken",
                        "title": "Broken",
                        "url": "https://b.example",
                        "publishedOn": "not-a-date",
                    },
                    {"slug": "last", "title": "Last", "url": "https://c.example"},
                ],
            }
        )
    )

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    original = setup_service._LEARNING_SEED_PATH
    setup_service._LEARNING_SEED_PATH = bundle
    try:
        with factory() as session:
            setup_service._auto_seed_learning(session)
            session.commit()
            slugs = set(session.scalars(select(LearningResource.slug)))
    finally:
        setup_service._LEARNING_SEED_PATH = original

    # The row after the bad one still lands.
    assert slugs == {"first", "last"}


def test_audience_matching_does_not_fire_on_substrings() -> None:
    """A short audience id must not score against an unrelated longer word."""

    from chart.learning.service import _score
    from chart.shared.db.models import LearningResource

    resource = LearningResource(
        id=99,
        slug="s",
        url="u",
        canonical_url="u",
        title="t",
        audience_summary="Team leadership and hospital directors",
        countries=[],
        languages=[],
        tracks=[],
        tags=[],
        health_outcomes=[],
        sort_weight=0,
        kind="video",
    )

    scored, _ = _score(
        resource, countries=[], audience_id="lead", interested=[], watched=set()
    )
    unscored, _ = _score(
        resource, countries=[], audience_id=None, interested=[], watched=set()
    )

    # "lead" appears inside "leadership" but is not the audience.
    assert scored == unscored
