import { prettyStatusLabel } from "./cmsViewModel";
import { type CmsEditorProps } from "./cmsEditorTypes";

type CmsEditorHeaderProps = Pick<
  CmsEditorProps,
  "selectedItem" | "isSaving" | "onNewItem" | "onSaveDraft"
>;

export function CmsEditorHeader({
  selectedItem,
  isSaving,
  onNewItem,
  onSaveDraft,
}: CmsEditorHeaderProps) {
  return (
    <div className="editor-form-head">
      <div>
        <span className="panel-eyebrow">Editing</span>
        <h2>{selectedItem?.title ?? "New content draft"}</h2>
      </div>
      <div className="editor-actions">
        <span className={`status-chip ${selectedItem?.status ?? "draft"}`}>
          {prettyStatusLabel(selectedItem?.status ?? "draft")}
        </span>
        <button className="ghost-button" type="button" onClick={onNewItem}>
          New item
        </button>
        <button
          className="primary-button"
          disabled={isSaving}
          type="button"
          onClick={onSaveDraft}
        >
          {isSaving ? "Saving..." : "Save draft"}
        </button>
      </div>
    </div>
  );
}
