import "./FilterBar.css";

type FilterOption = {
  value: string;
  label: string;
};

type FilterDefinition = {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

type FilterBarProps = {
  filters: FilterDefinition[];
};

export function FilterBar({ filters }: FilterBarProps) {
  return (
    <div className="filter-bar">
      {filters.map((filter) => (
        <label className="filter-bar-select" key={filter.id}>
          {filter.label}
          <select
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
