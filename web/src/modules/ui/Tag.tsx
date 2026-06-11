import type { ReactNode } from "react";

import "./Tag.css";

type TagProps = {
  children: ReactNode;
  muted?: boolean;
};

export function Tag({ children, muted = false }: TagProps) {
  return <span className={`ui-tag${muted ? " ui-tag-muted" : ""}`}>{children}</span>;
}

type TagListProps = {
  emptyLabel?: string;
  labels: string[];
};

export function TagList({ emptyLabel = "Not classified yet", labels }: TagListProps) {
  if (labels.length === 0) {
    return <Tag muted>{emptyLabel}</Tag>;
  }

  return (
    <div className="ui-tag-list">
      {labels.map((label) => (
        <Tag key={label}>{label}</Tag>
      ))}
    </div>
  );
}
