import { TextInput } from "./TextInput";
import "./SearchableSelect.css";

export type SearchableSelectOption = {
  id: string;
  label: string;
  keywords?: string;
};

type SearchableSelectProps = {
  emptyLabel: string;
  label: string;
  options: SearchableSelectOption[];
  placeholder: string;
  query: string;
  selectedId: string;
  onQueryChange: (query: string) => void;
  onSelect: (optionId: string) => void;
};

export function SearchableSelect({
  emptyLabel,
  label,
  options,
  placeholder,
  query,
  selectedId,
  onQueryChange,
  onSelect,
}: SearchableSelectProps) {
  const selectedOption = options.find((option) => option.id === selectedId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.keywords ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : options;

  return (
    <div className="ui-searchable-select">
      <TextInput
        aria-label={placeholder}
        label={label}
        placeholder={selectedOption?.label ?? placeholder}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {filteredOptions.length > 0 ? (
        <div className="ui-searchable-select-list" role="listbox" aria-label={label}>
          {filteredOptions.map((option) => {
            const isSelected = option.id === selectedId;

            return (
              <button
                aria-selected={isSelected}
                className={`ui-searchable-select-option ${isSelected ? "selected" : ""}`}
                key={option.id}
                role="option"
                type="button"
                onClick={() => onSelect(option.id)}
              >
                <span>{option.label}</span>
                {isSelected ? <small>Selected</small> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="ui-searchable-select-empty">{emptyLabel}</p>
      )}
    </div>
  );
}
