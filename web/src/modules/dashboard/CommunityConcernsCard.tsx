import { DataCard } from "../ui/DataCard";
import { getCommunityConcerns } from "./dashboardMockData";

type CommunityConcernsCardProps = {
  geographyId?: string;
};

export function CommunityConcernsCard({ geographyId }: CommunityConcernsCardProps) {
  const concerns = getCommunityConcerns(geographyId);

  return (
    <DataCard eyebrow="Community" title="Top community concerns">
      <div className="community-concerns-list">
        {concerns.map((concern) => (
          <div className="community-concern-row" key={concern.id}>
            <span>{concern.label}</span>
            <small>{concern.mentions} mentions</small>
          </div>
        ))}
      </div>
    </DataCard>
  );
}
