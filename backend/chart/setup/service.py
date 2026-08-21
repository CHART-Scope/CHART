from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import cast

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from chart.auth.schemas import CurrentUserContext
from chart.identity import IdentityError, delete_user, upsert_user
from chart.model_registry.runtime import prepare_model_release
from chart.model_registry.schemas import (
    GeographyPlaceSpec,
    ModelReleaseSpec,
    ReleaseGeographySpec,
)
from chart.model_registry.place_sets import resolve_release_places
from chart.model_registry.service import ModelRegistryError, activate_release
from chart.shared.db.models import (
    ActiveModelAssignment,
    AdminUnit,
    AppGeography,
    AppUser,
    AuditEventRecord,
    ClimateInputMonthRecord,
    ClimateInputWindowRecord,
    ClimateRun,
    CountryGeoConfig,
    Covariate,
    DistrictClimate,
    Geography,
    HealthImpact,
    IngestionLeaseRecord,
    ModelAreaMapping,
    ModelRelease,
    PredictionRequestRecord,
    RecommendedAction,
    SetupStateRecord,
    UserGeographyScopeRecord,
    UserRoleRecord,
    WorkspaceMemberRecord,
    WorkspaceRecord,
)
from chart.shared.db.session import get_session_factory
from chart.solution_repository.routes import SNAPSHOT_PATH as _SOLUTION_SEED_PATH

from .model_configs import configs_for_country, deployed_configs
from .place_bootstrap import (
    PlaceBootstrapError,
    bootstrap_place_from_release,
)
from .schemas import (
    BootstrapAdminResponse,
    BootstrapSetupInput,
    BootstrapSetupResponse,
    CompleteSetupInput,
    SectorOption,
    SetupCounts,
    SetupOptions,
    SetupCountryOption,
    SetupLevelOption,
    SetupModelMappingOption,
    SetupPlaceOption,
    SetupStatus,
    ModelSyncResponse,
)

logger = logging.getLogger(__name__)

SETUP_ID = "default"
SETUP_SECTORS = (
    SectorOption(id="health", label="Health"),
    SectorOption(id="environment", label="Environment & climate change"),
    SectorOption(id="animal-health", label="Animal health"),
    SectorOption(id="agriculture", label="Agriculture"),
    SectorOption(id="disaster", label="Disaster management"),
    SectorOption(id="urban", label="Urban planning"),
    SectorOption(id="water", label="Water and sanitation"),
    SectorOption(id="energy", label="Energy"),
    SectorOption(id="social", label="Social Services"),
    SectorOption(id="other", label="Other"),
)


class SetupError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def get_status(*, session_factory=None) -> SetupStatus:
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID)
        geography_count = (
            session.scalar(select(func.count()).select_from(AppGeography)) or 0
        )
        member_count = (
            session.scalar(select(func.count()).select_from(WorkspaceMemberRecord)) or 0
        )
        complete = bool(state and state.completed and geography_count and member_count)
        return SetupStatus(
            completed=complete,
            requiresOnboarding=not complete,
            phase=state.phase if state else "uninitialized",
            countryCode=state.country_code if state else None,
            countryName=state.country_name if state else None,
            rootGeographyId=state.root_geography_id if state else None,
            firstAdminUserId=state.first_admin_user_id if state else None,
            primarySectorId=state.primary_sector_id if state else None,
            collaboratingSectorIds=(state.collaborating_sector_ids if state else []),
            counts=SetupCounts(
                geographies=int(geography_count), workspaceMembers=int(member_count)
            ),
        )


def get_options() -> SetupOptions:
    country_metadata: dict[str, tuple[str, str, str]] = {}
    country_levels: dict[str, dict[str, SetupLevelOption]] = {}
    country_places: dict[str, dict[str, SetupPlaceOption]] = {}
    supported_codes: dict[str, set[str]] = {}
    model_mappings: dict[
        str, dict[str, dict[tuple[str, str, str], SetupModelMappingOption]]
    ] = {}
    for config in deployed_configs():
        spec = ModelReleaseSpec.model_validate_json(
            config.model_release.read_text(encoding="utf-8")
        )
        geography = resolve_release_places(spec).geography
        country_code = geography.country_code
        metadata = (
            geography.country_name,
            geography.root_id,
            geography.root_path,
        )
        existing_metadata = country_metadata.setdefault(country_code, metadata)
        if existing_metadata != metadata:
            raise ValueError("MODEL_RELEASE_SETUP_COUNTRY_CONFLICT")

        levels = country_levels.setdefault(country_code, {})
        for level in geography.levels:
            option = SetupLevelOption(
                key=level.key,
                label=level.label,
                sortOrder=level.sort_order,
            )
            existing_level = levels.setdefault(level.key, option)
            if existing_level != option:
                raise ValueError("MODEL_RELEASE_SETUP_LEVEL_CONFLICT")

        places = country_places.setdefault(country_code, {})
        for place in geography.places:
            place_option = SetupPlaceOption(
                placeCode=place.place_code,
                id=cast(str, place.geography_id),
                name=cast(str, place.display_name),
                level=cast(str, place.app_level),
                levelLabel=cast(str, place.level_label),
                parentPlaceCode=place.parent_place_code,
                path=cast(str, place.path),
                sortOrder=place.sort_order,
                predictionSupported=False,
            )
            existing_place = places.setdefault(place.place_code, place_option)
            if existing_place != place_option:
                raise ValueError("MODEL_RELEASE_SETUP_PLACE_CONFLICT")
        supported_codes.setdefault(country_code, set()).update(
            model_area.place_code for model_area in spec.areas
        )
        mappings_by_place = model_mappings.setdefault(country_code, {})
        for model_area in spec.areas:
            presentation = spec.presentation
            mapping = SetupModelMappingOption(
                releaseId=spec.id,
                outcome=spec.outcome,
                outcomeLabel=(
                    presentation.outcome_label
                    if presentation is not None
                    else spec.outcome.replace("_", " ").capitalize()
                ),
                modelAreaName=model_area.model_area_name,
                modelScopeLabel=(
                    presentation.model_scope_label
                    if presentation is not None
                    else "model"
                ),
            )
            mappings_by_place.setdefault(model_area.place_code, {})[
                (spec.outcome, model_area.model_area_name, spec.id)
            ] = mapping

    countries: list[SetupCountryOption] = []
    for country_code, metadata in country_metadata.items():
        all_places = country_places[country_code]
        included_codes = set(supported_codes.get(country_code, set()))
        for place_code in tuple(included_codes):
            visible_place: SetupPlaceOption | None = all_places.get(place_code)
            while (
                visible_place is not None and visible_place.parentPlaceCode is not None
            ):
                included_codes.add(visible_place.parentPlaceCode)
                visible_place = all_places.get(visible_place.parentPlaceCode)
        visible_places = [
            place.model_copy(
                update={
                    "predictionSupported": place.placeCode
                    in supported_codes.get(country_code, set()),
                    "modelMappings": sorted(
                        model_mappings.get(country_code, {})
                        .get(place.placeCode, {})
                        .values(),
                        key=lambda mapping: (
                            mapping.outcomeLabel,
                            mapping.modelAreaName,
                            mapping.releaseId,
                        ),
                    ),
                }
            )
            for place in all_places.values()
            if place.placeCode in included_codes
        ]
        visible_level_keys = {place.level for place in visible_places}
        countries.append(
            SetupCountryOption(
                countryCode=country_code,
                countryName=metadata[0],
                rootId=metadata[1],
                rootPath=metadata[2],
                levels=sorted(
                    (
                        level
                        for level in country_levels[country_code].values()
                        if level.key in visible_level_keys
                    ),
                    key=lambda level: (level.sortOrder, level.label),
                ),
                places=sorted(
                    visible_places,
                    key=lambda place: (place.sortOrder, place.name),
                ),
            )
        )
    return SetupOptions(
        sectors=list(SETUP_SECTORS),
        geographies=sorted(countries, key=lambda country: country.countryName),
    )


def bootstrap(
    input_data: BootstrapSetupInput, *, session_factory=None
) -> BootstrapSetupResponse:
    release_geography = _validate_setup_geographies(input_data)
    session_factory = session_factory or get_session_factory()
    operation_id = _claim_bootstrap(input_data, session_factory)
    paths = [release_geography.root_path]
    selected_path = (
        input_data.geographies[-1].path
        if input_data.geographies
        else release_geography.root_path
    )
    try:
        identity = upsert_user(
            name=input_data.admin.name.strip(),
            email=input_data.admin.email.strip().lower(),
            username=input_data.admin.username.strip().lower(),
            password=input_data.admin.password,
            roles=["chart_admin", "content_editor"],
            group_paths=list(dict.fromkeys(paths)),
            operation_id=operation_id,
        )
    except IdentityError as error:
        setup_code = (
            "SETUP_" + error.code[len("USER_") :]
            if error.code.startswith("USER_")
            else error.code
        )
        _mark_bootstrap_failed(operation_id, setup_code, session_factory)
        raise SetupError(setup_code, error.status_code) from error
    user = CurrentUserContext(
        userId=identity.user_id,
        username=identity.username,
        email=identity.email,
        roles=["chart_admin", "content_editor"],
        geographyScopes=paths,
        activeGeographyId=selected_path,
        geographyLevel=(
            input_data.geographies[0].level if input_data.geographies else "country"
        ),
    )
    try:
        result = complete(
            input_data,
            user,
            session_factory=session_factory,
            provisioning_token=operation_id,
        )
    except Exception as error:
        _mark_bootstrap_failed(
            operation_id,
            getattr(error, "code", type(error).__name__),
            session_factory,
        )
        _rollback_provisioned_identity(identity.user_id, session_factory)
        raise
    return BootstrapSetupResponse(
        setup=result,
        admin=BootstrapAdminResponse(
            userId=identity.user_id,
            username=identity.username,
            email=identity.email,
        ),
    )


def _auto_seed_recommended_actions(session) -> None:
    """Upsert the bundled solution repository into ``recommended_action``.

    Idempotent on ``slug``. Best-effort: a broken bundle logs a warning
    but does not fail setup. Later, a scheduler or an external API will
    refresh the same rows; the natural key stays valid across sources.
    """

    try:
        raw = json.loads(_SOLUTION_SEED_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.exception(
            "auto_seed: could not read %s; recommended_action left empty",
            _SOLUTION_SEED_PATH,
        )
        return

    items = raw.get("items") or []
    if not items:
        logger.warning("auto_seed: solution seed has no items, skipping")
        return

    now = datetime.now(timezone.utc)
    upserts = 0
    for item in items:
        slug = str(item.get("slug") or "").strip()
        title = str(item.get("title") or "").strip()
        description = str(item.get("description") or "").strip()
        if not slug or not title:
            continue
        existing = session.scalar(
            select(RecommendedAction).where(RecommendedAction.slug == slug)
        )
        if existing is None:
            session.add(
                RecommendedAction(
                    slug=slug,
                    source_record_id=item.get("sourceRecordId"),
                    title=title,
                    description=description,
                    climate_hazards=list(item.get("climateHazards") or []),
                    solution_types=list(item.get("solutionTypes") or []),
                    cost_of_implementation=item.get("costOfImplementation"),
                    useful_links=list(item.get("usefulLinks") or []),
                    case_studies=list(item.get("caseStudies") or []),
                    source="seed",
                    synced_at=now,
                )
            )
        else:
            existing.source_record_id = item.get("sourceRecordId")
            existing.title = title
            existing.description = description
            existing.climate_hazards = list(item.get("climateHazards") or [])
            existing.solution_types = list(item.get("solutionTypes") or [])
            existing.cost_of_implementation = item.get("costOfImplementation")
            existing.useful_links = list(item.get("usefulLinks") or [])
            existing.case_studies = list(item.get("caseStudies") or [])
            existing.source = "seed"
            existing.synced_at = now
        upserts += 1
    logger.warning("auto_seed: recommended_action upserts=%d", upserts)


def _auto_seed_deployed_models(
    session, country_code: str, *, purge_stale: bool = False
) -> None:
    """Seed deployable model releases for the selected country.

    Setup previously registered every discovered manifest regardless of the
    admin's country choice, which meant selecting India would still try to
    install (and roll back on) Kenya's release. Auto-seed now scopes to the
    selected country so an operator can succeed with just the models that
    match the country they picked, and other countries can still be brought
    in later via ``/setup/models/sync``.

    Preparation remains mandatory for every seeded release: setup rolls back
    on a missing, invalid, or unwarmable artifact rather than completing
    with a partial model catalog for the chosen country.
    """

    normalized_country = (country_code or "").strip().upper()
    logger.warning("auto_seed: start selected_country=%s", normalized_country)
    configs = configs_for_country(normalized_country) if normalized_country else ()
    if not configs:
        logger.warning(
            "auto_seed: no deployable model manifests for country=%s, skipping",
            normalized_country or "<unset>",
        )
        return
    for config in configs:
        logger.warning(
            "auto_seed: seeding from release=%s",
            config.model_release,
        )
        try:
            # Setup is a clean-install flow, so proactively purge any prior
            # copy of this release before re-registering. Without this,
            # ``register_model_release`` refuses to touch an existing row
            # that differs from the incoming spec in any immutable field,
            # and that check keeps tripping MODEL_RELEASE_IMMUTABLE on a
            # rerun after a partial install left a stale row (or after
            # startup restore re-registered it). PredictionRequest has a
            # plain FK to model_release; ModelAreaMapping and
            # ActiveModelAssignment cascade but we clear them explicitly to
            # keep delete order engine-agnostic.
            #
            # The sync path (``restore_deployed_models``) passes
            # ``purge_stale=False``: sync is meant to be non-destructive, so
            # a matching row should be tolerated and a differing row is a
            # real conflict that must surface.
            if purge_stale:
                preflight_spec = ModelReleaseSpec.model_validate(
                    json.loads(config.model_release.read_text(encoding="utf-8"))
                )
                stale = session.get(ModelRelease, preflight_spec.id)
                if stale is not None:
                    logger.warning(
                        "auto_seed: purging stale release %s before re-register",
                        preflight_spec.id,
                    )
                    session.execute(
                        delete(PredictionRequestRecord).where(
                            PredictionRequestRecord.model_release_id
                            == preflight_spec.id
                        )
                    )
                    session.execute(
                        delete(ActiveModelAssignment).where(
                            ActiveModelAssignment.model_release_id == preflight_spec.id
                        )
                    )
                    session.execute(
                        delete(ModelAreaMapping).where(
                            ModelAreaMapping.model_release_id == preflight_spec.id
                        )
                    )
                    session.delete(stale)
                    session.flush()
            result = bootstrap_place_from_release(
                session,
                model_release_path=config.model_release,
                boundary_artifact_path=config.boundary_artifact,
                activate=False,
            )
            spec = ModelReleaseSpec.model_validate(
                json.loads(config.model_release.read_text(encoding="utf-8"))
            )
            prepare_model_release(spec)
            release = session.get(ModelRelease, result.model_release_id)
            if release is None:
                raise RuntimeError("registered model release disappeared")
            release.status = "validated"
            activate_release(session, release)
            session.flush()
            logger.warning(
                "auto_seed: success — areas=%d release=%s status=%s",
                result.areas_seeded,
                result.model_release_id,
                release.status,
            )
        except (PlaceBootstrapError, ModelRegistryError) as error:
            logger.exception(
                "auto_seed: model preparation failed for %s",
                config.country_code,
            )
            raise SetupError("SETUP_MODEL_PREPARATION_FAILED", 503) from error
        except Exception as error:  # noqa: BLE001 - map to stable setup error
            logger.exception(
                "auto_seed: unexpected model preparation failure for %s",
                config.country_code,
            )
            raise SetupError("SETUP_MODEL_PREPARATION_FAILED", 503) from error


def complete(
    input_data: CompleteSetupInput,
    user: CurrentUserContext,
    *,
    session_factory=None,
    provisioning_token: str | None = None,
) -> SetupStatus:
    if "chart_admin" not in user.roles:
        raise SetupError("SETUP_FORBIDDEN", 403)
    primary_sector_id, collaborating_sector_ids = _selected_sectors(
        input_data.primarySectorId,
        input_data.collaboratingSectorIds,
    )
    release_geography = _validate_setup_geographies(input_data)
    country_code = input_data.countryCode.strip().upper()
    root_id = release_geography.root_id
    root_path = release_geography.root_path
    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID, with_for_update=True)
        if state is None:
            state = SetupStateRecord(id=SETUP_ID)
            session.add(state)
            session.flush()
        if provisioning_token is not None:
            if (
                state.phase != "provisioning"
                or state.provisioning_token != provisioning_token
            ):
                raise SetupError("SETUP_PROVISIONING_LOST", 409)
        elif state.phase == "provisioning":
            raise SetupError("SETUP_BOOTSTRAP_IN_PROGRESS", 409)

        labels = {"country": "Country", "geo_level_1": input_data.geographyLevelLabel}
        labels.update({row.level: row.levelLabel for row in input_data.geographies})
        for index, (level, label) in enumerate(labels.items()):
            config = session.get(CountryGeoConfig, (country_code, level))
            if config is None:
                config = CountryGeoConfig(country_code=country_code, level_key=level)
                session.add(config)
            config.level_label = label
            config.enabled = True
            config.sort_order = index * 10
        session.flush()
        _upsert_place(
            session,
            root_id,
            country_code,
            "country",
            "Country",
            input_data.countryName.strip(),
            None,
            root_path,
            0,
        )
        level_order = {
            "country": 0,
            "geo_level_1": 1,
            "geo_level_2": 2,
            "geo_level_3": 3,
        }
        for row in sorted(
            input_data.geographies, key=lambda item: level_order[item.level]
        ):
            _upsert_place(
                session,
                row.id,
                country_code,
                row.level,
                row.levelLabel,
                row.name,
                row.parentId or root_id,
                row.path,
                row.sortOrder,
            )
        session.flush()
        # First-run administrators manage the installed country and may switch
        # among its model-backed areas. Later user assignments stay scoped to
        # their explicitly selected place.
        scopes = input_data.geographies[-1:] if input_data.geographies else []
        persisted_scope_ids = (
            [root_id]
            if provisioning_token is not None
            else [row.id for row in scopes] or [root_id]
        )
        _persist_user(
            session,
            user,
            persisted_scope_ids,
        )
        workspace_id = f"workspace-{country_code.lower()}-default"
        workspace = session.get(WorkspaceRecord, workspace_id)
        if workspace is None:
            workspace = WorkspaceRecord(id=workspace_id)
            session.add(workspace)
        workspace.name = f"{input_data.countryName.strip()} CHART setup"
        workspace.planning_cycle = str(__import__("datetime").date.today().year)
        workspace.status = "active"
        workspace.geography_id = scopes[-1].id if scopes else root_id
        workspace.created_by_user_id = user.user_id
        workspace.owner_user_id = user.user_id
        session.flush()
        member = session.scalar(
            select(WorkspaceMemberRecord).where(
                WorkspaceMemberRecord.workspace_id == workspace.id,
                WorkspaceMemberRecord.user_id == user.user_id,
            )
        )
        if member is None:
            session.add(
                WorkspaceMemberRecord(
                    id=f"member-{uuid.uuid4()}",
                    workspace_id=workspace.id,
                    user_id=user.user_id,
                    role="owner",
                )
            )
        _auto_seed_deployed_models(session, country_code, purge_stale=True)
        try:
            _auto_seed_recommended_actions(session)
        except Exception:  # noqa: BLE001 - best-effort, must not fail setup
            logger.exception(
                "auto_seed: recommended_action seed failed; setup will complete."
            )
        state.completed = True
        state.phase = "complete"
        state.provisioning_token = None
        state.provisioning_request_hash = None
        state.provisioning_started_at = None
        state.last_error_code = None
        state.country_code = country_code
        state.country_name = input_data.countryName.strip()
        state.root_geography_id = root_id
        state.first_admin_user_id = user.user_id
        state.first_admin_email = user.email
        state.primary_sector_id = primary_sector_id
        state.collaborating_sector_ids = collaborating_sector_ids
        state.selected_hazards = []
        session.commit()
    return get_status(session_factory=session_factory)


def sync_deployed_models(
    user: CurrentUserContext,
    *,
    session_factory=None,
) -> ModelSyncResponse:
    """Install newly deployed manifests without resetting user or workspace data."""

    if "chart_admin" not in user.roles:
        raise SetupError("SETUP_FORBIDDEN", 403)
    return restore_deployed_models(
        session_factory=session_factory, require_complete=True
    )


def restore_deployed_models(
    *,
    session_factory=None,
    require_complete: bool = False,
) -> ModelSyncResponse:
    """Reconcile manifests and warm artifacts after an application restart.

    This is the same non-destructive operation exposed to administrators by
    ``/setup/models/sync``. It never resets users, workspaces, geographies, or
    prediction history.
    """

    session_factory = session_factory or get_session_factory()
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID)
        if state is None or not state.completed:
            if require_complete:
                raise SetupError("SETUP_NOT_COMPLETE", 409)
            return ModelSyncResponse(activeReleaseIds=[], assignmentCount=0)
        # Setup picks a single country because first-run has to land somewhere,
        # but sync is the "install anything you can find" path: every manifest
        # under pipelines/models/ should come online regardless of which
        # country the operator originally set up. bootstrap_place_from_release
        # creates the geography + admin_units for a new country on demand.
        for country_code in sorted(
            {config.country_code for config in deployed_configs()}
        ):
            _auto_seed_deployed_models(session, country_code)
        active_release_ids = sorted(
            session.scalars(
                select(ActiveModelAssignment.model_release_id).distinct()
            ).all()
        )
        assignment_count = (
            session.scalar(select(func.count()).select_from(ActiveModelAssignment)) or 0
        )
        session.commit()
    return ModelSyncResponse(
        activeReleaseIds=active_release_ids,
        assignmentCount=int(assignment_count),
    )


def reset(user: CurrentUserContext) -> SetupStatus:
    if "chart_admin" not in user.roles:
        raise SetupError("SETUP_FORBIDDEN", 403)
    with get_session_factory()() as session:
        state = session.get(SetupStateRecord, SETUP_ID)
        first_admin_user_id = state.first_admin_user_id if state else None

        # Nuke everything a re-run of setup/bootstrap could collide with —
        # the previous reset only cleared workspace/user state and left the
        # model registry and its dependents behind, which is exactly what
        # tripped MODEL_RELEASE_IMMUTABLE on the second install. Order
        # respects the FK graph (children first). Country config, seed
        # reference tables (data_source, provenance), and RecommendedAction
        # (upserted every setup) are intentionally not touched.
        session.execute(delete(WorkspaceMemberRecord))
        session.execute(delete(WorkspaceRecord))
        session.execute(delete(HealthImpact))
        session.execute(delete(Covariate))
        session.execute(delete(AuditEventRecord))
        session.execute(delete(PredictionRequestRecord))
        session.execute(delete(IngestionLeaseRecord))
        session.execute(delete(DistrictClimate))
        session.execute(delete(ClimateInputMonthRecord))
        session.execute(delete(ClimateInputWindowRecord))
        session.execute(delete(ClimateRun))
        session.execute(delete(ActiveModelAssignment))
        session.execute(delete(ModelAreaMapping))
        session.execute(delete(ModelRelease))
        session.execute(delete(AdminUnit))
        session.execute(delete(AppGeography))
        session.execute(delete(Geography))
        session.execute(delete(UserGeographyScopeRecord))
        session.execute(delete(UserRoleRecord))
        session.execute(delete(AppUser))

        if state is None:
            state = SetupStateRecord(id=SETUP_ID)
            session.add(state)
        state.completed = False
        state.phase = "uninitialized"
        state.provisioning_token = None
        state.provisioning_request_hash = None
        state.provisioning_started_at = None
        state.last_error_code = None
        state.first_admin_user_id = None
        state.first_admin_email = None
        state.primary_sector_id = None
        state.collaborating_sector_ids = []
        state.selected_hazards = []
        session.commit()

    if first_admin_user_id:
        try:
            delete_user(first_admin_user_id)
        except IdentityError:
            pass

    return get_status()


def _claim_bootstrap(input_data, session_factory) -> str:
    request_hash = hashlib.sha256(
        json.dumps(
            input_data.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    now = datetime.now(timezone.utc)

    with session_factory() as session:
        if session.get(SetupStateRecord, SETUP_ID) is None:
            session.add(SetupStateRecord(id=SETUP_ID))
            try:
                session.commit()
            except IntegrityError:
                session.rollback()

    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID, with_for_update=True)
        assert state is not None
        member_count = (
            session.scalar(select(func.count()).select_from(WorkspaceMemberRecord)) or 0
        )
        if state.completed or member_count or state.phase == "requires_admin":
            raise SetupError("SETUP_BOOTSTRAP_LOCKED", 409)

        if state.phase == "provisioning":
            if state.provisioning_request_hash != request_hash:
                raise SetupError("SETUP_BOOTSTRAP_REQUEST_MISMATCH", 409)
            if (
                state.phase == "provisioning"
                and state.provisioning_started_at is not None
                and _aware(state.provisioning_started_at)
                + timedelta(
                    seconds=int(os.getenv("SETUP_PROVISIONING_TIMEOUT_SECONDS", "600"))
                )
                > now
            ):
                raise SetupError("SETUP_BOOTSTRAP_IN_PROGRESS", 409)
            operation_id = state.provisioning_token or secrets.token_hex(24)
        else:
            # A failed first-run attempt has already rolled back its database
            # and identity changes. It is safe to replace it with the latest
            # wizard payload; requiring an authenticated reset here creates a
            # dead end because no administrator exists yet.
            operation_id = secrets.token_hex(24)

        state.phase = "provisioning"
        state.provisioning_token = operation_id
        state.provisioning_request_hash = request_hash
        state.provisioning_started_at = now
        state.last_error_code = None
        session.commit()
        return operation_id


def _mark_bootstrap_failed(operation_id: str, error_code: str, session_factory) -> None:
    with session_factory() as session:
        state = session.get(SetupStateRecord, SETUP_ID, with_for_update=True)
        if state is None or state.completed or state.provisioning_token != operation_id:
            return
        state.phase = "failed"
        state.last_error_code = error_code[:128]
        session.commit()


def _rollback_provisioned_identity(user_id: str, session_factory) -> None:
    try:
        with session_factory() as session:
            session.execute(delete(AppUser).where(AppUser.id == user_id))
            session.commit()
    except Exception:
        pass
    try:
        delete_user(user_id)
    except IdentityError:
        pass


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _persist_user(session, user, geography_ids):
    record = session.get(AppUser, user.user_id)
    if record is None:
        record = AppUser(
            id=user.user_id, username=user.username, display_name=user.username
        )
        session.add(record)
    record.email = user.email
    record.status = "active"
    session.execute(
        delete(UserRoleRecord).where(UserRoleRecord.user_id == user.user_id)
    )
    session.execute(
        delete(UserGeographyScopeRecord).where(
            UserGeographyScopeRecord.user_id == user.user_id
        )
    )
    for role in user.roles:
        session.add(
            UserRoleRecord(user_id=user.user_id, role=role, source="onboarding")
        )
    for geography_id in geography_ids:
        geography = session.get(AppGeography, geography_id)
        if geography:
            session.add(
                UserGeographyScopeRecord(
                    id=f"user-geo-{uuid.uuid4()}",
                    user_id=user.user_id,
                    geography_id=geography_id,
                    source="onboarding",
                    external_group_path=geography.path,
                )
            )


def _upsert_place(session, place_id, country, level, label, name, parent, path, order):
    place = session.get(AppGeography, place_id)
    if place is None:
        place = AppGeography(id=place_id)
        session.add(place)
    place.country_code = country
    place.level = level
    place.level_label = label
    place.name = name
    place.parent_id = parent
    place.path = path
    place.sort_order = order


def _selected_sectors(
    primary_id: str, collaborating_ids: list[str]
) -> tuple[str, list[str]]:
    options = {item.id for item in SETUP_SECTORS}
    if primary_id not in options:
        code = "SETUP_SECTOR_REQUIRED" if not primary_id else "SETUP_SECTOR_INVALID"
        raise SetupError(code, 400)
    unique_collaborators = list(dict.fromkeys(collaborating_ids))
    if any(item not in options for item in unique_collaborators):
        raise SetupError("SETUP_SECTOR_INVALID", 400)
    return primary_id, [item for item in unique_collaborators if item != primary_id]


def _validate_setup_geographies(
    input_data: CompleteSetupInput,
) -> ReleaseGeographySpec:
    """Reject geography payloads that are not declared by a deployed manifest."""

    declared: dict[str, GeographyPlaceSpec] = {}
    declared_by_code: dict[str, GeographyPlaceSpec] = {}
    country_name: str | None = None
    root_id: str | None = None
    release_geography: ReleaseGeographySpec | None = None
    supported_place_codes: set[str] = set()
    for config in configs_for_country(input_data.countryCode):
        spec = ModelReleaseSpec.model_validate_json(
            config.model_release.read_text(encoding="utf-8")
        )
        geography = resolve_release_places(spec).geography
        if country_name is not None and (
            country_name != geography.country_name or root_id != geography.root_id
        ):
            raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
        country_name = geography.country_name
        root_id = geography.root_id
        release_geography = geography
        for place in geography.places:
            place_id = cast(str, place.geography_id)
            existing_id = declared.get(place_id)
            existing_code = declared_by_code.get(place.place_code)
            if (
                existing_id is not None
                and existing_id != place
                or existing_code is not None
                and existing_code != place
            ):
                raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
            declared[place_id] = place
            declared_by_code[place.place_code] = place
        supported_place_codes.update(model_area.place_code for model_area in spec.areas)
    if (
        not declared
        or country_name != input_data.countryName
        or not input_data.geographies
    ):
        raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
    for row in input_data.geographies:
        declared_place = declared.get(row.id)
        if declared_place is None or (
            row.name != declared_place.display_name
            or row.level != declared_place.app_level
            or row.levelLabel != declared_place.level_label
            or row.path != declared_place.path
            or row.sortOrder != declared_place.sort_order
        ):
            raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
        expected_parent = (
            declared_by_code[declared_place.parent_place_code].geography_id
            if declared_place.parent_place_code
            else root_id
        )
        if row.parentId != expected_parent:
            raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
    selected = declared[input_data.geographies[-1].id]
    if selected.place_code not in supported_place_codes:
        raise SetupError("SETUP_GEOGRAPHY_MODEL_UNAVAILABLE", 400)

    expected_chain = [selected]
    parent_code = selected.parent_place_code
    while parent_code is not None:
        parent = declared_by_code[parent_code]
        expected_chain.insert(0, parent)
        parent_code = parent.parent_place_code
    if [row.id for row in input_data.geographies] != [
        area.geography_id for area in expected_chain
    ]:
        raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
    if input_data.geographyLevelLabel != expected_chain[0].level_label:
        raise SetupError("SETUP_GEOGRAPHY_INVALID", 400)
    assert release_geography is not None
    return release_geography
