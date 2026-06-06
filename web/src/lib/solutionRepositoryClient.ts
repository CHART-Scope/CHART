export type SolutionRepositoryTaxonomy = {
  id: string;
  type: "hazard" | "solution_type" | string;
  label: string;
};

export type SolutionRepositoryAsset = {
  id: string;
  kind: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string | null;
  attribution: string | null;
};

export type SolutionRepositoryLink = {
  label: string;
  url: string;
};

export type SolutionRepositoryItem = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  implementationNotes: string | null;
  costOfImplementation: string | null;
  maintenanceRequirement: string | null;
  timeToImplement: string | null;
  evidenceLevel: string | null;
  sourceId: string;
  sourceRecordId: string | null;
  sourceVersion: string | null;
  sourceUpdatedAt: string | null;
  license: string | null;
  attribution: string | null;
  status: string;
  taxonomies: SolutionRepositoryTaxonomy[];
  links: SolutionRepositoryLink[];
  assets: SolutionRepositoryAsset[];
};

export type SolutionRepositoryListResponse = {
  items: SolutionRepositoryItem[];
  total: number;
};

export async function listPublicSolutions(query: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(query);
  const queryString = searchParams.toString();
  const response = await fetch(
    `/api/chart/solutions${queryString ? `?${queryString}` : ""}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Could not load the CHART action repository.");
  }

  return (await response.json()) as SolutionRepositoryListResponse;
}

export async function listSolutionTaxonomies() {
  const response = await fetch("/api/chart/solutions/taxonomies", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load CHART repository filters.");
  }

  return (await response.json()) as SolutionRepositoryTaxonomy[];
}
