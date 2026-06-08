import { type CmsEditorProps } from "./cmsEditorTypes";

type CmsEditorBasicsProps = Pick<CmsEditorProps, "draft" | "onDraftChange">;

export function CmsEditorBasics({ draft, onDraftChange }: CmsEditorBasicsProps) {
  return (
    <div className="editor-section">
      <span className="editor-section-label">Basics</span>
      <label className="editor-field editor-field--title">
        Title
        <input
          type="text"
          value={draft.title}
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
        />
      </label>
      <label className="editor-field">
        Short summary
        <textarea
          rows={3}
          value={draft.summary}
          onChange={(event) =>
            onDraftChange((current) => ({
              ...current,
              summary: event.target.value,
            }))
          }
        />
      </label>
    </div>
  );
}
