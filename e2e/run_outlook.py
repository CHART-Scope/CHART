"""Run real HTTP/browser E2E against disposable PostGIS and Keycloak services.

No production credentials, database, auth overrides, or intercepted requests.
Run through make e2e-outlook; source handovers must be available locally.
"""

from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

import httpx

ROOT = Path(__file__).resolve().parents[1]


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_http(url: str, process=None) -> None:
    for _ in range(180):
        if process and process.poll() is not None:
            raise RuntimeError("Application exited; see application.log")
        try:
            if httpx.get(url, timeout=2).is_success:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise RuntimeError(f"Service did not become ready: {url}")


def nested_group(path: str) -> dict:
    name, _, remainder = path.partition("/")
    return {
        "name": name,
        **({"subGroups": [nested_group(remainder)]} if remainder else {}),
    }


def main() -> int:
    run_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    evidence = ROOT / "outputs/e2e/outlook" / run_id
    evidence.mkdir(parents=True)
    source = Path(
        os.environ.get(
            "CHART_HANDOVER_ROOT", str(Path.home() / "Downloads/OneDrive_1_26-10-2026")
        )
    )
    metadata = {
        "command": "make e2e-outlook",
        "revision": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "working_tree": subprocess.check_output(
            ["git", "status", "--short"], cwd=ROOT, text=True
        ),
        "fixtures": "Supplied handovers imported twice into disposable PostGIS; isolated real Keycloak realm with India/Kenya planners and denied-role user",
        "source": str(source),
        "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (evidence / "run.json").write_text(json.dumps(metadata, indent=2))
    containers = []
    api = None
    generated_config = {
        path: path.read_bytes()
        for path in (ROOT / "web/next-env.d.ts", ROOT / "web/tsconfig.json")
    }
    with tempfile.TemporaryDirectory(prefix="chart-outlook-e2e-") as temp:
        temp_path = Path(temp)
        db_port, identity_port, api_port, web_port = [free_port() for _ in range(4)]
        identity = f"http://127.0.0.1:{identity_port}"
        origin = f"http://127.0.0.1:{web_port}"
        # Disposable credentials are generated, never included in saved evidence.
        password = uuid.uuid4().hex
        realm = {
            "realm": "chart",
            "displayName": "CHART",
            "loginTheme": "chart",
            "enabled": True,
            "sslRequired": "none",
            "roles": {
                "realm": [
                    {"name": "health_planning_lead"},
                    {"name": "content_editor"},
                    {"name": "chart_admin"},
                ]
            },
            "groups": [
                nested_group(
                    "india/state/madhya-pradesh/division/bhopal/district/bhopal"
                ),
                {"name": "kenya"},
            ],
            "clients": [
                {
                    "clientId": "chart-web",
                    "publicClient": True,
                    "standardFlowEnabled": True,
                    "directAccessGrantsEnabled": True,
                    "redirectUris": [origin + "/*"],
                    "webOrigins": [origin],
                    "protocolMappers": [
                        {
                            "name": "groups",
                            "protocol": "openid-connect",
                            "protocolMapper": "oidc-group-membership-mapper",
                            "config": {
                                "claim.name": "groups",
                                "full.path": "true",
                                "access.token.claim": "true",
                                "id.token.claim": "true",
                            },
                        },
                        {
                            "name": "audience",
                            "protocol": "openid-connect",
                            "protocolMapper": "oidc-audience-mapper",
                            "config": {
                                "included.custom.audience": "chart-core",
                                "access.token.claim": "true",
                            },
                        },
                    ],
                }
            ],
            "users": [
                {
                    "username": name,
                    "enabled": True,
                    "firstName": "E2E",
                    "lastName": name,
                    "email": name + "@example.invalid",
                    "emailVerified": True,
                    "groups": ["/" + country],
                    "realmRoles": (
                        [role, "health_planning_lead"]
                        if role == "chart_admin"
                        else [role]
                    ),
                    "credentials": [
                        {"type": "password", "value": password, "temporary": False}
                    ],
                }
                for name, country, role in [
                    ("india-planner", "india", "health_planning_lead"),
                    ("kenya-planner", "kenya", "health_planning_lead"),
                    (
                        "district-planner",
                        "india/state/madhya-pradesh/division/bhopal/district/bhopal",
                        "health_planning_lead",
                    ),
                    ("denied", "india", "content_editor"),
                    ("typography-admin", "india", "chart_admin"),
                ]
            ],
        }
        realm_path = temp_path / "realm.json"
        realm_path.write_text(json.dumps(realm))
        env = {
            **os.environ,
            "DATABASE_URL": f"postgresql+psycopg://chart:{password}@127.0.0.1:{db_port}/chart",
            "CHART_E2E_POSTGRES_URL": f"postgresql://chart:{password}@127.0.0.1:{db_port}/chart",
            "MODEL_CACHE_DIR": str(temp_path / "models"),
            "KEYCLOAK_ISSUER_URL": identity + "/realms/chart",
            "KEYCLOAK_CLIENT_ID": "chart-core",
            "CHART_ADMIN_SEES_ALL_MODEL_GEOGRAPHIES": "false",
            "CHART_E2E_API": f"http://127.0.0.1:{api_port}",
            "CHART_E2E_IDENTITY": identity,
            "CHART_E2E_PASSWORD": password,
            "CHART_E2E_ORIGIN": origin,
            "CHART_E2E_EVIDENCE": str(evidence),
            "CHART_PYTHON_API_INTERNAL_URL": f"http://127.0.0.1:{api_port}",
            "CHART_API_INTERNAL_URL": f"http://127.0.0.1:{api_port}",
            "CHART_REPOSITORY_URL": "",
            "KEYCLOAK_SERVER_URL": identity,
            "KEYCLOAK_BROWSER_URL": identity,
            "KEYCLOAK_WEB_CLIENT_ID": "chart-web",
            "KEYCLOAK_REALM": "chart",
            "CHART_WEB_ORIGIN": origin,
        }
        try:
            for name, args in [
                (
                    "db",
                    [
                        "-e",
                        "POSTGRES_USER=chart",
                        "-e",
                        "POSTGRES_DB=chart",
                        "-e",
                        f"POSTGRES_PASSWORD={password}",
                        "-p",
                        f"127.0.0.1:{db_port}:5432",
                        "chart-postgis:16",
                    ],
                ),
                (
                    "identity",
                    [
                        "-p",
                        f"127.0.0.1:{identity_port}:8080",
                        "-v",
                        f"{realm_path}:/opt/keycloak/data/import/realm.json:ro",
                        "-v",
                        f"{ROOT / 'infra/keycloak/themes/chart'}:/opt/keycloak/themes/chart:ro",
                        "quay.io/keycloak/keycloak:26.6.1",
                        "start-dev",
                        "--import-realm",
                    ],
                ),
            ]:
                container = "chart-e2e-" + run_id + "-" + name
                subprocess.run(
                    ["docker", "run", "--rm", "-d", "--name", container, *args],
                    check=True,
                    stdout=subprocess.DEVNULL,
                )
                containers.append(container)
            for _ in range(60):
                if (
                    subprocess.run(
                        ["docker", "exec", containers[0], "pg_isready", "-U", "chart"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    ).returncode
                    == 0
                ):
                    break
                time.sleep(1)
            with (evidence / "migration.log").open("w") as log:
                subprocess.run(
                    ["bash", "core/scripts/migrate.sh"],
                    cwd=ROOT,
                    env={**env, "PYTHON_BIN": sys.executable},
                    check=True,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
            wait_http(identity + "/realms/chart/.well-known/openid-configuration")
            with (evidence / "import.log").open("w") as log:
                publication = temp_path / "models/outlooks"
                if previous := os.environ.get("CHART_E2E_PUBLICATION"):
                    shutil.copytree(previous, publication)
                    metadata["publication"] = str(Path(previous).resolve())
                else:
                    subprocess.run(
                        [
                            sys.executable,
                            "-m",
                            "chart.heat_outlook.handover",
                            "--source",
                            str(source),
                            "--output",
                            str(publication),
                            "--start-years",
                            "2027",
                        ],
                        cwd=ROOT,
                        env=env,
                        check=True,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                    )
                shutil.copyfile(
                    publication / "provenance.json",
                    evidence / "publication-provenance.json",
                )
                metadata["publication_index_sha256"] = hashlib.sha256(
                    (publication / "index.json").read_bytes()
                ).hexdigest()
                for _ in range(2):
                    subprocess.run(
                        [
                            sys.executable,
                            "-m",
                            "chart.heat_outlook.geography",
                            str(publication),
                        ],
                        cwd=ROOT,
                        env=env,
                        check=True,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                    )
            with (evidence / "application.log").open("w") as log:
                api = subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "chart.api.app:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(api_port),
                    ],
                    cwd=ROOT,
                    env=env,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                )
                wait_http(env["CHART_E2E_API"] + "/live", api)
                with (evidence / "api-results.log").open("w") as results:
                    subprocess.run(
                        [
                            sys.executable,
                            "-m",
                            "pytest",
                            "e2e/test_outlook_live.py",
                            "orchestration/tests/test_dagster_postgres_driver.py",
                            "-q",
                            "--tb=short",
                            "--junitxml=" + str(evidence / "api-junit.xml"),
                        ],
                        cwd=ROOT,
                        env=env,
                        check=True,
                        stdout=results,
                        stderr=subprocess.STDOUT,
                    )
                with (evidence / "browser-results.log").open("w") as results:
                    subprocess.run(
                        [
                            "npx",
                            "playwright",
                            "test",
                            "--config",
                            "../e2e/playwright.outlook.config.ts",
                        ],
                        cwd=ROOT / "web",
                        env=env,
                        check=True,
                        stdout=results,
                        stderr=subprocess.STDOUT,
                    )
            metadata["result"] = "passed"
            return 0
        except Exception as error:
            metadata["result"] = "failed"
            metadata["failure"] = type(error).__name__
            print(
                f"E2E failed ({type(error).__name__}); evidence: {evidence}",
                file=sys.stderr,
            )
            return 1
        finally:
            if api:
                api.terminate()
                api.wait(timeout=15)
            for path, content in generated_config.items():
                path.write_bytes(content)
            for container in reversed(containers):
                if metadata.get("result") != "passed":
                    with (
                        evidence / (container.rsplit("-", 1)[-1] + "-service.log")
                    ).open("w") as log:
                        subprocess.run(
                            ["docker", "logs", container],
                            stdout=log,
                            stderr=subprocess.STDOUT,
                        )
                subprocess.run(
                    ["docker", "rm", "-f", container],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            (evidence / "run.json").write_text(json.dumps(metadata, indent=2))
            print(f"E2E evidence: {evidence}")


if __name__ == "__main__":
    raise SystemExit(main())
