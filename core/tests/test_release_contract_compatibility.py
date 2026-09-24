"""What may change on an existing release id, and what may not.

A release id must always mean the same model, so the exposure vector's shape
is immutable. The prose around it is not — descriptions get reworded and
readiness flags flip when a modeller signs off. Comparing the stored contract
as a raw dict conflated the two, so typing the contract made every already
registered release fail to re-register.
"""

from __future__ import annotations

from chart.model_registry.service import (
    _input_spec_is_compatible,
    _merge_additive_presentation,
)

TYPED = {
    "input_contract": {
        "variables": [
            {
                "name": "tmax_lag",
                "length": 3,
                "unit": "Celsius",
                "interval": "month",
                "order": "newest_first",
                "description": "Three monthly means of daily maximum temperature",
            }
        ],
        "supersedes_release_ids": [],
    },
    "output_contract": {"effect_measure": "odds_ratio"},
    "runtime": {"adapter": "compact_r_registry"},
}


def _with_contract(**changes) -> dict:
    contract = dict(TYPED["input_contract"])
    variable = dict(contract["variables"][0])
    variable.update(changes)
    contract["variables"] = [variable]
    return {**TYPED, "input_contract": contract}


def test_legacy_contract_may_become_typed_when_arity_matches() -> None:
    """The migration this whole change depends on.

    The legacy pair could only express arity, so a typed contract declaring
    the same arity is the same contract stated precisely.
    """

    legacy = {
        **TYPED,
        "input_contract": {
            "temperature_input": "Three monthly means of daily maximum temperature",
            "months_required": 3,
        },
    }
    assert _input_spec_is_compatible(legacy, TYPED)


def test_legacy_contract_rejected_when_arity_differs() -> None:
    legacy = {
        **TYPED,
        "input_contract": {
            "temperature_input": "four daily maxima",
            "months_required": 4,
        },
    }
    assert not _input_spec_is_compatible(legacy, TYPED)


def test_description_may_be_reworded() -> None:
    assert _input_spec_is_compatible(
        _with_contract(description="Reworded entirely"), TYPED
    )


def test_missing_interval_defaults_to_month_and_stays_compatible() -> None:
    """Older rows predate the typed schema and have no interval stored."""

    stored = {**TYPED, "input_contract": dict(TYPED["input_contract"])}
    variable = {
        k: v
        for k, v in TYPED["input_contract"]["variables"][0].items()
        if k != "interval"
    }
    stored["input_contract"]["variables"] = [variable]
    assert _input_spec_is_compatible(stored, TYPED)


def test_readiness_flag_may_flip() -> None:
    """batch_status is a sign-off flag, not a property of the model."""

    blocked = {**TYPED, "input_contract": dict(TYPED["input_contract"])}
    blocked["input_contract"]["batch_status"] = "blocked_pending_modeller_confirmation"
    assert _input_spec_is_compatible(blocked, TYPED)


def test_arity_may_not_change() -> None:
    assert not _input_spec_is_compatible(_with_contract(length=4), TYPED)


def test_variable_name_may_not_change() -> None:
    assert not _input_spec_is_compatible(_with_contract(name="daily_tmax_lag"), TYPED)


def test_interval_may_not_change() -> None:
    """Monthly means and daily maxima are different models, not a rewording."""

    assert not _input_spec_is_compatible(_with_contract(interval="day"), TYPED)


def test_order_may_not_change() -> None:
    assert not _input_spec_is_compatible(_with_contract(order="oldest_first"), TYPED)


def test_output_contract_may_not_change() -> None:
    changed = {**TYPED, "output_contract": {"effect_measure": "hazard_ratio"}}
    assert not _input_spec_is_compatible(changed, TYPED)


def test_runtime_may_not_change() -> None:
    changed = {**TYPED, "runtime": {"adapter": "something_else"}}
    assert not _input_spec_is_compatible(changed, TYPED)


def test_presentation_is_overlaid_rather_than_replaced() -> None:
    """A partial manifest may add UI copy without dropping what is stored.

    The contract itself is no longer merged here - registration adopts the
    manifest's outright, once the immutable part has been checked - so this
    covers the one thing the merge still decides.
    """

    stored = {
        "input_contract": {"variables": []},
        "presentation": {
            "outcome_label": "Low birth weight",
            "figure": "newborn",
        },
    }
    incoming = {"presentation": {"figure": "mother-baby"}}

    merged = _merge_additive_presentation(stored, incoming)

    # Named by the manifest: overridden. Omitted by it: preserved.
    assert merged["presentation"]["figure"] == "mother-baby"
    assert merged["presentation"]["outcome_label"] == "Low birth weight"
