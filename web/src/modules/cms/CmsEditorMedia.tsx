import { type CmsSolutionMetadata } from "../../content/cms";
import { type CmsEditorProps } from "./cmsEditorTypes";

type CmsEditorMediaProps = Pick<
  CmsEditorProps,
  | "linkDraft"
  | "isUploading"
  | "onUpdateSolution"
  | "onImageUpload"
  | "onLinkDraftChange"
  | "onAddUsefulLink"
  | "onRemoveUsefulLink"
  | "onUpdateCaseStudy"
  | "onAddCaseStudy"
  | "onRemoveCaseStudy"
> & {
  solution: CmsSolutionMetadata;
};

export function CmsEditorMedia({
  solution,
  linkDraft,
  isUploading,
  onUpdateSolution,
  onImageUpload,
  onLinkDraftChange,
  onAddUsefulLink,
  onRemoveUsefulLink,
  onUpdateCaseStudy,
  onAddCaseStudy,
  onRemoveCaseStudy,
}: CmsEditorMediaProps) {
  return (
    <div className="editor-section">
      <span className="editor-section-label">Media</span>
      <CoverImageField
        image={solution.image}
        isUploading={isUploading}
        onImageUpload={onImageUpload}
        onUpdateSolution={onUpdateSolution}
      />
      <UsefulLinksField
        linkDraft={linkDraft}
        links={solution.usefulLinks}
        onAddUsefulLink={onAddUsefulLink}
        onLinkDraftChange={onLinkDraftChange}
        onRemoveUsefulLink={onRemoveUsefulLink}
      />
      <CaseStudiesField
        caseStudies={solution.caseStudies}
        onAddCaseStudy={onAddCaseStudy}
        onRemoveCaseStudy={onRemoveCaseStudy}
        onUpdateCaseStudy={onUpdateCaseStudy}
      />
    </div>
  );
}

function CoverImageField({
  image,
  isUploading,
  onUpdateSolution,
  onImageUpload,
}: Pick<CmsEditorProps, "isUploading" | "onUpdateSolution" | "onImageUpload"> & {
  image: CmsSolutionMetadata["image"];
}) {
  return (
    <div className="editor-field">
      <span>Cover image</span>
      {image?.url ? (
        <div className="uploaded-image-preview">
          <span style={{ backgroundImage: `url("${image.url}")` }} />
          <div>
            <strong>{image.filename}</strong>
            <button
              className="ghost-button"
              type="button"
              onClick={() => onUpdateSolution({ image: undefined })}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="image-upload-zone">
          {isUploading ? (
            <span className="upload-zone-uploading">Uploading...</span>
          ) : (
            <>
              <span className="upload-zone-icon">↑</span>
              <span>Click to upload</span>
              <small>PNG, JPG, WEBP</small>
            </>
          )}
          <input
            accept="image/*"
            style={{ display: "none" }}
            type="file"
            onChange={(event) => {
              onImageUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function UsefulLinksField({
  links,
  linkDraft,
  onLinkDraftChange,
  onAddUsefulLink,
  onRemoveUsefulLink,
}: Pick<
  CmsEditorProps,
  "linkDraft" | "onLinkDraftChange" | "onAddUsefulLink" | "onRemoveUsefulLink"
> & {
  links: CmsSolutionMetadata["usefulLinks"];
}) {
  return (
    <>
      <label className="editor-field">
        Useful links
        <div className="link-entry-row">
          <input
            placeholder="Paste a URL and press Enter"
            type="url"
            value={linkDraft}
            onChange={(event) => onLinkDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddUsefulLink();
              }
            }}
          />
        </div>
      </label>
      {links.length > 0 ? (
        <div className="editor-token-list">
          {links.map((link) => (
            <button
              key={link.url}
              type="button"
              onClick={() => onRemoveUsefulLink(link.url)}
            >
              {link.url}
              <span>✕</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function CaseStudiesField({
  caseStudies,
  onUpdateCaseStudy,
  onAddCaseStudy,
  onRemoveCaseStudy,
}: Pick<
  CmsEditorProps,
  "onUpdateCaseStudy" | "onAddCaseStudy" | "onRemoveCaseStudy"
> & {
  caseStudies: CmsSolutionMetadata["caseStudies"];
}) {
  return (
    <div className="case-study-editor">
      <div className="case-study-editor-head">
        <span>Case studies</span>
        <button className="mini-button" type="button" onClick={onAddCaseStudy}>
          + Add
        </button>
      </div>
      {caseStudies.map((asset, index) => (
        <div className="case-study-row" key={`${asset.url}-${index}`}>
          <input
            placeholder="Title or filename"
            type="text"
            value={asset.filename ?? ""}
            onChange={(event) =>
              onUpdateCaseStudy(index, { filename: event.target.value })
            }
          />
          <input
            placeholder="Attachment URL"
            type="url"
            value={asset.url ?? ""}
            onChange={(event) => onUpdateCaseStudy(index, { url: event.target.value })}
          />
          <button
            className="ghost-button"
            type="button"
            onClick={() => onRemoveCaseStudy(index)}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}
