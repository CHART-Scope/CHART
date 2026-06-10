"use client";

import { useEffect, useState } from "react";

import { FilterBar } from "../ui/FilterBar";

type DashboardHazardOption = {
  id: string;
  label: string;
};

type DashboardFilterBarProps = {
  regionOptions: { value: string; label: string }[];
  selectedRegion: string;
  selectedHazards: DashboardHazardOption[];
  onRegionChange: (value: string) => void;
};

const hazardOptions = [
  { value: "all", label: "All hazards" },
  { value: "hazard-storm", label: "Storm" },
  { value: "hazard-extreme-heat", label: "Extreme heat" },
  { value: "hazard-increased-temperature", label: "Increased temperature" },
  { value: "hazard-earthquake", label: "Earthquake" },
  { value: "hazard-flood", label: "Flood" },
  { value: "hazard-sea-level-rise", label: "Sea level rise" },
  { value: "hazard-cold-wave", label: "Cold wave" },
  { value: "hazard-drought", label: "Drought" },
  { value: "hazard-wildfire", label: "Wildfire" },
  { value: "hazard-increased-co2-levels", label: "Increased CO2 levels" },
  { value: "hazard-landslide", label: "Landslide" },
  { value: "hazard-tsunami", label: "Tsunami" },
  { value: "hazard-volcano", label: "Volcano" },
  { value: "hazard-cyclone", label: "Cyclone" },
];

const healthDomainOptions = [
  { value: "all", label: "All domains" },
  { value: "maternal", label: "Maternal & child health" },
  { value: "infectious", label: "Infectious disease" },
  { value: "ncd", label: "Non-communicable disease" },
  { value: "nutrition", label: "Nutrition" },
  { value: "mental", label: "Mental health" },
];

export function DashboardFilterBar({
  regionOptions,
  selectedRegion,
  selectedHazards,
  onRegionChange,
}: DashboardFilterBarProps) {
  const initialHazard = selectedHazards[0]?.id ?? "all";
  const [hazard, setHazard] = useState(initialHazard);
  const [healthDomain, setHealthDomain] = useState("all");
  const visibleHazardOptions = mergeHazardOptions(selectedHazards);

  useEffect(() => {
    const nextHazard = selectedHazards[0]?.id;

    if (nextHazard && hazard === "all") {
      setHazard(nextHazard);
    }
  }, [hazard, selectedHazards]);

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
        {
          id: "hazard",
          label: "Climate hazard",
          options: visibleHazardOptions,
          value: hazard,
          onChange: setHazard,
        },
        {
          id: "health-domain",
          label: "Health domain",
          options: healthDomainOptions,
          value: healthDomain,
          onChange: setHealthDomain,
        },
      ]}
    />
  );
}

function mergeHazardOptions(selectedHazards: DashboardHazardOption[]) {
  const options = [...hazardOptions];
  const optionValues = new Set(options.map((option) => option.value));

  for (const hazard of selectedHazards) {
    if (!optionValues.has(hazard.id)) {
      options.push({ value: hazard.id, label: hazard.label });
    }
  }

  return options;
}
