import { Select, type SelectOption } from "./Select";
import "./FilterBar.css";

type FilterDefinition = {
  id: string;
  label: string;
  options: SelectOption[];
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
        <Select
          key={filter.id}
          label={filter.label}
          options={filter.options}
          value={filter.value}
          onChange={(event) => filter.onChange(event.target.value)}
        />
      ))}
    </div>
  );
}
