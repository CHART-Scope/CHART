from __future__ import annotations

from unittest.mock import MagicMock

from sqlalchemy import MetaData, Table

from chart.shared.db.migration_filter import (
    extension_aware_include_object,
    extension_owned_tables,
)


def test_extension_owned_tables_reads_catalog_relations() -> None:
    connection = MagicMock()
    connection.execute.return_value = [
        ("public", "spatial_ref_sys"),
        ("public", "state"),
        ("topology", "layer"),
    ]

    assert extension_owned_tables(connection) == {
        ("public", "spatial_ref_sys"),
        ("public", "state"),
        ("topology", "layer"),
    }

    query = str(connection.execute.call_args.args[0])
    assert "dependency.classid = 'pg_class'::regclass" in query
    assert "dependency.refclassid = 'pg_extension'::regclass" in query
    assert "dependency.deptype = 'e'" in query


def test_extension_only_reflected_tables_are_ignored() -> None:
    include_object = extension_aware_include_object(
        {("public", "state"), ("topology", "layer")},
        base_include_object=lambda *_args: True,
    )

    assert (
        include_object(
            Table("state", MetaData()),
            "state",
            "table",
            True,
            None,
        )
        is False
    )
    assert (
        include_object(
            Table("layer", MetaData(), schema="topology"),
            "layer",
            "table",
            True,
            None,
        )
        is False
    )


def test_chart_and_non_extension_objects_still_reach_geoalchemy_filter() -> None:
    calls: list[tuple[object, ...]] = []

    def base_include_object(*args: object) -> bool:
        calls.append(args)
        return True

    include_object = extension_aware_include_object(
        {("public", "state")},
        base_include_object=base_include_object,
    )
    reflected_state = Table("state", MetaData())
    chart_state = Table("state", MetaData())
    chart_table = Table("workspace", MetaData())

    assert (
        include_object(
            reflected_state,
            "state",
            "table",
            True,
            chart_state,
        )
        is True
    )
    assert (
        include_object(
            chart_table,
            "workspace",
            "table",
            True,
            None,
        )
        is True
    )
    assert len(calls) == 2
