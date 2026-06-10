import { DataCard } from "../ui/DataCard";
import { RiskGroupItem } from "../ui/RiskGroupItem";
import { getRiskGroups } from "./dashboardMockData";

type HighestRiskGroupsCardProps = {
  geographyId?: string;
};

export function HighestRiskGroupsCard({ geographyId }: HighestRiskGroupsCardProps) {
  const groups = getRiskGroups(geographyId);

  return (
    <DataCard eyebrow="Vulnerability" title="Highest-risk groups">
      <div className="risk-group-list">
        {groups.map((group) => (
          <RiskGroupItem
            key={group.rank}
            rank={group.rank}
            groupName={group.groupName}
            healthEffect={group.healthEffect}
          />
        ))}
      </div>
    </DataCard>
  );
}
