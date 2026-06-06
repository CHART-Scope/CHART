import { type CmsDraftInput } from "./cmsContentRepository";
import type { ChartRoute } from "../routes/types";

export type CmsRoute = ChartRoute;
export type CmsSection = "pipeline" | "content" | "submissions" | "editor";
export type PipelineMode = "kanban" | "timeline" | "table";
export type EditorDraft = CmsDraftInput;

export const cmsSections: readonly { key: CmsSection; label: string }[] = [
  { key: "pipeline", label: "Pipeline" },
  { key: "content", label: "All content" },
  { key: "submissions", label: "Submissions" },
  { key: "editor", label: "Editor" },
];

export const pipelineModes: readonly { key: PipelineMode; label: string }[] = [
  { key: "kanban", label: "Kanban" },
  { key: "timeline", label: "Timeline" },
  { key: "table", label: "Table" },
];
