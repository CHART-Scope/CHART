import type { ReactNode } from "react";

import "./OptionCard.css";

type OptionCardProps = {
  description?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  selected: boolean;
  onToggle: () => void;
};

export function OptionCard({
  description,
  icon,
  label,
  selected,
  onToggle,
}: OptionCardProps) {
  const classes = [
    "ui-option-card",
    description ? "ui-option-card-detailed" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button aria-pressed={selected} className={classes} type="button" onClick={onToggle}>
      {icon ? (
        <span className="ui-option-card-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ui-option-card-body">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </button>
  );
}
