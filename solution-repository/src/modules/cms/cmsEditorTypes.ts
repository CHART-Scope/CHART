import { type Dispatch, type SetStateAction } from "react";

import {
  type CmsAsset,
  type CmsItem,
  type CmsSolutionMetadata,
} from "../../content/cms";
import {
  type HazardValue,
  type SolutionTypeValue,
} from "../../lib/solutionRepositoryOptions";
import { type EditorDraft } from "./types";

export type CmsEditorProps = {
  draft: EditorDraft;
  selectedItem?: CmsItem;
  linkDraft: string;
  isSaving: boolean;
  isUploading: boolean;
  onDraftChange: Dispatch<SetStateAction<EditorDraft>>;
  onLinkDraftChange: (value: string) => void;
  onUpdateSolution: (patch: Partial<CmsSolutionMetadata>) => void;
  onToggleSolutionArrayValue: (
    field: "solutionTypes" | "climateHazards",
    value: SolutionTypeValue | HazardValue,
  ) => void;
  onAddUsefulLink: () => void;
  onRemoveUsefulLink: (url: string) => void;
  onUpdateCaseStudy: (index: number, patch: Partial<CmsAsset>) => void;
  onUploadCaseStudy: (index: number, file?: File) => void;
  onAddCaseStudy: () => void;
  onRemoveCaseStudy: (index: number) => void;
  onImageUpload: (file?: File) => void;
  onNewItem: () => void;
  onSaveDraft: () => void;
};
