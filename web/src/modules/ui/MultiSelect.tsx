"use client";

import { useState } from "react";

import "./MultiSelect.css";

export type MultiSelectOption = {
  id: string;
  label: string;
};

type MultiSelectProps = {
  id: string;
  isOpen: boolean;
  label: string;
  options: MultiSelectOption[];
  searchLabel?: string;
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  onOpenChange: (isOpen: boolean) => void;
};

export function MultiSelect({
  id,
  isOpen,
  label,
  options,
  searchLabel = "Find a record",
  selectedIds,
  onChange,
  onOpenChange,
}: MultiSelectProps) {
  const [optionQuery, setOptionQuery] = useState("");
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(optionQuery.trim().toLowerCase()),
  );
  const selectedSummary =
    selectedOptions.length === 1
      ? selectedOptions[0]?.label
      : `${selectedOptions.length} selected`;

  function toggleOption(optionId: string) {
    onChange(
      selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId],
    );
  }

  return (
    <details
      className="ui-multi-select"
      open={isOpen}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary>
        <span id={`ui-multi-select-${id}`}>{label}</span>
        {selectedOptions.length > 0 ? <strong>{selectedSummary}</strong> : null}
      </summary>
      <div className="ui-multi-select-menu" aria-labelledby={`ui-multi-select-${id}`}>
        <label className="ui-multi-select-search">
          <span>{searchLabel}</span>
          <input
            type="search"
            value={optionQuery}
            onChange={(event) => setOptionQuery(event.target.value)}
          />
        </label>
        <div className="ui-multi-select-list">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const isSelected = selectedIds.includes(option.id);

              return (
                <label
                  className={`ui-multi-select-option ${isSelected ? "selected" : ""}`}
                  key={option.id}
                >
                  <input
                    checked={isSelected}
                    type="checkbox"
                    onChange={() => toggleOption(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })
          ) : (
            <p className="ui-multi-select-empty">No matching options.</p>
          )}
        </div>
        <div className="ui-multi-select-foot">
          <span>{label} is</span>
          <button
            disabled={selectedIds.length === 0}
            type="button"
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </div>
    </details>
  );
}
