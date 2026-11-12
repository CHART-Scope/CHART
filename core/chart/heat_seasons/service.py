"""Read, save and reset heat-season calendars.

A calendar is twelve letters, January first (see ``HeatSeasonSetting``). It
must describe one planning cycle: read from the first preparation month, the
months run before, then during, then after, then outside the cycle. A place
without a saved calendar inherits its nearest ancestor's; a country without
one uses its official season, with the four months before it as preparation
and the rest as review (the cycle the Gantt chart has always drawn).

Reading needs read access to the place. Saving and resetting are for
administrators, and each writes a
``heat_season_changed`` audit event with the months before and after.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from chart.auth.schemas import CurrentUserContext
from chart.auth.service import can_read_geography_path
from chart.climate.heat_seasons import heat_season
from chart.shared.db.models import (
    AppGeography,
    AppUser,
    AuditEventRecord,
    HeatSeasonSetting,
)

from .schemas import HeatSeasonCalendar

WRITER_ROLES = frozenset({"chart_admin"})
AUDIT_EVENT_TYPE = "heat_season_changed"
BEFORE_MONTHS = 4
_CYCLE = re.compile(r"^b*d+a*o*$")


class HeatSeasonError(ValueError):
    def __init__(self, code: str, status_code: int) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def official_months(country_code: str) -> str | None:
    """The country's published season as a calendar, or None without one."""

    season = heat_season(country_code)
    if season is None:
        return None
    letters = ["a"] * 12
    for month in season.months:
        letters[month - 1] = "d"
    start = season.months[0] - 1
    for back in range(1, BEFORE_MONTHS + 1):
        index = (start - back) % 12
        if letters[index] != "d":
            letters[index] = "b"
    return "".join(letters)


def validate_months(months: str) -> None:
    """One cycle: before, during, after, then off, read from preparation."""

    if not re.fullmatch(r"[bdao]{12}", months):
        raise HeatSeasonError("HEAT_SEASON_INVALID", 422)
    lead = "b" if "b" in months else "d"
    starts = [i for i in range(12) if months[i] == lead and months[i - 1] != lead]
    if not starts or len(starts) > 1:
        raise HeatSeasonError("HEAT_SEASON_INVALID", 422)
    rotated = months[starts[0] :] + months[: starts[0]]
    if not _CYCLE.fullmatch(rotated):
        raise HeatSeasonError("HEAT_SEASON_INVALID", 422)


def list_calendars(
    session: Session, user: CurrentUserContext
) -> list[HeatSeasonCalendar]:
    """Every place the user can read, parents before children."""

    places = session.scalars(select(AppGeography).order_by(AppGeography.path)).all()
    by_id = {place.id: place for place in places}
    saved = {
        row.geography_id: row for row in session.scalars(select(HeatSeasonSetting))
    }
    return [
        _calendar(place, by_id, saved)
        for place in places
        if can_read_geography_path(user, place.path)
    ]


def read_calendar(
    session: Session, user: CurrentUserContext, geography_id: str
) -> HeatSeasonCalendar:
    place = _readable(session, user, geography_id)
    by_id = {row.id: row for row in _lineage(session, place)}
    saved = {
        row.geography_id: row
        for row in session.scalars(
            select(HeatSeasonSetting).where(HeatSeasonSetting.geography_id.in_(by_id))
        )
    }
    return _calendar(place, by_id, saved)


def save_calendar(
    session: Session,
    user: CurrentUserContext,
    geography_id: str,
    months: str,
    source: str | None,
) -> HeatSeasonCalendar:
    place = _writable(session, user, geography_id)
    validate_months(months)
    row = session.get(HeatSeasonSetting, geography_id)
    before = row.months if row else None
    if row is None:
        row = HeatSeasonSetting(geography_id=geography_id, months=months)
        session.add(row)
    row.months = months
    row.source = (source or "").strip() or None
    row.updated_by_user_id = user.user_id
    row.updated_at = datetime.now(timezone.utc)
    _audit(session, user, place, before, months)
    session.commit()
    return read_calendar(session, user, geography_id)


def reset_calendar(
    session: Session, user: CurrentUserContext, geography_id: str
) -> HeatSeasonCalendar:
    """Drop the place's own calendar so it inherits again."""

    place = _writable(session, user, geography_id)
    row = session.get(HeatSeasonSetting, geography_id)
    if row is not None:
        _audit(session, user, place, row.months, None)
        session.delete(row)
        session.commit()
    return read_calendar(session, user, geography_id)


def _calendar(
    place: AppGeography,
    by_id: dict[str, AppGeography],
    saved: dict[str, HeatSeasonSetting],
) -> HeatSeasonCalendar:
    depth, root, origin = 0, place, None
    cursor: AppGeography | None = place
    while cursor is not None:
        root = cursor
        if origin is None and cursor.id in saved:
            origin = saved[cursor.id]
        cursor = by_id.get(cursor.parent_id) if cursor.parent_id else None
        depth += cursor is not None
    own = saved.get(place.id)

    def calendar(
        months: str | None,
        state: str,
        source: str | None = None,
        inherited_from: str | None = None,
    ) -> HeatSeasonCalendar:
        return HeatSeasonCalendar.model_validate(
            {
                "geography_id": place.id,
                "name": place.name,
                "level_label": place.level_label,
                "parent_id": place.parent_id,
                "depth": depth,
                "own": own.months if own else None,
                "months": months,
                "state": state,
                "source": source,
                "inherited_from": inherited_from,
            }
        )

    if origin is not None:
        inherited = None if own else by_id[origin.geography_id].name
        state = "custom" if own else "inherited"
        return calendar(origin.months, state, origin.source, inherited)
    official = official_months(root.country_code)
    if official is None:
        return calendar(None, "unset")
    season = heat_season(root.country_code)
    return calendar(official, "official", season.source_name if season else None)


def season_months(session: Session, geography_id: str) -> list[int] | None:
    """The place's heat-season months in season order (Dec, Jan, ...).

    From its own calendar, else its nearest ancestor's, else the country's
    official season; None when none is set. No access check: callers have
    already checked read access to the place.
    """

    place = session.get(AppGeography, geography_id)
    if place is None:
        return None
    by_id = {row.id: row for row in _lineage(session, place)}
    saved = {
        row.geography_id: row
        for row in session.scalars(
            select(HeatSeasonSetting).where(HeatSeasonSetting.geography_id.in_(by_id))
        )
    }
    months = _calendar(place, by_id, saved).months
    if not months or "d" not in months:
        return None
    # The calendar holds one unbroken season; start at its first month.
    start = next(i for i in range(12) if months[i] == "d" and months[i - 1] != "d")
    return [
        (start + offset) % 12 + 1
        for offset in range(12)
        if months[(start + offset) % 12] == "d"
    ]


def _lineage(session: Session, place: AppGeography) -> list[AppGeography]:
    chain, seen = [place], {place.id}
    while chain[-1].parent_id and chain[-1].parent_id not in seen:
        parent = session.get(AppGeography, chain[-1].parent_id)
        if parent is None:
            break
        chain.append(parent)
        seen.add(parent.id)
    return chain


def _readable(
    session: Session, user: CurrentUserContext, geography_id: str
) -> AppGeography:
    place = session.get(AppGeography, geography_id)
    if place is None:
        raise HeatSeasonError("HEAT_SEASON_GEOGRAPHY_NOT_FOUND", 404)
    if not can_read_geography_path(user, place.path):
        raise HeatSeasonError("GEOGRAPHY_NOT_ALLOWED", 403)
    return place


def _writable(
    session: Session, user: CurrentUserContext, geography_id: str
) -> AppGeography:
    place = _readable(session, user, geography_id)
    if not WRITER_ROLES.intersection(user.roles):
        raise HeatSeasonError("ROLE_NOT_ALLOWED", 403)
    # The audit row and updated_by need the user; a first-time caller has none.
    if session.get(AppUser, user.user_id) is None:
        session.add(
            AppUser(
                id=user.user_id,
                username=user.username,
                email=user.email,
                display_name=user.username,
                status="active",
            )
        )
        session.flush()
    return place


def _audit(
    session: Session,
    user: CurrentUserContext,
    place: AppGeography,
    before: str | None,
    after: str | None,
) -> None:
    session.add(
        AuditEventRecord(
            user_id=user.user_id,
            session_id="server",
            flush_id=f"heat-season-{uuid.uuid4()}",
            client_seq=0,
            event_type=AUDIT_EVENT_TYPE,
            occurred_at=datetime.now(timezone.utc),
            geography_id=place.id,
            payload={"geography_id": place.id, "before": before, "after": after},
        )
    )
