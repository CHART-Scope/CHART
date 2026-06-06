import { mergeSolution, prettyStatusLabel, solutionImageUrl } from "./cmsViewModel";
import { type CmsEditorProps } from "./cmsEditorTypes";
import { HazardTags } from "./CmsPipeline";

type CmsEditorPreviewProps = Pick<CmsEditorProps, "draft" | "selectedItem">;

export function CmsEditorPreview({ draft, selectedItem }: CmsEditorPreviewProps) {
  const solution = mergeSolution(draft.solution);

  return (
    <aside className="editor-preview-card">
      <div className="preview-toolbar">
        <span className="panel-eyebrow">Live preview</span>
      </div>
      <div className="preview-card">
        <div
          className="preview-card-hero"
          style={{
            background: solutionImageUrl(draft)
              ? `url("${solutionImageUrl(draft)}") center / cover`
              : (selectedItem?.thumbnail ?? "linear-gradient(135deg,#9AB89D,#5C8762)"),
          }}
        >
          <span className="preview-card-tag">{draft.tag}</span>
        </div>
        <div className="preview-card-body">
          <h3>{draft.title}</h3>
          <p>{draft.summary}</p>
          <div className="preview-card-meta">
            <span>{selectedItem?.owner ?? "Editorial team"}</span>
            <span>{prettyStatusLabel(selectedItem?.status ?? "draft")}</span>
          </div>
          <HazardTags hazards={solution.climateHazards} limit={6} />
        </div>
      </div>
      {selectedItem?.solution.caseStudies.length ? (
        <div className="asset-list">
          <span className="panel-eyebrow">Case studies</span>
          {selectedItem.solution.caseStudies.map((asset) => (
            <a
              className="asset-link"
              href={asset.url}
              key={`${asset.filename}-${asset.url}`}
              rel="noreferrer"
              target="_blank"
            >
              <span>{asset.filename ?? "Case study"}</span>
              <small>{asset.type ?? "File"}</small>
            </a>
          ))}
        </div>
      ) : null}
      <div className="preview-page">
        <span className="panel-eyebrow">Detail page</span>
        {draft.body.split("\n\n").map((paragraph, index) => (
          <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
        ))}
      </div>
    </aside>
  );
}
