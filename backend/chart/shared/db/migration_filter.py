from __future__ import annotations

from collections.abc import Callable
from typing import Any

from geoalchemy2.alembic_helpers import include_object as geoalchemy_include_object
from sqlalchemy import Connection, text

IncludeObject = Callable[[Any, str | None, str, bool, Any | None], bool]


def extension_owned_tables(connection: Connection) -> set[tuple[str, str]]:
    """Return tables managed by installed PostgreSQL extensions."""
    rows = connection.execute(
        text(
            """
            SELECT namespace.nspname, relation.relname
            FROM pg_depend AS dependency
            JOIN pg_extension AS installed_extension
              ON installed_extension.oid = dependency.refobjid
            JOIN pg_class AS relation
              ON relation.oid = dependency.objid
            JOIN pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE dependency.classid = 'pg_class'::regclass
              AND dependency.refclassid = 'pg_extension'::regclass
              AND dependency.deptype = 'e'
              AND relation.relkind IN ('r', 'p')
            """
        )
    )
    return {(schema_name, table_name) for schema_name, table_name in rows}


def extension_aware_include_object(
    extension_tables: set[tuple[str, str]],
    base_include_object: IncludeObject = geoalchemy_include_object,
) -> IncludeObject:
    """Compose GeoAlchemy filtering with PostgreSQL extension ownership."""

    def include_object(
        object_: Any,
        name: str | None,
        type_: str,
        reflected: bool,
        compare_to: Any | None,
    ) -> bool:
        if reflected and compare_to is None and type_ == "table" and name is not None:
            schema_name = getattr(object_, "schema", None) or "public"
            if (schema_name, name) in extension_tables:
                return False
        return base_include_object(object_, name, type_, reflected, compare_to)

    return include_object
