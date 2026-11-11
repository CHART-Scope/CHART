from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

#: One letter per calendar month, January first: b before, d during,
#: a after, o outside the planning cycle.
Months = Annotated[str, Field(pattern=r"^[bdao]{12}$")]


class HeatSeasonCalendar(BaseModel):
    geography_id: str
    name: str
    level_label: str
    parent_id: str | None
    depth: int
    #: The months saved for this place, or None when it inherits.
    own: Months | None = None
    #: The months in effect: its own, an ancestor's or the official season.
    months: Months | None = None
    #: ``custom`` (saved here), ``inherited`` (from ``inherited_from``),
    #: ``official`` (the country's published season) or ``unset``.
    state: Literal["custom", "inherited", "official", "unset"]
    inherited_from: str | None = None
    source: str | None = None


class HeatSeasonList(BaseModel):
    items: list[HeatSeasonCalendar]


class HeatSeasonUpdate(BaseModel):
    months: Months
    source: str | None = Field(default=None, max_length=200)
