import "./KpiCard.css";

type KpiCardProps = {
  label: string;
  value: string;
  detail?: string;
  trend?: "up" | "down" | "neutral";
  accentColor?: string;
};

export function KpiCard({ label, value, detail, trend, accentColor }: KpiCardProps) {
  return (
    <article
      className="kpi-card"
      style={accentColor ? { borderTopColor: accentColor } : undefined}
    >
      <span className="kpi-card-label">{label}</span>
      <strong className="kpi-card-value">{value}</strong>
      {detail ? (
        <small className="kpi-card-detail">
          {trend === "up" ? <span className="kpi-trend up">&#9650;</span> : null}
          {trend === "down" ? <span className="kpi-trend down">&#9660;</span> : null}
          {detail}
        </small>
      ) : null}
    </article>
  );
}
