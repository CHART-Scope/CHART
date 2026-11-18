import { useMemo, useState } from "react";

import { useSession } from "@/features/auth/WorkspaceSession";
import { RISK_BANDS, SpatialRiskMap } from "@/features/dashboard/SpatialRiskMap";
import { fetchRiskMap } from "@/lib/dashboardClient";
import { fetchHeatOutlookMap } from "@/lib/heatOutlookClient";
import type { PlanDistrictArea, PlanDistricts } from "@/lib/savedPlansClient";

import styles from "./ConfigurePlan.module.css";

type Props = {
  placeId: string;
  placeName: string;
  outcomeLabel: string;
  districts: PlanDistricts;
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
};

/**
 * Step 3 (canvas frame 12): the districts to focus on, ranked by
 * attributable share, the suggested ones pre-ticked; choose on the list or
 * the map.
 */
export function DistrictsStep({
  placeId,
  placeName,
  outcomeLabel,
  districts,
  selected,
  onChange,
}: Props) {
  const { accessToken } = useSession();
  const [query, setQuery] = useState("");
  const { areas, source, outcome } = districts;
  const suggested = areas.filter((area) => area.suggested);
  const others = areas.filter((area) => !area.suggested);
  const level = (areas[0]?.level ?? "district").toLowerCase();
  const plural = level.endsWith("y") ? `${level.slice(0, -1)}ies` : `${level}s`;
  const match = (area: PlanDistrictArea) =>
    area.name.toLowerCase().includes(query.trim().toLowerCase());
  const toggle = (geographyId: string) => {
    const next = new Set(selected);
    if (next.has(geographyId)) next.delete(geographyId);
    else next.add(geographyId);
    onChange(next);
  };
  // The map draws the same values the ranking was made from.
  const mapSource = useMemo(
    () => ({
      key: `plan-districts:${source}:${outcome}`,
      cacheScope: `plan-districts-${source}`,
      load: (token: string, geometry = true) =>
        source === "projection"
          ? fetchHeatOutlookMap(placeId, token, { outcome }, geometry)
          : fetchRiskMap(placeId, token, { outcome, geometry }),
    }),
    [placeId, source, outcome],
  );

  return (
    <section className={styles.card} aria-labelledby="step-title">
      <h2 id="step-title" className={styles.cardTitle}>
        {`${plural[0].toUpperCase()}${plural.slice(1)} of focus`}
      </h2>
      <p className={styles.cardLede}>
        {`${plural[0].toUpperCase()}${plural.slice(1)}`} in {placeName} are ranked by
        the share of {outcomeLabel.toLowerCase()} attributable to heat,{" "}
        {source === "projection"
          ? "in an average year of the published projection"
          : "from the latest observed estimates"}
        . Those at 5% or more are pre-selected as suggestions — add or remove any, on
        the list or the map.
      </p>
      <div className={styles.districtTools}>
        <input
          type="search"
          className={styles.search}
          aria-label={`Search ${plural}`}
          placeholder={`Search ${plural}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => onChange(new Set(suggested.map((area) => area.geography_id)))}
        >
          Suggested ({suggested.length})
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => onChange(new Set(areas.map((area) => area.geography_id)))}
        >
          Select all
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => onChange(new Set())}
        >
          Clear
        </button>
        <span className={styles.count} role="status">
          {selected.size} of {areas.length} selected
        </span>
      </div>
      <div className={styles.districtLayout}>
        <div className={styles.districtList}>
          {[
            { title: `Suggested to prioritise (${suggested.length})`, rows: suggested },
            { title: `Other ${plural} (${others.length})`, rows: others },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <fieldset key={group.title} className={styles.districtGroup}>
                <legend className={styles.districtGroupTitle}>{group.title}</legend>
                {group.rows.filter(match).map((area) => (
                  <label key={area.geography_id} className={styles.districtRow}>
                    <input
                      type="checkbox"
                      className={styles.choiceInput}
                      checked={selected.has(area.geography_id)}
                      onChange={() => toggle(area.geography_id)}
                    />
                    <span
                      className={styles.bandDot}
                      style={{ background: bandFill(area) }}
                      aria-hidden
                    />
                    <span className={styles.districtName}>{area.name}</span>
                    <span className={styles.districtShare}>
                      {area.value_percent !== null
                        ? `${area.value_percent.toFixed(1)}%`
                        : area.missing_reason === "no_model"
                          ? "No model"
                          : "No estimate"}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
        </div>
        <div className={styles.districtMap}>
          <SpatialRiskMap
            embedded
            geographyId={placeId}
            placeName={placeName}
            accessToken={accessToken ?? undefined}
            outcome={outcome}
            source={mapSource}
            selectedGeographyIds={selected}
            onSelect={toggle}
          />
        </div>
      </div>
    </section>
  );
}

/** The map's colour for a district's share; none without one. */
function bandFill(area: PlanDistrictArea) {
  if (area.value_percent === null) return "var(--surface-muted)";
  return RISK_BANDS.find((band) => (area.value_percent as number) < band.upper)!.fill;
}
