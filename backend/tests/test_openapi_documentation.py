from __future__ import annotations

from chart.api.app import app


HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put"}


def test_every_openapi_operation_has_distinct_detailed_documentation() -> None:
    schema = app.openapi()
    operations = [
        operation
        for path_item in schema["paths"].values()
        for method, operation in path_item.items()
        if method in HTTP_METHODS
    ]

    summaries = [operation["summary"] for operation in operations]
    descriptions = [operation["description"] for operation in operations]

    assert len(operations) == 35
    assert len(summaries) == len(set(summaries))
    assert len(descriptions) == len(set(descriptions))
    assert all(len(summary) >= 24 for summary in summaries)
    assert all(len(description) >= 120 for description in descriptions)


def test_every_success_response_explains_its_endpoint_result() -> None:
    schema = app.openapi()
    success_descriptions = []

    for path_item in schema["paths"].values():
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            for status, response in operation["responses"].items():
                if status.startswith("2"):
                    description = response["description"]
                    assert description != "Successful Response"
                    assert len(description) >= 50
                    success_descriptions.append(description)

    assert len(success_descriptions) == len(set(success_descriptions))
