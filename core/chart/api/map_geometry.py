"""``?geometry=false`` on any read: values only, no outlines.

Every map, climate layer and population read builds its areas through
``chart.risk.service.load_map_view``, which simplifies and serialises each
boundary on every request. A frame's
outlines are the same for every month, view and setting, so the dashboard keeps
them from the first response and asks later maps for values alone. This ASGI
middleware turns the flag into ``map_geometry_wanted`` for the request; the
read cache keys on the query string, so the two shapes are cached apart.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from starlette.types import ASGIApp, Receive, Scope, Send

from chart.risk.service import map_geometry_wanted


def wants_values_only(scope: Scope) -> bool:
    # Any path: reads that build no map areas simply never consult the flag.
    if scope["type"] != "http":
        return False
    query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
    return query.get("geometry", [""])[-1].strip().lower() in {"false", "0", "no"}


class MapGeometryMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not wants_values_only(scope):
            await self.app(scope, receive, send)
            return
        token = map_geometry_wanted.set(False)
        try:
            await self.app(scope, receive, send)
        finally:
            map_geometry_wanted.reset(token)
