import { Icon } from "@/components/Icon";

import { costLevels, districtFill, type Action } from "./actionCatalog";
import styles from "./ActionCard.module.css";
import { statusLabels, type ActionStatus } from "./useActionProgress";

type Props = {
  action: Action;
  status: ActionStatus;
  assignedCount: number;
  selected: boolean;
  onOpen: () => void;
};

export function ActionCard({ action, status, assignedCount, selected, onOpen }: Props) {
  const districts = action.priorityDistricts;
  const named = districts.slice(0, 2).map((item) => item.district);
  const more = districts.length - named.length;
  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      onClick={onOpen}
    >
      <span className={styles.thumb} aria-hidden>
        <Icon name={action.icon} size={30} />
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{action.title}</span>
        <span className={styles.meta}>
          <span className={styles.tag}>{action.department}</span>
          <span className={styles.tag}>{action.actionType}</span>
          <span className={styles.tag}>
            {action.cost} cost · {"₹".repeat(costLevels.indexOf(action.cost) + 1)}
          </span>
          <span className={`${styles.status} ${styles[status]}`}>
            {statusLabels[status]}
          </span>
        </span>
        {districts.length > 0 ? (
          <span className={styles.districts}>
            {districts.map((item) => (
              <span
                key={item.district}
                className={styles.dot}
                style={{ background: districtFill(item.percent) }}
              />
            ))}
            <span>
              {named.join(", ")}
              {more > 0 ? ` +${more} more` : ""} at elevated risk
              {assignedCount > 0 ? ` · assigned to ${assignedCount}` : ""}
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}
