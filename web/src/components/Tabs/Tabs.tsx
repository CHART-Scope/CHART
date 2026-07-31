import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useId, useRef } from "react";

import styles from "./Tabs.module.css";

export type TabItem<Value extends string> = {
  value: Value;
  label: string;
  disabled?: boolean;
};

type Props<Value extends string> = {
  items: readonly TabItem<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
};

export function Tabs<Value extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: Props<Value>) {
  const groupId = useId();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const focusIndex = useCallback((index: number) => {
    const target = buttonsRef.current[index];
    target?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const enabled = items
        .map((item, position) => (item.disabled ? -1 : position))
        .filter((position) => position >= 0);
      if (enabled.length === 0) return;

      const current = enabled.indexOf(index);
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusIndex(enabled[(current + 1) % enabled.length]);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusIndex(enabled[(current - 1 + enabled.length) % enabled.length]);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusIndex(enabled[0]);
      } else if (event.key === "End") {
        event.preventDefault();
        focusIndex(enabled[enabled.length - 1]);
      }
    },
    [focusIndex, items],
  );

  return (
    <div className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <div role="tablist" aria-label={ariaLabel} className={styles.list}>
        {items.map((item, index) => {
          const selected = item.value === value;
          const tabId = `${groupId}-tab-${item.value}`;
          const panelId = `${groupId}-panel-${item.value}`;
          return (
            <button
              key={item.value}
              ref={(node) => {
                buttonsRef.current[index] = node;
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-controls={panelId}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              data-selected={selected}
              className={styles.tab}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {children ? (
        <div
          role="tabpanel"
          id={`${groupId}-panel-${value}`}
          aria-labelledby={`${groupId}-tab-${value}`}
          className={styles.panel}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
