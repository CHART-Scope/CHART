import { Icon } from "@/components/Icon";

import { actionTypeIcon, type Action } from "./actionCatalog";
import styles from "./ActionCard.module.css";
import { statusLabels, type ActionStatus } from "./useActionProgress";

type Props = {
  action: Action;
  status: ActionStatus;
  selected: boolean;
  onOpen: () => void;
};

export function ActionCard({ action, status, selected, onOpen }: Props) {
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
        {action.summary ? (
          <span className={styles.summary}>{action.summary}</span>
        ) : null}
      </span>
    </button>
  );
}
