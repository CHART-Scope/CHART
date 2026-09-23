"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { InlineSelectGroup, InlineSelectOption } from "./InlineSelect";
import styles from "./SelectMenu.module.css";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly InlineSelectOption[];
  groups?: readonly (InlineSelectGroup | null)[];
  label: string;
  disabled?: boolean;
};

/** One small, keyboard-operated menu for the dashboard's context and inline controls. */
export function SelectMenu({
  id: triggerId,
  value,
  onChange,
  options = [],
  groups,
  label,
  disabled,
}: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 240,
    maxHeight: 320,
    transform: "none",
  });
  const items = groups
    ? groups.flatMap(
        (group) =>
          group?.options.map((option) => ({ ...option, group: group.label })) ?? [],
      )
    : options.map((option) => ({ ...option, group: "" }));
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  const searchable = items.length > 7;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function show() {
    setQuery("");
    setActive(
      Math.max(
        0,
        items.findIndex((item) => item.value === value),
      ),
    );
    setOpen(true);
  }
  function choose(index: number) {
    const option = filtered[index];
    if (!option || option.disabled) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") close(true);
    else if (event.key === "Enter" || (!searchable && event.key === " ")) {
      event.preventDefault();
      choose(active);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      if (searchable && (event.key === "Home" || event.key === "End")) return;
      event.preventDefault();
      const enabled = filtered
        .map((item, index) => (item.disabled ? -1 : index))
        .filter((index) => index >= 0);
      const current = enabled.indexOf(active);
      const next =
        event.key === "Home"
          ? enabled[0]
          : event.key === "End"
            ? enabled.at(-1)
            : enabled[
                (current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
                  enabled.length
              ];
      if (next !== undefined) setActive(next);
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const flip = below < 240 && above > below;
      const height = Math.min(360, flip ? above : below);
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: flip ? rect.top - 6 : rect.bottom + 6,
        transform: flip ? "translateY(-100%)" : "none",
        maxHeight: height,
      });
    }
    place();
    (search.current ?? list.current)?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  return (
    <>
      <button
        id={triggerId}
        ref={trigger}
        type="button"
        className={styles.trigger}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>
          {items.find((item) => item.value === value)?.label ?? "Choose an option"}
        </span>
        <span className={styles.chevron} aria-hidden>
          ⌄
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className={styles.popup}
            style={position}
            onKeyDown={onKeyDown}
          >
            {searchable && (
              <input
                ref={search}
                className={styles.search}
                aria-label={`Search ${label.toLowerCase()}`}
                placeholder={`Search ${label.toLowerCase()}…`}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-autocomplete="list"
                aria-activedescendant={filtered[active] ? `${id}-${active}` : undefined}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            )}
            <div
              ref={list}
              id={`${id}-list`}
              className={styles.list}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              aria-activedescendant={filtered[active] ? `${id}-${active}` : undefined}
            >
              {filtered.map((item, index) => (
                <div key={item.value}>
                  {item.group && item.group !== filtered[index - 1]?.group && (
                    <div className={styles.group}>{item.group}</div>
                  )}
                  <div
                    id={`${id}-${index}`}
                    role="option"
                    aria-selected={item.value === value}
                    aria-disabled={item.disabled || undefined}
                    className={styles.option}
                    data-active={index === active || undefined}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(index)}
                  >
                    <span>{item.label}</span>
                    <span className={styles.check} aria-hidden>
                      {item.value === value ? "✓" : ""}
                    </span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className={styles.empty} role="status">
                  No matching options
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
