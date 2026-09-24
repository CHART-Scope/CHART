"use client";

import { useId, useState } from "react";
import { SelectMenu } from "../InlineSelect/SelectMenu";
import type { InlineSelectOption } from "../InlineSelect/InlineSelect";
import styles from "./Select.module.css";

type Props = {
  label?: string;
  "aria-label"?: string;
  options: InlineSelectOption[];
  placeholder?: string;
  variant?: "default" | "filter" | "inline";
  fullWidth?: boolean;
  className?: string;
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export function Select({
  label,
  options,
  placeholder,
  variant = "default",
  fullWidth,
  className,
  id,
  name,
  value,
  defaultValue,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: Props) {
  const generatedId = useId();
  const [localValue, setLocalValue] = useState(
    defaultValue ?? (placeholder ? "" : (options[0]?.value ?? "")),
  );
  const selected = value ?? localValue;
  const controlId = id ?? generatedId;
  return (
    <div
      className={[
        styles.wrap,
        variant === "inline" ? styles.inline : "",
        !fullWidth && variant === "default" ? styles.maxWidth : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label && (
        <label className={styles.label} htmlFor={controlId}>
          {label}
        </label>
      )}
      <SelectMenu
        id={controlId}
        label={ariaLabel ?? label ?? placeholder ?? "Choose an option"}
        value={selected}
        disabled={disabled}
        options={
          placeholder ? [{ value: "", label: placeholder }, ...options] : options
        }
        onChange={(next) => {
          setLocalValue(next);
          onChange?.(next);
        }}
      />
      {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}
    </div>
  );
}
