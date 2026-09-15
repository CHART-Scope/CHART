from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from chart.api.app import app
from chart.model_registry import routes as model_catalog_routes
from chart.setup.place_bootstrap import bootstrap_place_from_release
from chart.shared.db.base import Base
from chart.shared.db.models import ModelRelease


def test_parent_catalog_can_include_descendant_model_outcomes(monkeypatch) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with factory() as session:
        bootstrap_place_from_release(
            session,
            model_release_path=Path(
                "pipelines/models/lbw/model-release.mp.compact.review.json"
            ),
            activate=True,
        )
        bootstrap_place_from_release(
            session,
            model_release_path=Path(
                "pipelines/models/under_five_mortality/model-release.mp.review.json"
            ),
            activate=True,
        )
        session.commit()

    monkeypatch.setattr(model_catalog_routes, "get_session_factory", lambda: factory)
    client = TestClient(app)

    direct = client.get(
        "/model-catalog", params={"geography_id": "geo-in-madhya-pradesh"}
    )
    assert direct.status_code == 200
    assert {item["outcome"] for item in direct.json()["items"]} == {"lbw"}

    tree = client.get(
        "/model-catalog",
        params={
            "geography_id": "geo-in-madhya-pradesh",
            "include_descendants": "true",
        },
    )
    assert tree.status_code == 200
    items = {item["outcome"]: item for item in tree.json()["items"]}
    assert set(items) == {"lbw", "under_5_mortality"}
    assert items["under_5_mortality"]["health_domain_label"] == "Child health"
    assert items["under_5_mortality"]["outcome_label"] == "Under-five mortality"
    assert items["under_5_mortality"]["effect_measure"] == "odds_ratio"
    assert items["under_5_mortality"]["visualization_type"] == ("odds_ratio_icon_array")
    assert items["under_5_mortality"]["visualization_figure"] == "baby"
    assert items["lbw"]["visualization_figure"] == "mother-baby"


def test_manifest_can_revise_presentation_values_on_re_register() -> None:
    """Presentation is UI metadata — the manifest is source of truth, so a
    figure swap or editorial-reference addition should overlay onto the
    stored row without tripping MODEL_RELEASE_IMMUTABLE. Runtime and I/O
    contracts stay strictly immutable (tested elsewhere)."""

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    manifest = Path("pipelines/models/lbw/model-release.mp.compact.review.json")

    with factory() as session:
        bootstrap_place_from_release(
            session, model_release_path=manifest, activate=True
        )
        release = session.get(ModelRelease, "lbw-mp-1.0.1-compact-review")
        assert release is not None
        stale_spec = dict(release.input_spec)
        stale_presentation = dict(stale_spec["presentation"])
        stale_presentation["visualization"] = {
            "kind": "odds_ratio_icon_array",
            "figure": "newborn",
            "context_figure": "pregnant-woman",
        }
        stale_presentation.pop("editorial_reference_temperature_c", None)
        stale_spec["presentation"] = stale_presentation
        release.input_spec = stale_spec
        session.commit()

    with factory() as session:
        bootstrap_place_from_release(
            session, model_release_path=manifest, activate=True
        )
        release = session.get(ModelRelease, "lbw-mp-1.0.1-compact-review")
        assert release is not None
        presentation = release.input_spec["presentation"]
        assert presentation["visualization"]["figure"] == "mother-baby"
        assert presentation["editorial_reference_temperature_c"] == 27.0


def test_manifest_can_add_presentation_fields_without_changing_model_contract() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    manifest = Path("pipelines/models/lbw/model-release.mp.compact.review.json")

    with factory() as session:
        bootstrap_place_from_release(
            session,
            model_release_path=manifest,
            activate=True,
        )
        release = session.get(ModelRelease, "lbw-mp-1.0.1-compact-review")
        assert release is not None
        old_spec = dict(release.input_spec)
        old_presentation = dict(old_spec["presentation"])
        old_presentation.pop("visualization")
        old_presentation.pop("risk_description")
        old_spec["presentation"] = old_presentation
        release.input_spec = old_spec
        session.commit()

    with factory() as session:
        bootstrap_place_from_release(
            session,
            model_release_path=manifest,
            activate=True,
        )
        release = session.get(ModelRelease, "lbw-mp-1.0.1-compact-review")
        assert release is not None
        presentation = release.input_spec["presentation"]
        assert presentation["visualization"]["kind"] == "odds_ratio_icon_array"
        assert presentation["visualization"]["figure"] == "mother-baby"
        assert presentation["risk_description"]
