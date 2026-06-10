import { DataCard } from "../ui/DataCard";
import { getHealthResilienceScore } from "./dashboardMockData";

type HealthResilienceCardProps = {
  geographyId?: string;
};

export function HealthResilienceCard({ geographyId }: HealthResilienceCardProps) {
  const { score, maxScore, label } = getHealthResilienceScore(geographyId);
  const percentage = Math.round((score / maxScore) * 100);

  return (
    <DataCard eyebrow="Preparedness" title="Health resilience score">
      <div className="resilience-score-display">
        <div className="resilience-score-value">
          <strong>{score}</strong>
          <span>/ {maxScore}</span>
        </div>
        <div className="resilience-bar-track">
          <div className="resilience-bar-fill" style={{ width: `${percentage}%` }} />
        </div>
        <small className="resilience-label">{label}</small>
      </div>
    </DataCard>
  );
}
