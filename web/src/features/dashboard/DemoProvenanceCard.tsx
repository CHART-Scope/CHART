"use client";

/**
 * DEMO-ONLY provenance card. Safe to delete.
 *
 * Shows where the temperature on screen came from: which ERA5 statistic, which
 * climate run, which model read it, and against what reference. Built so the
 * data lineage can be shown in a demo without committing the product to a
 * design for it.
 *
 * To remove: delete every line marked DEMO-ONLY in HeatLbwLinkPanel.tsx, then
 * delete this file and DemoProvenanceCard.module.css. Verified to leave
 * typecheck and build clean.
 *
 * It takes only values the caller already holds and adds no fetch, no shared
 * type and no prop change to any existing component, so removing it cannot
 * affect anything around it. The model_* and n_* fields on the monthly
 * prediction exist for this card and can go with it.
 */

import { type AreaBoundingBox, type MonthlyRiskValues } from "@/lib/dashboardClient";

import styles from "./DemoProvenanceCard.module.css";

/** Kept in step with pipelines/era5_heat/src/era5_heat/cds_client.py. */
const CDS_DATASET = "reanalysis-era5-single-levels";
const CDS_VARIABLE = "2m_temperature";

function formatMonth(month: string): string {
  if (!month) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** Degrees to 4dp with a hemisphere letter, the way a CDS `area` is written. */
function degrees(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? positive : negative}`;
}

function artifactHref(uri: string): string | null {
  if (uri.startsWith("https://") || uri.startsWith("http://")) return uri;
  if (uri.startsWith("s3://")) {
    const [bucket, ...keyParts] = uri.slice("s3://".length).split("/");
    if (!bucket || !/^[a-z0-9.-]+$/.test(bucket) || keyParts.length === 0) return null;
    const encodedKey = keyParts.map(encodeURIComponent).join("/");
    // The global endpoint routes to the bucket's own region, so no bucket
    // name or region is hardcoded here.
    return `https://${bucket}.s3.amazonaws.com/${encodedKey}`;
  }
  return null;
}

export function DemoProvenanceCard({
  month,
  entry,
  areaBbox = null,
}: {
  month: string;
  entry: MonthlyRiskValues | null;
  areaBbox?: AreaBoundingBox | null;
}) {
  const temperature = entry?.temperature ?? null;
  const exposure = entry?.prediction?.exposure_temperatures_c ?? [];
  const dates = entry?.prediction?.exposure_dates ?? [];
  const prediction = entry?.prediction ?? null;

  return (
    <section className={styles.card} aria-label="Data and model provenance">
      <div className={styles.header}>
        <p className={styles.title}>Where this number comes from</p>
      </div>

      {temperature === null && prediction == null ? (
        <p className={styles.empty}>Nothing recorded for {formatMonth(month)} yet.</p>
      ) : (
        <dl className={styles.rows}>
          <dt>Month</dt>
          <dd>{formatMonth(month)}</dd>

          {temperature ? (
            <>
              <dt>Temperature</dt>
              <dd>
                {temperature.tmax_monthly_mean_c.toFixed(2)}
                {temperature.unit === "degC" ? "°C" : ` ${temperature.unit}`}
              </dd>
              <dt>Statistic</dt>
              <dd>Mean of daily maximum temperature, across the month</dd>
              {exposure.length > 1 ? (
                <>
                  <dt>Model reads</dt>
                  {/* The model scores a window, not the one month on the
                      card. Two months can show the same temperature and
                      return different answers because their earlier months
                      differ - without this row that looks like a bug. */}
                  <dd>
                    {exposure.map((value) => `${value.toFixed(1)}°C`).join(" · ")}
                    <span className={styles.hint}>
                      {dates.length === exposure.length
                        ? " (selected day and the days before)"
                        : " (selected month and the two before)"}
                    </span>
                  </dd>
                </>
              ) : null}
              <dt>Source</dt>
              <dd>
                {/* Links to the CDS catalogue entry for the dataset this
                    number is pulled from. The Climate Data Store has no
                    stable per-location URL - a region is chosen as an `area`
                    bbox inside a download request, not addressed by link -
                    so this points at the dataset itself and the request
                    parameters below say which slice of it was read. */}
                <a
                  href={`https://cds.climate.copernicus.eu/datasets/${CDS_DATASET}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {temperature.source_name ?? "unknown"}
                </a>
              </dd>
              <dt>Dataset</dt>
              <dd>
                {CDS_DATASET} · {CDS_VARIABLE}
              </dd>
              {areaBbox ? (
                <>
                  <dt>Area requested</dt>
                  {/* The literal north/west/south/east the Climate Data Store
                      request was made over, in the order CDS takes them. This
                      is the closest thing to a location the dataset has. */}
                  <dd>
                    {degrees(areaBbox.north, "N", "S")},{" "}
                    {degrees(areaBbox.west, "E", "W")},{" "}
                    {degrees(areaBbox.south, "N", "S")},{" "}
                    {degrees(areaBbox.east, "E", "W")}
                  </dd>
                </>
              ) : null}
              <dt>Data kind</dt>
              <dd>{temperature.data_label}</dd>
              <dt>Climate run</dt>
              <dd>#{temperature.climate_run_id}</dd>
            </>
          ) : (
            <>
              <dt>Temperature</dt>
              <dd>no observation recorded</dd>
            </>
          )}

          {prediction ? (
            <>
              <dt>Model</dt>
              <dd>{prediction.model_version}</dd>
              <dt>Release</dt>
              <dd>
                <code>{prediction.model_release_id}</code>
              </dd>
              <dt>Artifact</dt>
              <dd>
                <code>{prediction.model_file ?? "Not recorded"}</code>
              </dd>
              {/* The exact file that scored this month: the local copy when
              the API runs in development, the published S3 object otherwise. */}
              {prediction.model_runtime_path ? (
                <>
                  <dt>Model file used</dt>
                  <dd>
                    <code>{prediction.model_runtime_path}</code>
                  </dd>
                </>
              ) : prediction.model_artifact_uri ? (
                <>
                  <dt>Model file used</dt>
                  <dd>
                    {artifactHref(prediction.model_artifact_uri) ? (
                      <a
                        href={artifactHref(prediction.model_artifact_uri) ?? undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {prediction.model_artifact_uri}
                      </a>
                    ) : (
                      <code>{prediction.model_artifact_uri}</code>
                    )}
                  </dd>
                </>
              ) : null}
              {prediction.model_artifact_sha256 ? (
                <>
                  <dt>SHA-256</dt>
                  <dd>
                    <code>{prediction.model_artifact_sha256}</code>
                  </dd>
                </>
              ) : null}
              {prediction.n_training ? (
                <>
                  <dt>Fitted sample</dt>
                  <dd>{prediction.n_training.toLocaleString()} observations</dd>
                </>
              ) : null}
              {prediction.n_subjects ? (
                <>
                  <dt>Subjects</dt>
                  <dd>{prediction.n_subjects.toLocaleString()}</dd>
                </>
              ) : null}
              {prediction.n_events != null ? (
                <>
                  <dt>Events</dt>
                  <dd>{prediction.n_events.toLocaleString()}</dd>
                </>
              ) : null}
              <dt>Model reads</dt>
              <dd>{prediction.input_statistic}</dd>
              <dt>Reference</dt>
              <dd>
                {typeof prediction.reference_temperature_c === "number" ? (
                  <>
                    {prediction.reference_temperature_c.toFixed(2)}°C
                    {prediction.reference_kind ? ` (${prediction.reference_kind})` : ""}
                  </>
                ) : (
                  "Not declared"
                )}
              </dd>
              <dt>Odds ratio</dt>
              <dd>
                {prediction.odds_ratio.toFixed(3)} (95% CI{" "}
                {prediction.ci95_low.toFixed(2)}–{prediction.ci95_high.toFixed(2)})
              </dd>
              <dt>Prediction</dt>
              <dd>#{prediction.request_id}</dd>
            </>
          ) : (
            <>
              <dt>Model</dt>
              <dd>no prediction stored for this month</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
