import type { IconName } from "@/components/Icon";

export type Sector = {
  id: string;
  label: string;
  icon: IconName;
};

export const SECTORS: Sector[] = [
  { id: "health", label: "Health", icon: "stethoscope" },
  { id: "environment", label: "Environment & climate change", icon: "cloud-storm" },
  { id: "animal-health", label: "Animal health", icon: "paw" },
  { id: "agriculture", label: "Agriculture", icon: "plant" },
  { id: "disaster", label: "Disaster management", icon: "alert-triangle" },
  { id: "urban", label: "Urban planning", icon: "building-community" },
  { id: "water", label: "Water and sanitation", icon: "droplet" },
  { id: "energy", label: "Energy", icon: "bolt" },
  { id: "social", label: "Social Services", icon: "heart-handshake" },
  { id: "other", label: "Other", icon: "dots" },
];
