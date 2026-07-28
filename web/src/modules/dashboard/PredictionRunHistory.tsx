import type { PredictionRequestSummary } from "../../lib/predictionClient";

type PredictionRunHistoryProps = {
  items: PredictionRequestSummary[];
  selectedRequestId: number | null;
  isLoading: boolean;
  onSelect: (run: PredictionRequestSummary) => void;
};

export function PredictionRunHistory({
  items,
  selectedRequestId,
  isLoading,
  onSelect,
}: PredictionRunHistoryProps) {
  return (
    <section className="prediction-run-history" aria-label="Recent prediction runs">
      <div className="prediction-run-history-heading">
        <strong>Recent runs</strong>
        <small>Saved automatically</small>
      </div>
      {isLoading ? (
        <p>Loading saved runs…</p>
      ) : items.length === 0 ? (
        <p>No prediction runs yet.</p>
      ) : (
        <div className="prediction-run-history-list">
          {items.map((run) => (
            <button
              key={run.request_id}
              type="button"
              aria-pressed={selectedRequestId === run.request_id}
              onClick={() => onSelect(run)}
            >
              <span>
                <strong>{runLabel(run)}</strong>
                <small>
                  Request {run.request_id} · {formatCreatedAt(run.created_at)}
                </small>
              </span>
              <span
                className={`prediction-run-status prediction-run-status-${run.status}`}
              >
                {statusLabel(run.status)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function runLabel(run: PredictionRequestSummary) {
  if (run.planning_target === "next_three_months") return "Next 3 months";
  if (run.planning_target === "next_heat_season") return "Next hot season";
  if (run.planning_target === "long_term_hot_season") {
    return `${scenarioLabel(run.projection_scenario)} · ${run.projection_period?.replace("-", "–") ?? "future"}`;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${run.planning_date.slice(0, 7)}-01T00:00:00Z`));
}

function scenarioLabel(value: PredictionRequestSummary["projection_scenario"]) {
  if (value === "ssp126") return "Lower emissions";
  if (value === "ssp370") return "High emissions";
  if (value === "ssp585") return "Very high emissions";
  return "Long-term scenario";
}

function statusLabel(status: PredictionRequestSummary["status"]) {
  if (status === "waiting") return "Waiting for forecast";
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  return "Failed";
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
