"""End-to-end test of migration 035 on a disposable PostgreSQL/PostGIS database.

Creates a throwaway database on the local service (``make postgres``, or
``CHART_E2E_POSTGRES_ADMIN_URL``), migrates it to 034 with today's shape of
users, Keycloak-era roles, planning areas, a setup workspace and departments,
upgrades to 035 and checks what each person now holds, then to 036 (the old
copies dropped); then downgrades and drops the database.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

CORE = Path(__file__).resolve().parents[1]
ADMIN_URL = os.getenv(
    "CHART_E2E_POSTGRES_ADMIN_URL",
    "postgresql+psycopg://chart:chart@127.0.0.1:5434/postgres",
)


@pytest.fixture
def database(monkeypatch):
    name = f"chart_e2e_access_{uuid.uuid4().hex[:10]}"
    admin = sa.create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(sa.text(f'CREATE DATABASE "{name}"'))
    url = make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", url)
    config = Config(str(CORE / "alembic.ini"))
    config.set_main_option("script_location", str(CORE / "alembic"))
    engine = sa.create_engine(url)
    try:
        yield config, engine
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(
                sa.text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
            )
        admin.dispose()


def _seed(connection) -> None:
    run = lambda sql, **p: connection.execute(sa.text(sql), p)  # noqa: E731
    for code, level in (("IN", "country"), ("IN", "state"), ("IN", "division")):
        run(
            "INSERT INTO country_geo_config (country_code, level_key, level_label,"
            " enabled, sort_order) VALUES (:c, :l, :l, true, 0)",
            c=code,
            l=level,
        )
    for id_, level, name, parent, path in (
        ("geo-in", "country", "India", None, "/india"),
        ("geo-in-mp", "state", "Madhya Pradesh", "geo-in", "/india/madhya-pradesh"),
        (
            "geo-in-mp-bhopal",
            "division",
            "Bhopal",
            "geo-in-mp",
            "/india/madhya-pradesh/bhopal",
        ),
    ):
        run(
            "INSERT INTO geographies (id, country_code, level, level_label, name,"
            " parent_id, path, sort_order) VALUES (:id, 'IN', :level, :level,"
            " :name, :parent, :path, 0)",
            id=id_,
            level=level,
            name=name,
            parent=parent,
            path=path,
        )
    people = (
        ("admin", "chart_admin", "geo-in-mp"),
        ("priya", "health_planning_lead", "geo-in-mp"),
        ("ravi", "cross_sector_implementation_officer", "geo-in-mp-bhopal"),
        ("vera", "public_viewer", "geo-in-mp-bhopal"),
        ("nora", None, "geo-in-mp-bhopal"),
    )
    for user_id, role, place in people:
        run(
            "INSERT INTO users (id, username, email, display_name, status,"
            " identity_provider) VALUES (:id, :id, :email, :id, 'active', 'keycloak')",
            id=user_id,
            email=f"{user_id}@example.org",
        )
        if role:
            run(
                "INSERT INTO user_roles (user_id, role, source) VALUES (:u, :r, 'admin')",
                u=user_id,
                r=role,
            )
        run(
            "INSERT INTO user_geography_scopes (id, user_id, geography_id, source)"
            " VALUES (:id, :u, :g, 'admin')",
            id=f"{user_id}-{place}",
            u=user_id,
            g=place,
        )
    run(
        "INSERT INTO user_roles (user_id, role, source) VALUES ('admin', 'content_editor', 'admin')"
    )
    run(
        "INSERT INTO workspaces (id, name, status, geography_id, owner_user_id)"
        " VALUES ('workspace-in-default', 'India planning', 'active', 'geo-in', 'admin')"
    )
    for name in ("Health", "Water"):
        run("INSERT INTO department (country_code, name) VALUES ('IN', :n)", n=name)
    run(
        "INSERT INTO user_department (user_id, department_id)"
        " SELECT 'ravi', id FROM department WHERE name = 'Water'"
    )


def _holdings(connection) -> dict[str, list[tuple[str, str]]]:
    rows = connection.execute(
        sa.text(
            "SELECT m.user_id, r.key, g.geography_id FROM membership m"
            " JOIN membership_grant g ON g.membership_id = m.id"
            " JOIN access_role r ON r.id = g.role_id ORDER BY m.user_id"
        )
    )
    result: dict[str, list[tuple[str, str]]] = {}
    for user_id, key, place in rows:
        result.setdefault(user_id, []).append((key, place))
    return result


def test_migration_035_moves_roles_areas_and_departments_into_workspace_grants(
    database,
) -> None:
    config, engine = database
    command.upgrade(config, "034_department")
    with engine.begin() as connection:
        _seed(connection)
    command.upgrade(config, "035_access")

    with engine.connect() as connection:
        q = lambda sql: connection.execute(sa.text(sql)).all()  # noqa: E731
        # The setup workspace is claimed for India; no second one is made.
        assert q("SELECT id, country_code FROM workspaces") == [
            ("workspace-in-default", "IN")
        ]
        assert sorted(r[0] for r in q("SELECT key FROM access_role")) == [
            "data_officer",
            "implementation_officer",
            "planning_lead",
            "viewer",
            "workspace_admin",
        ]
        assert q(
            "SELECT c.level FROM access_role_capability c"
            " JOIN access_role r ON r.id = c.role_id"
            " WHERE r.key = 'implementation_officer' AND c.module = 'actions'"
        ) == [("write",)]
        # Existing departments move in as they are, without a reseed.
        assert sorted(q("SELECT name, workspace_id FROM department")) == [
            ("Health", "workspace-in-default"),
            ("Water", "workspace-in-default"),
        ]
        assert _holdings(connection) == {
            # Administrators: platform admin, Workspace admin over the country.
            "admin": [("workspace_admin", "geo-in")],
            "nora": [("viewer", "geo-in-mp-bhopal")],
            "priya": [("planning_lead", "geo-in-mp")],
            "ravi": [("implementation_officer", "geo-in-mp-bhopal")],
            "vera": [("viewer", "geo-in-mp-bhopal")],
        }
        assert q("SELECT id FROM users WHERE is_platform_admin") == [("admin",)]
        # Departments carry over; health roles keep their sector as Health.
        assert sorted(
            q(
                "SELECT m.user_id, d.name FROM membership_department md"
                " JOIN membership m ON m.id = md.membership_id"
                " JOIN department d ON d.id = md.department_id"
            )
        ) == [("priya", "Health"), ("ravi", "Water")]
        # The old tables stay until every route reads the new ones.
        assert q("SELECT count(*) FROM user_roles") == [(5,)]

    # 036: every route reads the new tables, so the Keycloak-era copies go.
    command.upgrade(config, "036_drop_token_access_tables")
    with engine.connect() as connection:
        tables = set(sa.inspect(connection).get_table_names())
        assert not tables & {
            "user_roles",
            "user_geography_scopes",
            "user_department",
            "workspace_members",
        }
        columns = {c["name"] for c in sa.inspect(connection).get_columns("workspaces")}
        assert "owner_user_id" not in columns
        assert _holdings(connection)["priya"] == [("planning_lead", "geo-in-mp")]

    command.downgrade(config, "034_department")
    with engine.connect() as connection:
        tables = set(sa.inspect(connection).get_table_names())
        assert "membership" not in tables
        assert "access_role" not in tables
        assert (
            connection.execute(sa.text("SELECT count(*) FROM department")).scalar() == 2
        )
