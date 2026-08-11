from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.model_registry.service import get_active_model_mapping
from chart.auth.schemas import CurrentUserContext
from chart.climate.service import list_locations
from chart.setup.place_bootstrap import bootstrap_place_from_release
from chart.setup.model_configs import configs_for_country
from chart.setup.schemas import CompleteSetupInput
from chart.setup.service import SetupError, complete
from chart.shared.db.base import Base
from chart.shared.db.models import AdminUnit, AppGeography


def test_review_model_requires_explicit_local_enablement(monkeypatch) -> None:
    monkeypatch.delenv("CHART_ENABLE_REVIEW_MODELS", raising=False)
    assert configs_for_country("KE") == ()

    monkeypatch.setenv("CHART_ENABLE_REVIEW_MODELS", "true")
    assert len(configs_for_country("KE")) == 1


def test_kenya_release_links_kajiado_and_activates() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        session.add_all(
            [
                AppGeography(
                    id="geo-ke",
                    country_code="KE",
                    level="country",
                    level_label="Country",
                    name="Kenya",
                    path="/kenya",
                    sort_order=0,
                ),
                AppGeography(
                    id="geo-ke-kajiado",
                    country_code="KE",
                    level="geo_level_1",
                    level_label="County",
                    name="Kajiado",
                    parent_id="geo-ke",
                    path="/kenya/kajiado",
                    sort_order=10,
                ),
            ]
        )
        session.flush()

        result = bootstrap_place_from_release(
            session,
            model_release_path=Path(
                "pipelines/models/lbw/model-release.kenya.review.json"
            ),
            activate=True,
        )
        session.flush()
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "kajiado")
        )
        assert admin_unit is not None
        assert admin_unit.name == "Kajiado"
        assert admin_unit.app_geography_id == "geo-ke-kajiado"
        mapping = get_active_model_mapping(session, admin_unit_id=admin_unit.id)
        assert mapping is not None
        assert mapping.release_id == "lbw-ke-climate-zone-0.1.0-review"
        assert mapping.model_area_name == "South-eastern"
        assert mapping.validated_pregnancy_windows == (1, 2, 3)
        assert result.model_status == "active"


def test_kenya_onboarding_warms_and_activates_kajiado(monkeypatch) -> None:
    monkeypatch.setenv("CHART_ENABLE_REVIEW_MODELS", "true")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    setup = CompleteSetupInput.model_validate(
        {
            "countryCode": "KE",
            "countryName": "Kenya",
            "geographyLevelLabel": "County",
            "primarySectorId": "health",
            "collaboratingSectorIds": ["environment"],
            "geographies": [
                {
                    "id": "geo-ke-kajiado",
                    "level": "geo_level_1",
                    "levelLabel": "County",
                    "name": "Kajiado",
                    "parentId": "geo-ke",
                    "path": "/kenya/kajiado",
                    "sortOrder": 10,
                }
            ],
        }
    )
    user = CurrentUserContext(
        user_id="kenya-admin",
        username="kenya-admin",
        email="kenya-admin@example.org",
        roles=["chart_admin"],
        geography_scopes=["/kenya/kajiado"],
    )

    with patch("chart.setup.service.warm_model_release") as warm:
        status = complete(setup, user, session_factory=factory)

    assert status.completed is True
    warm.assert_called_once()
    assert warm.call_args.args[0].id == "lbw-ke-climate-zone-0.1.0-review"
    with factory() as session:
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "kajiado")
        )
        assert admin_unit is not None
        mapping = get_active_model_mapping(session, admin_unit_id=admin_unit.id)
        assert mapping is not None
        assert mapping.model_area_name == "South-eastern"
    locations = list_locations(session_factory=factory)
    assert [(item.geography_id, item.name) for item in locations.items] == [
        ("geo-ke-kajiado", "Kajiado")
    ]
    assert locations.items[0].supports_prediction is True


def test_kenya_onboarding_fails_instead_of_activating_an_unwarmed_model(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CHART_ENABLE_REVIEW_MODELS", "true")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    setup = CompleteSetupInput.model_validate(
        {
            "countryCode": "KE",
            "countryName": "Kenya",
            "geographyLevelLabel": "County",
            "primarySectorId": "health",
            "geographies": [
                {
                    "id": "geo-ke-kajiado",
                    "level": "geo_level_1",
                    "levelLabel": "County",
                    "name": "Kajiado",
                    "path": "/kenya/kajiado",
                }
            ],
        }
    )
    user = CurrentUserContext(
        user_id="kenya-admin",
        username="kenya-admin",
        roles=["chart_admin"],
        geography_scopes=["/kenya/kajiado"],
    )

    with (
        patch(
            "chart.setup.service.warm_model_release",
            side_effect=RuntimeError("runtime unavailable"),
        ),
        pytest.raises(SetupError) as caught,
    ):
        complete(setup, user, session_factory=factory)

    assert caught.value.code == "SETUP_MODEL_PREPARATION_FAILED"
    with factory() as session:
        assert (
            session.scalar(select(AdminUnit).where(AdminUnit.code == "kajiado")) is None
        )
