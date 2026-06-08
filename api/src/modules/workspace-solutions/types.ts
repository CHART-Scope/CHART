import type { SolutionRepositoryItemRecord } from "../solution-repository/types.js";

export type WorkspaceSolutionImportStatus = "not_started" | "completed" | "empty";

export type WorkspaceSolutionImportSummary = {
  status: WorkspaceSolutionImportStatus;
  selectedHazards: number;
  importedSolutions: number;
  message: string;
};

export type PreparedWorkspaceSolutionImport = {
  hazardIds: string[];
  items: SolutionRepositoryItemRecord[];
};
