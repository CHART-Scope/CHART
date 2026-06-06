import { type CmsEditorProps } from "./cmsEditorTypes";

type CmsEditorBodyProps = Pick<CmsEditorProps, "draft" | "onDraftChange">;

export function CmsEditorBody({ draft, onDraftChange }: CmsEditorBodyProps) {
  return (
    <div className="editor-section">
      <span className="editor-section-label">Description</span>
      <label className="editor-field">
        Body
        <textarea
          rows={12}
          value={draft.body}
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              body: event.target.value,
            }))
          }
        />
      </label>
    </div>
  );
}
