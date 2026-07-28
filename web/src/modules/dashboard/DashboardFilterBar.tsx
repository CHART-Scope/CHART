import { FilterBar } from "../ui/FilterBar";

type DashboardFilterBarProps = {
  regionOptions: { value: string; label: string; disabled?: boolean }[];
  selectedRegion: string;
  onRegionChange: (value: string) => void;
};

export function DashboardFilterBar({
  regionOptions,
  selectedRegion,
  onRegionChange,
}: DashboardFilterBarProps) {
  return (
    <FilterBar
      filters={[
        {
          id: "region",
          label: "Region",
          options: regionOptions,
          value: selectedRegion,
          onChange: onRegionChange,
        },
      ]}
    />
  );
}
