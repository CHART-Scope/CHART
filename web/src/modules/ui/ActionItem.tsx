import "./ActionItem.css";

type ActionItemProps = {
  title: string;
  assignee?: string;
  status: string;
  statusVariant?: "to-do" | "in-progress" | "done" | "review" | "waiting";
};

export function ActionItem({
  title,
  assignee,
  status,
  statusVariant,
}: ActionItemProps) {
  return (
    <div className="action-item-row">
      <div className="action-item-info">
        <strong>{title}</strong>
        {assignee ? <span>{assignee}</span> : null}
      </div>
      <span className={`status-chip ${statusVariant ?? "to-do"}`}>{status}</span>
    </div>
  );
}
