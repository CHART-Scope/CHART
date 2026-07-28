import type { SelectHTMLAttributes } from "react";

import styles from "./Select.module.css";

type Option = { value: string; label: string };

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: string;
  options: Option[];
  placeholder?: string;
  variant?: "default" | "filter" | "inline";
  fullWidth?: boolean;
};

export function Select({
  label,
  options,
  placeholder,
  variant = "default",
  fullWidth,
  className,
  id,
  ...rest
}: Props) {
  const cls = [
    styles.select,
    styles[variant],
    fullWidth ? "" : variant === "default" ? styles.maxWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={styles.wrap}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      <select id={id} className={cls} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
