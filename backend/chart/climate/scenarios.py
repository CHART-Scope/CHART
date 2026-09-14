"""Client-facing scenario labels and their internal SSP identifiers.

Design shows RCP-labelled scenarios (RCP 2.6 / 4.5 / 6.0) on the Long-term
dashboard tab; the platform stores ISIMIP3b SSP-RCP paired identifiers
internally. This module is the single translation point so no route,
service, or storage layer has to hand-code the mapping.

Each RCP maps to the paired SSP-RCP combination ISIMIP3b actually
provides. RCP 8.5 is included because SSP5-8.5 remains the canonical
"high emissions" Tier 1 scenario even though the current dashboard
does not surface it.

SSP3-7.0 (``ssp370``) is a legacy internal identifier that has no
canonical RCP label; callers that receive it must present it as
``ssp370`` and not silently coerce it into an RCP.
"""

from __future__ import annotations

from types import MappingProxyType


_RCP_TO_SSP: dict[str, str] = {
    "rcp26": "ssp126",  # SSP1-2.6
    "rcp45": "ssp245",  # SSP2-4.5
    "rcp60": "ssp460",  # SSP4-6.0
    "rcp85": "ssp585",  # SSP5-8.5
}

RCP_TO_SSP = MappingProxyType(_RCP_TO_SSP)
SSP_TO_RCP = MappingProxyType({ssp: rcp for rcp, ssp in _RCP_TO_SSP.items()})

DASHBOARD_LONG_TERM_RCPS: tuple[str, ...] = ("rcp26", "rcp45", "rcp60")
"""The three lines the Long-term tab overlays, in the design's order."""


class UnknownRcpLabel(ValueError):
    """The caller-supplied RCP label is not one this platform recognizes."""


class UnknownSspIdentifier(ValueError):
    """The stored SSP identifier has no canonical RCP label."""


def to_ssp(rcp: str) -> str:
    """Return the SSP-RCP paired identifier for a client-facing RCP label.

    Raises :class:`UnknownRcpLabel` for labels outside :data:`RCP_TO_SSP`
    so the caller can produce a specific error code rather than silently
    picking a default.
    """

    try:
        return _RCP_TO_SSP[rcp]
    except KeyError as exc:
        raise UnknownRcpLabel(rcp) from exc


def to_rcp(ssp: str) -> str:
    """Return the client-facing RCP label for a stored SSP identifier.

    Raises :class:`UnknownSspIdentifier` when the SSP has no paired RCP
    (currently ``ssp370``). Read paths that must return a value for
    every stored row should call :func:`to_rcp_or_none` instead.
    """

    try:
        return SSP_TO_RCP[ssp]
    except KeyError as exc:
        raise UnknownSspIdentifier(ssp) from exc


def to_rcp_or_none(ssp: str) -> str | None:
    """Best-effort RCP label; returns ``None`` for SSPs without a pair."""

    return SSP_TO_RCP.get(ssp)


def is_known_rcp(label: str) -> bool:
    return label in _RCP_TO_SSP
