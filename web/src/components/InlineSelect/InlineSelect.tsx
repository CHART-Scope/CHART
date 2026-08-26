"use client";

import type { CSSProperties } from "react";

import { Icon } from "@/components/Icon";

import styles from "./InlineSelect.module.css";

export type InlineSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type InlineSelectGroup = {
  label: string;
  options: readonly InlineSelectOption[];
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options?: readonly InlineSelectOption[];
  groups?: readonly (InlineSelectGroup | null)[];
  "aria-label": string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  /** Optional small caption rendered above the pill (e.g. "Country",
   * "State"). When set, the select is wrapped in a labelled column so
   * it matches the dashboard context bar's uniform layout. Omit for
   * fully-inline usage (a select embedded mid-sentence). */
  label?: string;
};

/**
 * Pill-shaped `<select>` designed to sit inline in a sentence or a
 * horizontal context bar. Reused by the dashboard's HeatLbwLinkPanel and
 * DashboardContextBar so every switcher on the page has the same visual
 * language — a subtle nexus-tinted background, a chevron, and a
 * comfortable hover / focus state.
 */
export function InlineSelect({
  value,
  onChange,
  options,
  groups,
  "aria-label": ariaLabel,
  className,
  style,
  disabled,
  label,
}: Props) {
  const renderOption = (option: InlineSelectOption) => (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  );
  const pill = (
    <span
      className={
        className ? `${styles.inlineSelect} ${className}` : styles.inlineSelect
      }
      style={style}
    >
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {groups
          ? groups
              .filter((group): group is InlineSelectGroup => group !== null)
              .map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(renderOption)}
                </optgroup>
              ))
          : options?.map(renderOption)}
      </select>
      <Icon name="chevron-down" size={12} className={styles.chevron} />
    </span>
  );
  if (!label) return pill;
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {pill}
    </label>
  );
}
