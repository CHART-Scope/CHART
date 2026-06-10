import { ActionItem } from "../ui/ActionItem";
import { DataCard } from "../ui/DataCard";
import { getPendingActions } from "./dashboardMockData";

type PendingActionsCardProps = {
  geographyId?: string;
};

export function PendingActionsCard({ geographyId }: PendingActionsCardProps) {
  const actions = getPendingActions(geographyId);

  return (
    <DataCard eyebrow="Actions" title="Pending actions">
      <div className="pending-actions-list">
        {actions.map((action) => (
          <ActionItem
            key={action.id}
            title={action.title}
            assignee={action.assignee}
            status={action.status}
            statusVariant={action.statusVariant}
          />
        ))}
      </div>
    </DataCard>
  );
}
