from __future__ import annotations

import os

import psycopg
from psycopg import sql


def main() -> None:
    password = os.environ["POSTGRES_PASSWORD"]
    host = os.getenv("POSTGRES_HOST", "chart-postgres")
    user = os.getenv("POSTGRES_USER", "chart")

    with psycopg.connect(
        host=host,
        dbname="postgres",
        user=user,
        password=password,
        autocommit=True,
    ) as connection:
        with connection.cursor() as cursor:
            ensure_role(cursor, "chart_keycloak", password)
            ensure_database(cursor, "chart_dagster", user)
            ensure_database(cursor, "chart_keycloak", "chart_keycloak")


def ensure_role(cursor: psycopg.Cursor[object], name: str, password: str) -> None:
    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (name,))
    statement = sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD {}")
    if cursor.fetchone() is None:
        statement = sql.SQL("CREATE ROLE {} WITH LOGIN PASSWORD {}")
    cursor.execute(statement.format(sql.Identifier(name), sql.Literal(password)))


def ensure_database(cursor: psycopg.Cursor[object], name: str, owner: str) -> None:
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,))
    if cursor.fetchone() is None:
        cursor.execute(
            sql.SQL("CREATE DATABASE {} OWNER {}").format(
                sql.Identifier(name), sql.Identifier(owner)
            )
        )
    cursor.execute(
        sql.SQL("ALTER DATABASE {} OWNER TO {}").format(
            sql.Identifier(name), sql.Identifier(owner)
        )
    )


if __name__ == "__main__":
    main()
