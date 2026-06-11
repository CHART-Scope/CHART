import type { LandingToolkitPreview } from "../../content/landing";

export function DashboardLaptopPreview() {
  return (
    <figure className="laptop-preview" aria-label="CHART dashboard preview">
      <img
        src="/landing/chart-dashboard-hero.png"
        alt="CHART dashboard preview on a laptop"
        width={596}
        height={360}
      />
    </figure>
  );
}

export function ToolkitPreviewCard({
  preview,
  compact = false,
}: {
  preview: LandingToolkitPreview;
  compact?: boolean;
}) {
  const compactClassName = compact ? " is-compact" : "";

  if (preview === "risk") {
    return (
      <div
        className={`toolkit-preview risk-preview${compactClassName}`}
        aria-hidden="true"
      >
        <h4>Implications of extreme heat on infant mortality</h4>
        <div className="risk-chart">
          <span className="risk-band" />
          <span className="risk-line" />
          <span className="risk-axis x" />
          <span className="risk-axis y" />
        </div>
      </div>
    );
  }

  if (preview === "vra") {
    return (
      <div
        className={`toolkit-preview vra-preview${compactClassName}`}
        aria-hidden="true"
      >
        <h4>Health facility infrastructure vulnerability</h4>
        <div className="vra-pill-row">
          <span>Lower risk</span>
          <span>Medium risk</span>
          <span>Higher risk</span>
        </div>
        <div className="vra-question">
          <strong>Does the facility retain services during shocks?</strong>
          <span>Yes</span>
          <span>Sometimes</span>
          <span>No</span>
        </div>
        <div className="vra-input" />
      </div>
    );
  }

  return (
    <div
      className={`toolkit-preview solutions-preview${compactClassName}`}
      aria-hidden="true"
    >
      {[
        "Gender-responsive heat action plans",
        "Heat-responsive building codes",
        "Urban greening",
        "Reflective roofs",
        "Early warning systems",
        "Heat health awareness",
      ].map((title) => (
        <div className="solution-tile" key={title}>
          <span />
          <strong>{title}</strong>
          <small>Policy initiative</small>
        </div>
      ))}
    </div>
  );
}
