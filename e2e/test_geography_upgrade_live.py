"""Upgrade a real legacy PostGIS schema before registering the publication."""

import json
import os
from pathlib import Path
import subprocess
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
LEGACY_CHECKS = {
    "country_geo_config_level_key_check",
    "geographies_level_check",
}


def test_legacy_level_checks_upgrade_and_publication_registration():
    expected = make_url(os.environ["CHART_E2E_POSTGRES_URL"])
    actual = make_url(os.environ["DATABASE_URL"])
    evidence = Path(os.environ["CHART_E2E_EVIDENCE"])
    assert (
        expected.host == actual.host == "127.0.0.1"
        and expected.port == actual.port
        and expected.database == actual.database
        and expected.password == actual.password
        and (evidence / "run.json").is_file()
    ), "Schema regression requires the disposable E2E runner"
    publication = Path(os.environ["CHART_E2E_PUBLICATION"])
    registration = [
        sys.executable,
        "-m",
        "chart.heat_outlook.geography",
        str(publication),
    ]
    engine = create_engine(os.environ["DATABASE_URL"])
    report = {"result": "running", "steps": []}

    def execute(command, filename, *, cwd=ROOT, success=True):
        with (evidence / filename).open("w") as log:
            process = subprocess.run(
                command,
                cwd=cwd,
                env={**os.environ, "PYTHON_BIN": sys.executable},
                stdout=log,
                stderr=subprocess.STDOUT,
                check=False,
            )
        report["steps"].append(
            {"command": command, "exit_code": process.returncode, "log": filename}
        )
        if success:
            assert process.returncode == 0, (evidence / filename).read_text()
        return process.returncode

    def constraints(connection):
        return dict(
            connection.execute(
                text(
                    "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
                    "WHERE conrelid IN ('country_geo_config'::regclass, 'geographies'::regclass)"
                )
            ).all()
        )

    try:
        # The runner has already exercised a fresh upgrade to head. Recreate
        # the two checks found on databases upgraded from the legacy app.
        execute(
            [sys.executable, "-m", "alembic", "downgrade", "028_vra"],
            "upgrade-legacy-setup.log",
            cwd=ROOT / "core",
        )
        with engine.begin() as connection:
            for table, column, name in (
                (
                    "country_geo_config",
                    "level_key",
                    "country_geo_config_level_key_check",
                ),
                ("geographies", "level", "geographies_level_check"),
            ):
                connection.execute(
                    text(
                        f"ALTER TABLE {table} ADD CONSTRAINT {name} "
                        f"CHECK ({column} IN ('country', 'geo_level_1', 'geo_level_2', 'geo_level_3'))"
                    )
                )
            existing = constraints(connection)
            if "geographies_path_check" not in existing:
                connection.execute(
                    text(
                        "ALTER TABLE geographies ADD CONSTRAINT geographies_path_check CHECK (path LIKE '/%')"
                    )
                )
            before = constraints(connection)
            assert LEGACY_CHECKS <= set(before)
            counts_before = connection.execute(
                text(
                    "SELECT (SELECT count(*) FROM geographies), (SELECT count(*) FROM country_geo_config)"
                )
            ).one()
        assert (
            execute(registration, "upgrade-before-registration.log", success=False) != 0
        )
        assert (
            "country_geo_config_level_key_check"
            in (evidence / "upgrade-before-registration.log").read_text()
        )
        with engine.connect() as connection:
            assert (
                connection.execute(
                    text(
                        "SELECT (SELECT count(*) FROM geographies), (SELECT count(*) FROM country_geo_config)"
                    )
                ).one()
                == counts_before
            ), "Failed registration must be atomic"
        execute(["bash", "core/scripts/migrate.sh"], "upgrade-migration.log")
        with engine.connect() as connection:
            after = constraints(connection)
            assert not LEGACY_CHECKS & set(after)
            assert after == {
                key: value for key, value in before.items() if key not in LEGACY_CHECKS
            }
            assert "geographies_path_check" in after
            assert any(
                "FOREIGN KEY (country_code, level)" in value for value in after.values()
            )
            assert (
                connection.scalar(text("SELECT version_num FROM alembic_version"))
                == "029_configurable_geo_levels"
            )
        for attempt in (1, 2):
            execute(registration, f"upgrade-registration-{attempt}.log")
        with engine.connect() as connection:
            fine_counts = dict(
                connection.execute(
                    text(
                        "SELECT level, count(*) FROM geographies "
                        "WHERE level IN ('district', 'constituency') GROUP BY level"
                    )
                ).all()
            )
            assert fine_counts == {"district": 52, "constituency": 289}
            assert (
                connection.scalar(
                    text(
                        "SELECT count(*) FROM geographies g LEFT JOIN country_geo_config c "
                        "ON c.country_code=g.country_code AND c.level_key=g.level "
                        "WHERE c.level_key IS NULL"
                    )
                )
                == 0
            )
            report["registered_fine_areas"] = fine_counts
        report["result"] = "passed"
    except Exception as error:
        report["result"] = "failed"
        report["error"] = type(error).__name__
        raise
    finally:
        engine.dispose()
        (evidence / "geography-upgrade.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
