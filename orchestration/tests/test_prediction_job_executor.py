"""The prediction job runs its steps in one process.

Both steps take about a second; Dagster's default multiprocess executor
started a fresh Python per step and re-imported the pipeline, 10-12 s each on
the server (measured from the run's event log on 2026-10-16). A planner opening
an unscored month waited on that, so the job must keep the in-process executor.
"""

from __future__ import annotations

import dagster as dg

from chart_pipeline.definitions import prediction_request_job


def test_prediction_job_does_not_spawn_a_process_per_step() -> None:
    assert prediction_request_job.executor_def is dg.in_process_executor
    assert {node.name for node in prediction_request_job.graph.nodes} == {
        "ensure_climate_inputs",
        "score_prediction",
    }
