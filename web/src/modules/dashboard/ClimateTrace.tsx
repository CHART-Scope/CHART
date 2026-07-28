import type { ClimateMonth } from "../../lib/predictionClient";

export function ClimateTrace({ rows }: { rows: ClimateMonth[] }) {
  const orderedForDisplay = [...rows].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const orderedForModel = [...orderedForDisplay].reverse();
  const isProjection = rows.some((row) => row.source_class === "projection");

  return (
    <section className="prediction-temperature-section" aria-label="Temperature input">
      <div className="prediction-temperature-heading">
        <div>
          <span>Temperature input</span>
          <strong>
            {isProjection
              ? "The three future monthly values CHART checked"
              : "The three monthly values CHART retrieved"}
          </strong>
        </div>
        <small>
          {isProjection
            ? "Each value is the monthly average across the selected future period."
            : "Each value is the monthly average of daily maximum temperature."}
        </small>
      </div>

      <div className="prediction-temperature-layout">
        <div className="prediction-temperature-cards">
          {orderedForDisplay.map((row) => (
            <article key={row.month} className="prediction-temperature-card">
              <span>
                {row.projection_period ? formatProjectionMonth(row.month) : row.month}
              </span>
              <small className="prediction-temperature-kind">
                {climateSourceUse(row)}
              </small>
              <strong>
                {row.temperature_c === null
                  ? "Waiting"
                  : `${row.temperature_c.toFixed(1)}°C`}
              </strong>
              <p>{row.source_name ?? `Waiting for ${row.expected_source_name}`}</p>
              <small>
                {row.source_issue_time
                  ? `Issued ${formatDay(row.source_issue_time.slice(0, 10))}`
                  : ""}
                {row.scenario ? `${formatScenario(row.scenario)}` : ""}
                {row.projection_period
                  ? ` · ${row.projection_period.replace("-", "–")} average`
                  : ""}
                {row.ensemble_summary ? ` · ${row.ensemble_summary}` : ""}
              </small>
              {row.downloaded_at || row.raw_file_hash ? (
                <small>
                  {row.downloaded_at
                    ? `Downloaded ${formatDay(row.downloaded_at.slice(0, 10))}`
                    : ""}
                  {row.downloaded_at && row.raw_file_hash ? " · " : ""}
                  {row.raw_file_hash ? `Record ${row.raw_file_hash.slice(0, 10)}…` : ""}
                </small>
              ) : null}
              {row.status === "sample" ? (
                <small className="prediction-climate-sample">
                  Test data — not allowed in a live estimate
                </small>
              ) : null}
              {row.source_uri ? (
                <a href={row.source_uri} target="_blank" rel="noreferrer">
                  View source
                </a>
              ) : null}
            </article>
          ))}
        </div>

        <aside className="prediction-model-input">
          <span>What enters the model</span>
          <strong>Three values, kept separate</strong>
          <ol>
            {orderedForModel.map((row, index) => (
              <li key={row.month}>
                <span>{index + 1}</span>
                <div>
                  <strong>
                    {row.temperature_c === null
                      ? "Waiting"
                      : `${row.temperature_c.toFixed(1)}°C`}
                  </strong>
                  <small>
                    {row.projection_period
                      ? formatProjectionMonth(row.month)
                      : row.month}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <p>
            The latest month goes first. The model combines the three values into one
            cumulative result; CHART does not average them into one temperature.
          </p>
        </aside>
      </div>
    </section>
  );
}

function climateSourceUse(row: ClimateMonth) {
  const sourceClass = row.source_class ?? row.expected_source_class;
  if (sourceClass === "observed") return "Historical";
  if (sourceClass === "seasonal") return "Seasonal forecast";
  if (sourceClass === "projection") return "Long-term projection";
  return "Expected input";
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatProjectionMonth(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

function formatScenario(value: string) {
  if (value === "ssp126") return "Lower emissions (SSP1-2.6)";
  if (value === "ssp370") return "High emissions (SSP3-7.0)";
  if (value === "ssp585") return "Very high emissions (SSP5-8.5)";
  return value;
}
