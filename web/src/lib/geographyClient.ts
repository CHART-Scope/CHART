export type GeographyRecord = {
  id: string;
  countryCode: string;
  level: "country" | "geo_level_1" | "geo_level_2" | "geo_level_3";
  levelLabel: string;
  name: string;
  parentId: string | null;
  externalCode: string | null;
  path: string;
  sortOrder: number;
};

export async function listGeographies() {
  const response = await fetch("/api/chart/geographies", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("CHART geography records could not be loaded.");
  }

  return (await response.json()) as GeographyRecord[];
}
