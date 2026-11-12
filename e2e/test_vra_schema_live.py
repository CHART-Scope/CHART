"""Real HTTP, identity and PostGIS coverage of VRA data-entry contracts."""

import csv
import io
import json
import os
from pathlib import Path

import pytest
from sqlalchemy import delete, func, select

from chart.shared.db.models import VraIndicator, VraIndicatorValue, VraIngestion, VraRun

FRAME = "geo-in-madhya-pradesh"
LEGACY_COLUMNS = [
    "area_code",
    "area_name",
    "indicator_code",
    "value",
    "vintage",
    "source_name",
    "source_url",
    "notes",
]
COLUMNS = LEGACY_COLUMNS + [
    "indicator_name",
    "unit",
    "expected_values",
    "example_value",
]


def csv_text(rows, columns=LEGACY_COLUMNS):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def row(area, code, value, **extra):
    return {
        "area_code": area["code"],
        "area_name": area["name"],
        "indicator_code": code,
        "value": value,
        "vintage": "2026-e2e",
        "source_name": "Synthetic E2E data",
        "source_url": "",
        "notes": "Not real evidence",
        **extra,
    }


def upload(client, headers, text, *, indicator_code=None):
    params = {"file_name": "synthetic-vra.csv"}
    if indicator_code is not None:
        params["indicator_code"] = indicator_code
    return client.post(
        f"/vra/{FRAME}/values",
        params=params,
        content=text.encode("utf-8"),
        headers={**headers, "Content-Type": "text/csv"},
    )


@pytest.fixture
def vra_frame(client, admin_headers, jobs):
    # jobs enforces the runner's disposable database/identity guard. These tests
    # use the migrated, registered geography frame, never development data.
    factory, _ = jobs
    response = client.get(f"/vra/{FRAME}/assessment", headers=admin_headers)
    assert response.status_code == 200, response.text
    areas = response.json()["areas"]
    assert len(areas) == 10
    area_ids = [area["admin_unit_id"] for area in areas]
    with factory() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(VraIndicatorValue)
                .where(VraIndicatorValue.admin_unit_id.in_(area_ids))
            )
            == 0
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(VraRun)
                .where(VraRun.frame_geography_id == FRAME)
            )
            == 0
        )
    yield factory, areas
    with factory() as session:
        session.execute(delete(VraRun).where(VraRun.frame_geography_id == FRAME))
        session.execute(
            delete(VraIndicatorValue).where(
                VraIndicatorValue.admin_unit_id.in_(area_ids)
            )
        )
        session.execute(
            delete(VraIngestion).where(VraIngestion.frame_geography_id == FRAME)
        )
        session.commit()


def stored_values(factory, areas):
    with factory() as session:
        return list(
            session.scalars(
                select(VraIndicatorValue).where(
                    VraIndicatorValue.admin_unit_id.in_(
                        [area["admin_unit_id"] for area in areas]
                    )
                )
            )
        )


def test_download_fill_upload_retry_and_assess_preserves_zero_and_missing(
    client,
    admin_headers,
    vra_frame,
):
    factory, areas = vra_frame
    values = {
        "exp.population_density": [100, 200, 300, 400],
        "sens.elderly_share": [0, 10, 20, 30],
        "haz.flood_events": [0.5, 1.5, 2.5, 3.5],
        "ac.heat_action_plan": [0, 1, 0, 1],
    }
    template_rows = []
    for code, series in values.items():
        response = client.get(
            f"/vra/{FRAME}/template.csv",
            params={"indicator_code": code},
            headers=admin_headers,
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/csv")
        reader = csv.DictReader(io.StringIO(response.text))
        assert reader.fieldnames == COLUMNS
        rows = list(reader)
        assert len(rows) == 10
        assert {item["indicator_code"] for item in rows} == {code}
        assert all(item["value"] == item["vintage"] == "" for item in rows)
        assert all(
            item["expected_values"] and item["unit"] and item["example_value"]
            for item in rows
        )
        for item in rows:
            index = next(
                i for i, area in enumerate(areas) if area["code"] == item["area_code"]
            )
            if index < 4:
                item.update(
                    value=str(series[index]),
                    vintage="2026-e2e",
                    source_name="Synthetic E2E data",
                )
        template_rows.extend(rows)
    text = csv_text(template_rows, COLUMNS)
    first = upload(client, admin_headers, text)
    assert first.status_code == 200, first.text
    assert (first.json()["rows_accepted"], first.json()["rows_rejected"]) == (16, 0)
    facts = stored_values(factory, areas)
    assert len(facts) == 16  # 24 blank template rows must not become zeros.
    ids = {item.id for item in facts}
    assert {item.method for item in facts} == {"observed"}
    assert {item.ingestion_id for item in facts} == {first.json()["ingestion_id"]}
    retry = upload(client, admin_headers, text)
    assert retry.status_code == 200, retry.text
    assert retry.json()["rows_accepted"] == 16
    assert {item.id for item in stored_values(factory, areas)} == ids

    runs = []
    for _ in range(2):
        response = client.post(f"/vra/{FRAME}/runs", headers=admin_headers)
        assert response.status_code == 200, response.text
        assessment = response.json()
        runs.append(assessment["run"])
        assert sum(area["risk"] is not None for area in assessment["areas"]) == 4
    assert runs[0]["id"] != runs[1]["id"]
    assert runs[0]["input_hash"] == runs[1]["input_hash"]
    assert runs[0]["output_hash"] == runs[1]["output_hash"]
    detail = client.get(
        f"/vra/{FRAME}/areas/{areas[0]['geography_id']}", headers=admin_headers
    )
    assert detail.status_code == 200, detail.text
    indicators = {item["code"]: item for item in detail.json()["indicators"]}
    assert (
        indicators["exp.population_density"]["raw"],
        indicators["exp.population_density"]["normalised"],
    ) == (100, 0)
    assert (
        indicators["sens.elderly_share"]["raw"],
        indicators["sens.elderly_share"]["normalised"],
    ) == (0, 0)
    assert indicators["exp.workers_share"]["raw"] is None
    assert indicators["exp.workers_share"]["normalised"] is None
    missing = client.get(
        f"/vra/{FRAME}/areas/{areas[4]['geography_id']}", headers=admin_headers
    ).json()
    assert missing["area"]["risk"] is None
    assert all(item["raw"] is None for item in missing["indicators"])
    with factory() as session:
        assert (
            session.get(VraRun, runs[-1]["id"]).output_hash == runs[-1]["output_hash"]
        )
    updated = upload(
        client, admin_headers, csv_text([row(areas[0], "exp.population_density", 250)])
    )
    assert updated.json()["rows_accepted"] == 1
    changed = client.post(f"/vra/{FRAME}/runs", headers=admin_headers).json()["run"]
    assert changed["input_hash"] != runs[-1]["input_hash"]
    assert changed["output_hash"] != runs[-1]["output_hash"]
    assert {item.id for item in stored_values(factory, areas)} == ids
    Path(os.environ["CHART_E2E_EVIDENCE"], "vra-schema.json").write_text(
        json.dumps(
            {
                "frame": FRAME,
                "template_rows": len(template_rows),
                "persisted_facts": len(facts),
                "repeat_runs": runs,
                "updated_run": changed,
                "density_raw": 100,
                "density_relative_score": 0,
                "elderly_raw": 0,
                "blank_rows_remain_missing": True,
            },
            indent=2,
        )
    )


def test_catalogue_and_templates_publish_authoritative_rules(
    client, admin_headers, vra_frame
):
    response = client.get("/vra/indicators", headers=admin_headers)
    assert response.status_code == 200
    catalogue = {item["code"]: item for item in response.json()["items"]}
    coverage = client.get(f"/vra/{FRAME}/coverage", headers=admin_headers).json()
    for item in coverage["indicators"]:
        source = catalogue[item["code"]]
        assert item["value_schema"] == source["value_schema"]
        assert item["unit"] == source["unit"]
        assert item["uploadable"] == source["uploadable"]
    assert catalogue["sens.elderly_share"]["value_schema"]["maximum"] == 100
    assert (
        catalogue["sens.groundwater_extraction_stage"]["value_schema"]["maximum"]
        is None
    )
    assert catalogue["haz.flood_events"]["value_schema"]["type"] == "number"
    assert (
        catalogue["ctx.state_health_adaptation_plan"]["value_schema"]["type"]
        == "integer"
    )
    template = client.get(f"/vra/{FRAME}/template.csv", headers=admin_headers)
    rows = list(csv.DictReader(io.StringIO(template.text)))
    assert {item["indicator_code"] for item in rows} == {
        code for code, item in catalogue.items() if item["uploadable"]
    }
    assert all(item["value"] == "" for item in rows)
    for code in ("not.an.indicator", "haz.heatwave_days_12m", "exp.vet_facilities"):
        response = client.get(
            f"/vra/{FRAME}/template.csv",
            params={"indicator_code": code},
            headers=admin_headers,
        )
        assert (response.status_code, response.json()["error"]) == (
            422,
            "VRA_TEMPLATE_INDICATOR_INVALID",
        )


def test_selected_indicator_upload_rejects_other_codes_and_preserves_retry(
    client, admin_headers, vra_frame
):
    factory, areas = vra_frame
    selected = "exp.population_density"
    template = client.get(
        f"/vra/{FRAME}/template.csv",
        params={"indicator_code": selected},
        headers=admin_headers,
    )
    assert template.status_code == 200, template.text
    rows = list(csv.DictReader(io.StringIO(template.text)))
    rows[0].update(value="0", vintage="2026-e2e")
    # A valid value for another indicator must not cross the chosen import scope.
    rows[1].update(
        indicator_code="sens.elderly_share", value="20", vintage="2026-e2e", unit=""
    )
    # Choosing one indicator must still enforce its ordinary value schema.
    rows[2].update(value="-1", vintage="2026-e2e")
    response = upload(
        client, admin_headers, csv_text(rows, COLUMNS), indicator_code=selected
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["rows_accepted"], result["rows_rejected"]) == (1, 2)
    assert result["rejections"][0]["row"] == 3
    assert "does not match the selected indicator" in result["rejections"][0]["reason"]
    assert selected in result["rejections"][0]["reason"]
    assert result["rejections"][1]["row"] == 4
    assert "expected" in result["rejections"][1]["reason"]
    facts = stored_values(factory, areas)
    assert len(facts) == 1 and facts[0].value == 0
    with factory() as session:
        assert session.get(VraIndicator, facts[0].indicator_id).code == selected
        assert (
            session.get(VraIngestion, result["ingestion_id"]).rejections
            == result["rejections"]
        )
    rows[0]["value"] = "250"
    retry = upload(
        client, admin_headers, csv_text(rows, COLUMNS), indicator_code=selected
    )
    assert retry.status_code == 200, retry.text
    assert (retry.json()["rows_accepted"], retry.json()["rows_rejected"]) == (1, 2)
    assert [(item.id, item.value) for item in stored_values(factory, areas)] == [
        (facts[0].id, 250)
    ]
    # Omitting the filter is All indicators and retains the existing CSV contract.
    all_indicators = upload(client, admin_headers, csv_text([rows[1]], COLUMNS))
    assert all_indicators.status_code == 200, all_indicators.text
    assert all_indicators.json()["rows_accepted"] == 1
    assert sorted(item.value for item in stored_values(factory, areas)) == [20, 250]


@pytest.mark.parametrize(
    "selected", ["not.an.indicator", "haz.heatwave_days_12m", "exp.vet_facilities"]
)
def test_invalid_selected_indicator_upload_writes_nothing(
    client, admin_headers, vra_frame, selected
):
    factory, areas = vra_frame
    response = upload(
        client,
        admin_headers,
        csv_text([row(areas[0], "exp.population_density", 23)]),
        indicator_code=selected,
    )
    assert (response.status_code, response.json()["error"]) == (
        422,
        "VRA_TEMPLATE_INDICATOR_INVALID",
    )
    assert stored_values(factory, areas) == []
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIngestion)) == 0


def test_mixed_invalid_rows_reject_with_row_reasons_without_losing_valid_values(
    client, admin_headers, vra_frame
):
    factory, areas = vra_frame
    area = areas[0]
    invalid = [
        ("sens.elderly_share", -1, {}, "expected"),
        ("sens.elderly_share", 101, {}, "expected"),
        ("ac.heat_action_plan", 2, {}, "expected"),
        ("ac.heat_action_plan", 0.5, {}, "expected"),
        ("ctx.state_health_adaptation_plan", -1, {}, "expected"),
        ("ctx.state_health_adaptation_plan", 1.5, {}, "expected"),
        ("exp.population_density", -1, {}, "expected"),
        ("exp.population_density", "NaN", {}, "finite"),
        ("exp.population_density", "inf", {}, "finite"),
        ("exp.population_density", "12%", {}, "not a number"),
        ("exp.population_density", 1, {"area_code": "kajiado"}, "not an area"),
        ("not.an.indicator", 1, {}, "not in the catalogue"),
        ("haz.heatwave_days_12m", 1, {}, "computed"),
        ("exp.vet_facilities", 1, {}, "dropped"),
        ("exp.population_density", 1, {"vintage": ""}, "vintage is required"),
        ("exp.population_density", 1, {"vintage": "x" * 33}, "32 characters"),
        ("exp.population_density", 1, {"source_name": "x" * 257}, "256 characters"),
        ("exp.population_density", 1, {"notes": "nul\x00text"}, "NUL"),
        ("sens.elderly_share", 12, {"unit": "fraction"}, "unit"),
    ]
    rows = [row(area, code, value, **extra) for code, value, extra, _ in invalid]
    valid = {
        "sens.elderly_share": 0,
        "ac.heat_action_plan": 0,
        "ctx.state_health_adaptation_plan": 0,
        "exp.population_density": 0,
        "sens.groundwater_extraction_stage": 125,
        "sens.forest_cover_change": -4.5,
        "haz.flood_events": 0.5,
    }
    rows.extend(row(area, code, value) for code, value in valid.items())
    rows.append(
        row(area, "sens.elderly_share", 100, area_code=" " + area["code"].upper() + " ")
    )
    rows.append(row(areas[1], "exp.population_density", ""))
    response = upload(client, admin_headers, csv_text(rows, COLUMNS))
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["rows_accepted"], result["rows_rejected"]) == (
        len(valid),
        len(invalid) + 1,
    )
    reasons = {item["row"]: item["reason"] for item in result["rejections"]}
    for index, (_, _, _, reason) in enumerate(invalid, start=2):
        assert reason in reasons[index]
    assert f"duplicate of row {len(invalid) + 2}" in reasons[len(rows)]
    facts = stored_values(factory, areas)
    assert len(facts) == len(valid)
    assert all(item.admin_unit_id == area["admin_unit_id"] for item in facts)
    assert sorted(item.value for item in facts) == sorted(valid.values())
    with factory() as session:
        ingestion = session.get(VraIngestion, result["ingestion_id"])
        assert ingestion.rejections == result["rejections"]
        assert ingestion.status == "completed"


@pytest.mark.parametrize(
    "header,reason",
    [
        ("area_code,indicator_code,value,vintage,value\n", "duplicate"),
        ("area_code,indicator_code,value,vintage,typo\n", "unexpected"),
        ("area_code,value\n", "missing required"),
        ('"area_code,indicator_code,value,vintage\n', "malformed"),
    ],
)
def test_malformed_header_is_actionable_and_writes_nothing(
    client, admin_headers, vra_frame, header, reason
):
    factory, areas = vra_frame
    response = upload(client, admin_headers, header)
    assert response.status_code == 422, response.text
    assert response.json()["error"] == "VRA_CSV_HEADER_INVALID"
    assert response.json()["message"].startswith("Row 1:")
    assert reason in response.json()["message"]
    assert stored_values(factory, areas) == []
    with factory() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(VraIngestion)
                .where(VraIngestion.frame_geography_id == FRAME)
            )
            == 0
        )


def test_legacy_csv_and_wrong_width_rows_keep_valid_rows(
    client, admin_headers, vra_frame
):
    factory, areas = vra_frame
    text = csv_text([row(areas[0], "exp.population_density", 23)])
    text += "too,few,columns\n" + ",".join(["extra"] * 9) + "\n"
    response = upload(client, admin_headers, text)
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["rows_accepted"], result["rows_rejected"]) == (1, 2)
    assert [item["row"] for item in result["rejections"]] == [3, 4]
    assert "expected 8 columns, found 3" in result["rejections"][0]["reason"]
    assert "expected 8 columns, found 9" in result["rejections"][1]["reason"]
    facts = stored_values(factory, areas)
    assert [item.value for item in facts] == [23]
    blank = upload(
        client, admin_headers, csv_text([row(areas[1], "exp.population_density", "")])
    )
    assert blank.json()["status"] == "failed"
    assert (blank.json()["rows_accepted"], blank.json()["rows_rejected"]) == (0, 0)
    assert [item.id for item in stored_values(factory, areas)] == [facts[0].id]


def test_unrecoverable_csv_quoting_rejects_whole_file_before_writing(
    client, admin_headers, vra_frame
):
    factory, areas = vra_frame
    first = row(areas[0], "exp.population_density", 23)
    last = row(areas[1], "exp.population_density", 24)
    suffix = csv_text([last]).split("\n", 1)[1]
    text = csv_text([first]) + '"unterminated field\n' + suffix
    response = upload(client, admin_headers, text)
    assert response.status_code == 422, response.text
    assert response.json()["error"] == "VRA_CSV_INVALID"
    assert response.json()["message"].startswith("Row 3:")
    assert "no values were saved" in response.json()["message"]
    assert stored_values(factory, areas) == []
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIngestion)) == 0
    retry = upload(client, admin_headers, csv_text([first, last]))
    assert retry.status_code == 200, retry.text
    assert (retry.json()["rows_accepted"], retry.json()["rows_rejected"]) == (2, 0)
    assert sorted(item.value for item in stored_values(factory, areas)) == [23, 24]


def test_leaf_reader_cannot_expand_vra_access_to_parent_or_siblings(
    client, admin_headers, tokens, vra_frame
):
    factory, areas = vra_frame
    own = "geo-in-madhya-pradesh-district-bhopal"
    sibling = "geo-in-madhya-pradesh-district-raisen"
    parent = "geo-in-madhya-pradesh-division-bhopal"
    headers = tokens["district-planner"]
    profile = client.get("/auth/me", headers=headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["geographyScopes"] == [
        "/india/state/madhya-pradesh/division/bhopal/district/bhopal"
    ]
    assert client.get("/vra/indicators", headers=headers).status_code == 200
    for requested in (own, sibling, parent):
        for suffix in ("assessment", "map", f"areas/{own}", f"areas/{sibling}"):
            response = client.get(f"/vra/{requested}/{suffix}", headers=headers)
            assert (response.status_code, response.json()["error"]) == (
                403,
                "GEOGRAPHY_OUT_OF_SCOPE",
            ), response.text
    for method, suffix in (
        ("get", "template.csv"),
        ("get", "coverage"),
        ("post", "runs"),
        ("post", "values"),
    ):
        response = client.request(
            method,
            f"/vra/{own}/{suffix}",
            headers={**headers, "Content-Type": "text/csv"},
            content=(
                csv_text([row(areas[0], "exp.population_density", 25)])
                if suffix == "values"
                else None
            ),
        )
        assert (response.status_code, response.json()["error"]) == (
            403,
            "ROLE_NOT_ALLOWED",
        )
    # The parent frame remains usable by a planner whose actual scope covers it.
    response = client.get(f"/vra/{own}/assessment", headers=tokens["india-planner"])
    assert response.status_code == 200, response.text
    assert response.json()["geography_id"] == parent
    assert len(response.json()["areas"]) > 1
    assert {own, sibling} <= {area["geography_id"] for area in response.json()["areas"]}
    # Country administrators retain their explicit country scope and may obtain
    # the whole district comparison template through a leaf link.
    assert client.get("/auth/me", headers=admin_headers).json()["geographyScopes"] == [
        "/india"
    ]
    template = client.get(f"/vra/{own}/template.csv", headers=admin_headers)
    assert template.status_code == 200, template.text
    assert len(
        {item["area_code"] for item in csv.DictReader(io.StringIO(template.text))}
    ) == len(response.json()["areas"])
    assert stored_values(factory, areas) == []
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIngestion)) == 0
        assert session.scalar(select(func.count()).select_from(VraRun)) == 0


def test_vra_mutations_and_templates_enforce_role_and_geography_scope(
    client, admin_headers, tokens, vra_frame
):
    factory, areas = vra_frame
    text = csv_text([row(areas[0], "exp.population_density", 25)])
    for headers, expected in (
        ({}, 401),
        (tokens["india-planner"], 403),
        (tokens["denied"], 403),
    ):
        assert upload(client, headers, text).status_code == expected
        assert (
            upload(
                client, headers, text, indicator_code="exp.population_density"
            ).status_code
            == expected
        )
        assert (
            client.get(f"/vra/{FRAME}/template.csv", headers=headers).status_code
            == expected
        )
        assert (
            client.post(f"/vra/{FRAME}/runs", headers=headers).status_code == expected
        )
    for method, path in (
        ("get", "template.csv"),
        ("get", "coverage"),
        ("post", "runs"),
        ("post", "values"),
    ):
        response = client.request(
            method,
            f"/vra/geo-ke/{path}",
            headers={**admin_headers, "Content-Type": "text/csv"},
            content=text if path == "values" else None,
        )
        assert response.status_code == 403, response.text
    assert (
        client.get(
            f"/vra/{FRAME}/assessment", headers=tokens["india-planner"]
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/vra/{FRAME}/assessment", headers=tokens["kenya-planner"]
        ).status_code
        == 403
    )
    assert stored_values(factory, areas) == []
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(VraIngestion)) == 0
        assert session.scalar(select(func.count()).select_from(VraRun)) == 0
