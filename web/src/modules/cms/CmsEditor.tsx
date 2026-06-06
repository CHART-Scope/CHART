import { mergeSolution } from "./cmsViewModel";
import { type CmsEditorProps } from "./cmsEditorTypes";
import { CmsEditorBasics } from "./CmsEditorBasics";
import { CmsEditorBody } from "./CmsEditorBody";
import { CmsEditorClassification } from "./CmsEditorClassification";
import { CmsEditorHeader } from "./CmsEditorHeader";
import { CmsEditorMedia } from "./CmsEditorMedia";
import { CmsEditorPreview } from "./CmsEditorPreview";

export function CmsEditor({
  draft,
  selectedItem,
  linkDraft,
  isSaving,
  isUploading,
  onDraftChange,
  onLinkDraftChange,
  onUpdateSolution,
  onToggleSolutionArrayValue,
  onAddUsefulLink,
  onRemoveUsefulLink,
  onUpdateCaseStudy,
  onAddCaseStudy,
  onRemoveCaseStudy,
  onImageUpload,
  onNewItem,
  onSaveDraft,
}: CmsEditorProps) {
  const solution = mergeSolution(draft.solution);

  return (
    <div className="editor-shell">
      <div className="editor-form-card">
        <CmsEditorHeader
          isSaving={isSaving}
          selectedItem={selectedItem}
          onNewItem={onNewItem}
          onSaveDraft={onSaveDraft}
        />
        <CmsEditorBasics draft={draft} onDraftChange={onDraftChange} />
        <CmsEditorClassification
          draft={draft}
          solution={solution}
          onDraftChange={onDraftChange}
          onToggleSolutionArrayValue={onToggleSolutionArrayValue}
          onUpdateSolution={onUpdateSolution}
        />
        <CmsEditorMedia
          isUploading={isUploading}
          linkDraft={linkDraft}
          solution={solution}
          onAddCaseStudy={onAddCaseStudy}
          onAddUsefulLink={onAddUsefulLink}
          onImageUpload={onImageUpload}
          onLinkDraftChange={onLinkDraftChange}
          onRemoveCaseStudy={onRemoveCaseStudy}
          onRemoveUsefulLink={onRemoveUsefulLink}
          onUpdateCaseStudy={onUpdateCaseStudy}
          onUpdateSolution={onUpdateSolution}
        />
        <CmsEditorBody draft={draft} onDraftChange={onDraftChange} />
      </div>

      <CmsEditorPreview draft={draft} selectedItem={selectedItem} />
    </div>
  );
}
