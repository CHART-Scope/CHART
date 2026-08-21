from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.auth.schemas import CurrentUserContext
from chart.climate.service import list_locations
from chart.model_registry.schemas import ModelReleaseSpec
from chart.model_registry.service import (
    get_active_model_mapping,
    register_model_release,
)
from chart.setup.model_configs import (
    DeployedModelConfig,
    configs_for_country,
    deployed_geography_ids_by_country,
)
from chart.setup.place_bootstrap import bootstrap_place_from_release
from chart.setup.schemas import BootstrapSetupInput, CompleteSetupInput
from chart.setup.service import SetupError, _claim_bootstrap, complete
from chart.setup.service import _validate_setup_geographies
from chart.setup.service import restore_deployed_models
from chart.shared.db.base import Base
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    ModelAreaMapping,
    ModelRelease,
    SetupStateRecord,
    UserGeographyScopeRecord,
)


def test_review_model_requires_explicit_local_enablement(monkeypatch) -> None:
    monkeypatch.delenv("CHART_ENABLE_REVIEW_MODELS", raising=False)
    assert configs_for_country("KE") == ()

    monkeypatch.setenv("CHART_ENABLE_REVIEW_MODELS", "true")
    assert len(configs_for_country("KE")) == 1
    kenya_ids = deployed_geography_ids_by_country()["KE"]
    assert len(kenya_ids) == 48
    assert "geo-ke" in kenya_ids
    assert "geo-ke-turkana" in kenya_ids
    assert all("kajiado-central" not in item for item in kenya_ids)


def test_startup_restore_is_non_destructive_and_warms_completed_setup() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        session.add(
            SetupStateRecord(
                id="default",
                completed=True,
                phase="complete",
                country_code="IN",
            )
        )
        session.commit()

    fake_configs = (
        DeployedModelConfig(
            country_code="IN",
            model_release=Path("/dev/null"),
        ),
        DeployedModelConfig(
            country_code="KE",
            model_release=Path("/dev/null"),
        ),
    )
    with (
        patch("chart.setup.service._auto_seed_deployed_models") as seed,
        patch("chart.setup.service.deployed_configs", return_value=fake_configs),
    ):
        result = restore_deployed_models(session_factory=factory)

    # Sync fans out to every country discovered on disk — not only the setup
    # country — so a newly-dropped Kenya manifest lights up alongside India.
    assert [call.args[1] for call in seed.call_args_list] == ["IN", "KE"]
    assert result.activeReleaseIds == []
    assert result.assignmentCount == 0
    with factory() as session:
        state = session.get(SetupStateRecord, "default")
        assert state is not None
        assert state.completed is True
        assert state.phase == "complete"


def test_failed_bootstrap_can_be_retried_with_changed_details() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        session.add(
            SetupStateRecord(
                id="default",
                phase="failed",
                provisioning_token="old-operation",
                provisioning_request_hash="old-payload",
                last_error_code="SETUP_MODEL_PREPARATION_FAILED",
            )
        )
        session.commit()

    request = BootstrapSetupInput.model_validate(
        {
            "countryCode": "KE",
            "countryName": "Kenya",
            "geographyLevelLabel": "County",
            "primarySectorId": "health",
            "admin": {
                "name": "New Administrator",
                "email": "new-admin@example.org",
                "username": "new-admin@example.org",
                "password": "new-password",
            },
        }
    )
    operation_id = _claim_bootstrap(request, factory)

    assert operation_id != "old-operation"
    with factory() as session:
        state = session.get(SetupStateRecord, "default")
        assert state is not None
        assert state.phase == "provisioning"
        assert state.provisioning_token == operation_id
        assert state.provisioning_request_hash != "old-payload"
        assert state.last_error_code is None


def test_mp_manifest_still_builds_state_and_division_hierarchy() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        result = bootstrap_place_from_release(
            session,
            model_release_path=Path(
                "pipelines/models/lbw/model-release.mp.compact.review.json"
            ),
            activate=True,
        )
        session.flush()
        assert result.areas_seeded == 11
        state = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "madhya-pradesh")
        )
        assert state is not None
        assert state.app_geography_id == "geo-in-madhya-pradesh"
        state_mapping = get_active_model_mapping(session, admin_unit_id=state.id)
        assert state_mapping is not None
        assert state_mapping.model_area_name == "Madhya Pradesh"
        assert state_mapping.validated_pregnancy_windows == (1,)
        divisions = list(
            session.scalars(select(AdminUnit).where(AdminUnit.level == "division"))
        )
        assert len(divisions) == 10
        assert all(unit.app_geography_id is not None for unit in divisions)


def test_mp_under_five_manifest_has_division_models_but_no_state_model() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        result = bootstrap_place_from_release(
            session,
            model_release_path=Path(
                "pipelines/models/under_five_mortality/model-release.mp.review.json"
            ),
            activate=True,
        )
        session.flush()

        assert result.areas_seeded == 11
        state = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "madhya-pradesh")
        )
        assert state is not None
        assert (
            get_active_model_mapping(
                session,
                admin_unit_id=state.id,
                outcome="under_5_mortality",
            )
            is None
        )

        divisions = list(
            session.scalars(select(AdminUnit).where(AdminUnit.level == "division"))
        )
        assert len(divisions) == 10
        for division in divisions:
            mapping = get_active_model_mapping(
                session,
                admin_unit_id=division.id,
                outcome="under_5_mortality",
            )
            assert mapping is not None
            assert mapping.outcome == "under_5_mortality"
            assert mapping.validated_pregnancy_windows == ()


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
        assert mapping.release_id == "lbw-ke-climate-zone-0.2.1-review"
        assert mapping.model_area_name == "South-eastern"
        assert mapping.validated_pregnancy_windows == (1, 2, 3)
        assert result.model_status == "active"
        assert result.areas_seeded == 47
        counties = list(
            session.scalars(select(AdminUnit).where(AdminUnit.level == "county"))
        )
        assert len(counties) == 47
        turkana = next(item for item in counties if item.code == "turkana")
        assert get_active_model_mapping(session, admin_unit_id=turkana.id) is None


def test_new_kenya_release_replaces_an_existing_review_release() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    manifest_path = Path("pipelines/models/lbw/model-release.kenya.review.json")

    with factory() as session:
        bootstrap_place_from_release(
            session,
            model_release_path=manifest_path,
            activate=False,
        )
        current = ModelReleaseSpec.model_validate(
            json.loads(manifest_path.read_text(encoding="utf-8"))
        )
        old = current.model_copy(
            update={
                "id": "lbw-ke-climate-zone-0.1.1-review",
                "version": "0.1.1-review",
                "input_contract": {
                    key: value
                    for key, value in (current.input_contract or {}).items()
                    if key != "supersedes_release_ids"
                },
            }
        )
        register_model_release(session, old, activate=False)
        session.flush()
        register_model_release(session, old, activate=True)
        session.flush()

        kajiado = session.scalar(select(AdminUnit).where(AdminUnit.code == "kajiado"))
        assert kajiado is not None
        stale = AdminUnit(
            geography_id=kajiado.geography_id,
            code="kajiado-central",
            name="Kajiado Central",
            level="sub-county",
        )
        session.add(stale)
        session.flush()
        session.add(
            ModelAreaMapping(
                model_release_id=old.id,
                admin_unit_id=stale.id,
                model_area_key="South-eastern",
                model_file=old.model_files[0].filename,
                validated_pregnancy_windows=[1, 2, 3],
            )
        )
        session.add(
            ActiveModelAssignment(
                admin_unit_id=stale.id,
                module=old.module,
                outcome=old.outcome,
                model_release_id=old.id,
                activated_at=datetime.now(timezone.utc),
            )
        )
        session.flush()

        result = bootstrap_place_from_release(
            session,
            model_release_path=manifest_path,
            activate=True,
        )
        session.flush()

        mapping = get_active_model_mapping(session, admin_unit_id=kajiado.id)
        assert mapping is not None
        assert mapping.release_id == "lbw-ke-climate-zone-0.2.1-review"
        assert result.model_release_id == mapping.release_id
        assert get_active_model_mapping(session, admin_unit_id=stale.id) is None
        assert (
            session.get(
                ActiveModelAssignment,
                (stale.id, old.module, old.outcome),
            )
            is None
        )
        assert session.get(ModelRelease, old.id).status == "superseded"


def test_kenya_onboarding_warms_and_activates_kajiado(monkeypatch) -> None:
    monkeypatch.setenv("CHART_ENABLE_REVIEW_MODELS", "true")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        session.add(
            SetupStateRecord(
                id="default",
                phase="provisioning",
                provisioning_token="setup-token",
            )
        )
        session.commit()
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
                    "sortOrder": 100,
                },
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

    with patch("chart.setup.service.prepare_model_release") as warm:
        status = complete(
            setup,
            user,
            session_factory=factory,
            provisioning_token="setup-token",
        )

    assert status.completed is True
    assert [call.args[0].id for call in warm.call_args_list] == [
        "lbw-ke-climate-zone-0.2.1-review",
        "lbw-mp-1.0.1-compact-review",
        "under5-mortality-mp-0.1.0-review",
    ]
    with factory() as session:
        scopes = list(session.scalars(select(UserGeographyScopeRecord)))
        assert [scope.geography_id for scope in scopes] == ["geo-ke"]
        admin_unit = session.scalar(
            select(AdminUnit).where(AdminUnit.code == "kajiado")
        )
        assert admin_unit is not None
        mapping = get_active_model_mapping(session, admin_unit_id=admin_unit.id)
        assert mapping is not None
        assert mapping.model_area_name == "South-eastern"
    locations = list_locations(session_factory=factory)
    assert len(locations.items) == 58
    assert sum(item.supports_prediction for item in locations.items) == 57
    kajiado = next(
        item for item in locations.items if item.geography_id == "geo-ke-kajiado"
    )
    assert kajiado.model_area_name == "South-eastern"
    turkana = next(
        item for item in locations.items if item.geography_id == "geo-ke-turkana"
    )
    assert turkana.supports_prediction is False
    assert turkana.model_area_name is None
    with factory() as session:
        children = list(
            session.scalars(select(AdminUnit).where(AdminUnit.level == "sub-county"))
        )
        assert children == []


def test_kenya_onboarding_rejects_county_without_model_mapping(monkeypatch) -> None:
    monkeypatch.setenv("CHART_ENABLE_REVIEW_MODELS", "true")
    setup = CompleteSetupInput.model_validate(
        {
            "countryCode": "KE",
            "countryName": "Kenya",
            "geographyLevelLabel": "County",
            "primarySectorId": "health",
            "geographies": [
                {
                    "id": "geo-ke-turkana",
                    "level": "geo_level_1",
                    "levelLabel": "County",
                    "name": "Turkana",
                    "parentId": "geo-ke",
                    "path": "/kenya/turkana",
                    "sortOrder": 430,
                }
            ],
        }
    )

    with pytest.raises(SetupError) as caught:
        _validate_setup_geographies(setup)

    assert caught.value.code == "SETUP_GEOGRAPHY_MODEL_UNAVAILABLE"


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
                    "parentId": "geo-ke",
                    "path": "/kenya/kajiado",
                    "sortOrder": 100,
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
            "chart.setup.service.prepare_model_release",
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
