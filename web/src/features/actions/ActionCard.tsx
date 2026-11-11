import { Icon } from "@/components/Icon";

import { actionTypeIcon, type Action } from "./actionCatalog";
import styles from "./ActionCard.module.css";
import { PriorityAreasLine, type PriorityAreas } from "./PriorityAreas";
import { statusLabels, type ActionStatus } from "./useActionProgress";

type Props = {
  action: Action;
  status: ActionStatus;
  priority: PriorityAreas | null;
  selected: boolean;
  onOpen: () => void;
};

export function ActionCard({ action, status, priority, selected, onOpen }: Props) {
  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected || undefined}
      onClick={onOpen}
    >
      <span className={styles.thumb} aria-hidden>
        <Icon name={actionTypeIcon(action.action_types[0])} size={30} />
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{action.title}</span>
        <span className={styles.meta}>
          {[...action.departments, ...action.action_types].map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
          {action.cost_level ? (
            <span className={styles.tag}>Cost: {action.cost_level}</span>
          ) : null}
          <span className={`${styles.status} ${styles[status]}`}>
            {statusLabels[status]}
          </span>
        </span>
        <PriorityAreasLine priority={priority} variant="list" />
      </span>
    </button>
  );
}
