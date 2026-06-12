import type { ReactNode, SelectHTMLAttributes } from "react";

import "./Select.css";

export type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: ReactNode;
  options: SelectOption[];
  placeholder?: string;
};

export function Select({
  className,
  label,
  options,
  placeholder,
  ...selectProps
}: SelectProps) {
  const classes = ["ui-select", className ?? ""].filter(Boolean).join(" ");

  return (
    <label className={classes}>
      {label ? <span className="ui-select-label">{label}</span> : null}
      <select {...selectProps}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
