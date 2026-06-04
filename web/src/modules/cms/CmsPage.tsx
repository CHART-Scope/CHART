"use client";

import { useEffect, useState } from "react";

import { useChartContent } from "../../app/ChartContentProvider";
import { type CmsDraftInput } from "./cmsContentRepository";
import {
  type CmsAsset,
  type CmsItem,
  type CmsSolutionMetadata,
  type CmsStatus,
} from "../../content/cms";
import {
  type CostValue,
  type HazardValue,
  type SolutionTypeValue,
  costOptions,
  hazardOptions,
  optionLabel,
  solutionTypeOptions,
} from "../../lib/solutionRepositoryOptions";
import { WorkspaceShell } from "../shell/WorkspaceShell";

type CmsPageProps = {
  onNavigate: (route: "landing" | "dashboard" | "cms") => void;
  onSignOut: () => void;
};

type CmsSection = "pipeline" | "content" | "submissions" | "editor";
type PipelineMode = "kanban" | "timeline" | "table";
type EditorDraft = CmsDraftInput;

function emptySolution(): CmsSolutionMetadata {
  return {
    solutionTypes: [],
    climateHazards: [],
    usefulLinks: [],
    caseStudies: [],
  };
}

function mergeSolution(solution?: Partial<CmsSolutionMetadata>) {
  return {
    ...emptySolution(),
    ...solution,
    solutionTypes: solution?.solutionTypes ?? [],
    climateHazards: solution?.climateHazards ?? [],
    usefulLinks: solution?.usefulLinks ?? [],
    caseStudies: solution?.caseStudies ?? [],
  };
}

function createDraft(item?: CmsItem): EditorDraft {
  if (!item) {
    return {
      title: "Untitled content",
      summary: "",
      body: "",
      tag: solutionTypeOptions[0].value,
      solution: emptySolution(),
    };
  }

  return {
    title: item.title,
    summary: item.summary,
    body: item.body,
    tag: item.tag,
    solution: mergeSolution(item.solution),
  };
}

function prettyStatusLabel(status: CmsStatus) {
  if (status === "review") {
    return "In review";
  }

  if (status === "published") {
    return "Published";
  }

  if (status === "scheduled") {
    return "Scheduled";
  }

  return "Draft";
}

function solutionTypeLabels(solution: CmsSolutionMetadata) {
  return solution.solutionTypes.map(
    (value) => optionLabel(value, solutionTypeOptions) ?? value,
  );
}

function solutionMetaLine(item: CmsItem) {
  return [
    solutionTypeLabels(item.solution)[0],
    optionLabel(item.solution.costOfImplementation, costOptions),
  ]
    .filter(Boolean)
    .join(" · ");
}

function solutionImageUrl(item: CmsItem | EditorDraft) {
  return item.solution?.image?.url;
}

export function CmsPage({ onNavigate, onSignOut }: CmsPageProps) {
  const { cmsItems, cmsSubmissions, createCmsItem, saveCmsItem, uploadCmsMedia } =
    useChartContent();
  const [section, setSection] = useState<CmsSection>("pipeline");
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("kanban");
  const [statusFilter, setStatusFilter] = useState<CmsStatus | "all">("all");
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    cmsItems[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<EditorDraft>(() => createDraft(cmsItems[0]));
  const [linkDraft, setLinkDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!selectedItemId && cmsItems[0]) {
      setSelectedItemId(cmsItems[0].id);
      setDraft(createDraft(cmsItems[0]));
      return;
    }

    if (
      selectedItemId &&
      !cmsItems.some((item) => item.id === selectedItemId) &&
      cmsItems[0]
    ) {
      setSelectedItemId(cmsItems[0].id);
      setDraft(createDraft(cmsItems[0]));
    }
  }, [cmsItems, selectedItemId]);

  const filteredByStatus = cmsItems.filter((item) => {
    return statusFilter === "all" ? true : item.status === statusFilter;
  });

  const selectedItem = selectedItemId
    ? cmsItems.find((item) => item.id === selectedItemId)
    : undefined;
  const detailItem = detailItemId
    ? cmsItems.find((item) => item.id === detailItemId)
    : undefined;

  const draftCount = cmsItems.filter((item) => item.status === "draft").length;
  const reviewCount = cmsItems.filter((item) => item.status === "review").length;
  const scheduledCount = cmsItems.filter((item) => item.status === "scheduled").length;
  const publishedCount = cmsItems.filter((item) => item.status === "published").length;

  function openEditor(item?: CmsItem) {
    setSelectedItemId(item?.id ?? null);
    setDraft(createDraft(item));
    setSection("editor");
  }

  function updateSolution(patch: Partial<CmsSolutionMetadata>) {
    setDraft((current) => ({
      ...current,
      solution: {
        ...mergeSolution(current.solution),
        ...patch,
      },
    }));
  }

  function toggleSolutionArrayValue(
    field: "solutionTypes" | "climateHazards",
    value: SolutionTypeValue | HazardValue,
  ) {
    const solution = mergeSolution(draft.solution);

    if (field === "solutionTypes") {
      const typedValue = value as SolutionTypeValue;
      updateSolution({
        solutionTypes: solution.solutionTypes.includes(typedValue)
          ? solution.solutionTypes.filter((item) => item !== typedValue)
          : [...solution.solutionTypes, typedValue],
      });
      return;
    }

    const typedValue = value as HazardValue;
    updateSolution({
      climateHazards: solution.climateHazards.includes(typedValue)
        ? solution.climateHazards.filter((item) => item !== typedValue)
        : [...solution.climateHazards, typedValue],
    });
  }

  function addUsefulLink(rawValue = linkDraft) {
    const url = rawValue.trim();

    if (!url) {
      return;
    }

    updateSolution({
      usefulLinks: [...mergeSolution(draft.solution).usefulLinks, { url }],
    });
    setLinkDraft("");
  }

  function removeUsefulLink(url: string) {
    updateSolution({
      usefulLinks: mergeSolution(draft.solution).usefulLinks.filter(
        (link) => link.url !== url,
      ),
    });
  }

  function updateCaseStudy(index: number, patch: Partial<CmsAsset>) {
    const caseStudies = [...mergeSolution(draft.solution).caseStudies];
    caseStudies[index] = { ...caseStudies[index], ...patch };
    updateSolution({ caseStudies });
  }

  function addCaseStudy() {
    updateSolution({
      caseStudies: [...mergeSolution(draft.solution).caseStudies, { filename: "" }],
    });
  }

  function removeCaseStudy(index: number) {
    updateSolution({
      caseStudies: mergeSolution(draft.solution).caseStudies.filter(
        (_asset, itemIndex) => itemIndex !== index,
      ),
    });
  }

  async function handleImageUpload(file?: File) {
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      const image = await uploadCmsMedia(file);
      updateSolution({ image });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSaveDraft() {
    setIsSaving(true);
    try {
      const savedItem = selectedItem
        ? await saveCmsItem(selectedItem.id, draft)
        : await createCmsItem(draft);

      if (!savedItem) {
        return;
      }

      setSelectedItemId(savedItem.id);
      setDraft(createDraft(savedItem));
      setSection("editor");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <WorkspaceShell
      activeRoute="cms"
      crumb="CHART Toolkit / Content studio"
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      pageTitle="Content studio"
    >
      <section className="page-header-block">
        <div>
          <div className="page-breadcrumb">Workspace / Content studio</div>
          <h1 className="page-heading">Managed public content and pipeline</h1>
          <p className="page-copy">
            Central place for public resources, editorial workflow and landing copy
            across the CHART workspace.
          </p>
        </div>

        <div className="section-switcher">
          {[
            ["pipeline", "Pipeline"],
            ["content", "All content"],
            ["submissions", "Submissions"],
            ["editor", "Editor"],
          ].map(([key, label]) => (
            <button
              className={`ghost-button ${section === key ? "active" : ""}`}
              key={key}
              type="button"
              onClick={() => setSection(key as CmsSection)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="metric-grid cms-metric-grid">
        <article className="metric-card">
          <span className="metric-card-label">Drafts</span>
          <strong className="metric-card-value">{draftCount}</strong>
          <span className="metric-card-detail">Needs assignment or next edit</span>
        </article>
        <article className="metric-card alert">
          <span className="metric-card-label">In review</span>
          <strong className="metric-card-value">{reviewCount}</strong>
          <span className="metric-card-detail">Most active editorial queue</span>
        </article>
        <article className="metric-card">
          <span className="metric-card-label">Scheduled</span>
          <strong className="metric-card-value">{scheduledCount}</strong>
          <span className="metric-card-detail">Ready for a publish window</span>
        </article>
        <article className="metric-card">
          <span className="metric-card-label">Published</span>
          <strong className="metric-card-value">{publishedCount}</strong>
          <span className="metric-card-detail">Stable public resources</span>
        </article>
      </section>

      {section === "pipeline" ? (
        <>
          <div className="pipeline-toolbar">
            <div className="section-switcher">
              <button
                className={`ghost-button ${pipelineMode === "kanban" ? "active" : ""}`}
                type="button"
                onClick={() => setPipelineMode("kanban")}
              >
                Kanban
              </button>
              <button
                className={`ghost-button ${
                  pipelineMode === "timeline" ? "active" : ""
                }`}
                type="button"
                onClick={() => setPipelineMode("timeline")}
              >
                Timeline
              </button>
              <button
                className={`ghost-button ${pipelineMode === "table" ? "active" : ""}`}
                type="button"
                onClick={() => setPipelineMode("table")}
              >
                Table
              </button>
            </div>
          </div>

          {pipelineMode === "kanban" ? (
            <div className="kanban-grid">
              {(["draft", "review", "scheduled", "published"] as CmsStatus[]).map(
                (status) => {
                  const items = cmsItems.filter((item) => item.status === status);

                  return (
                    <section className="kanban-column" key={status}>
                      <div className="kanban-column-head">
                        <div>
                          <span className="kanban-title">
                            {prettyStatusLabel(status)}
                          </span>
                          <span className="kanban-count">{items.length}</span>
                        </div>
                        <button
                          className="mini-button"
                          type="button"
                          onClick={() => openEditor(undefined)}
                        >
                          +
                        </button>
                      </div>

                      <div className="kanban-card-list">
                        {items.map((item) => (
                          <button
                            className="kanban-card"
                            key={item.id}
                            type="button"
                            onClick={() => openEditor(item)}
                          >
                            <strong>{item.title}</strong>
                            <p>{item.summary}</p>
                            {solutionMetaLine(item) ? (
                              <span className="solution-meta-line">
                                {solutionMetaLine(item)}
                              </span>
                            ) : null}
                            {item.solution.climateHazards.length > 0 ? (
                              <div className="compact-tag-row">
                                {item.solution.climateHazards
                                  .slice(0, 3)
                                  .map((hazard) => (
                                    <span className="meta-tag" key={hazard}>
                                      {optionLabel(hazard, hazardOptions) ?? hazard}
                                    </span>
                                  ))}
                              </div>
                            ) : null}
                            <div className="kanban-meta">
                              <span>{item.owner}</span>
                              <span>{item.updated}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                },
              )}
            </div>
          ) : pipelineMode === "timeline" ? (
            <div className="timeline-card">
              <div className="timeline-head">
                <h2>May 2026 publishing flow</h2>
              </div>
              <div className="timeline-list">
                {cmsItems
                  .filter((item) => item.scheduledDate)
                  .sort((left, right) =>
                    (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? ""),
                  )
                  .map((item) => (
                    <button
                      className="timeline-item"
                      key={item.id}
                      type="button"
                      onClick={() => openEditor(item)}
                    >
                      <span>{item.scheduledDate}</span>
                      <strong>{item.title}</strong>
                      <small>{prettyStatusLabel(item.status)}</small>
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <div className="content-table">
              <div className="content-table-head">
                <span>Name</span>
                <span>Status</span>
                <span>Owner</span>
                <span>Updated</span>
              </div>
              {cmsItems.map((item) => (
                <button
                  className="content-table-row"
                  key={item.id}
                  type="button"
                  onClick={() => openEditor(item)}
                >
                  <div className="content-title-cell">
                    <span
                      className="content-thumb"
                      style={{ background: item.thumbnail }}
                    />
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.summary}</small>
                      {solutionMetaLine(item) ? (
                        <small>{solutionMetaLine(item)}</small>
                      ) : null}
                    </div>
                  </div>
                  <span className={`status-chip ${item.status}`}>
                    {prettyStatusLabel(item.status)}
                  </span>
                  <span>{item.owner}</span>
                  <span>{item.updated}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {section === "content" ? (
        <>
          <div className="type-filter-row">
            {(["all", "draft", "review", "scheduled", "published"] as const).map(
              (filterStatus) => (
                <button
                  className={`filter-chip ${
                    statusFilter === filterStatus ? "active" : ""
                  }`}
                  key={filterStatus}
                  type="button"
                  onClick={() => setStatusFilter(filterStatus as CmsStatus | "all")}
                >
                  {filterStatus === "all" ? "All" : prettyStatusLabel(filterStatus)}
                </button>
              ),
            )}
          </div>
          <div className="solution-repository-grid">
            {filteredByStatus.map((item) => (
              <article className="solution-repository-card" key={item.id}>
                <button
                  className="solution-repository-card-main"
                  type="button"
                  onClick={() => setDetailItemId(item.id)}
                >
                  <span
                    className="solution-repository-image"
                    style={{ background: item.thumbnail }}
                  />
                  <div className="solution-repository-card-body">
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                    {solutionMetaLine(item) ? (
                      <small>{solutionMetaLine(item)}</small>
                    ) : null}
                    {item.solution.climateHazards.length > 0 ? (
                      <div className="compact-tag-row">
                        {item.solution.climateHazards.slice(0, 3).map((hazard) => (
                          <span className="meta-tag" key={hazard}>
                            {optionLabel(hazard, hazardOptions) ?? hazard}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {section === "submissions" ? (
        <div className="submission-grid">
          {cmsSubmissions.map((submission) => (
            <article className="submission-card" key={submission.id}>
              <div className="submission-card-head">
                <div>
                  <strong>{submission.organization}</strong>
                  <span>{submission.origin}</span>
                </div>
                <span className={`status-chip ${submission.state}`}>
                  {submission.state}
                </span>
              </div>
              <h2>{submission.title}</h2>
              <p>{submission.description}</p>
              <div className="submission-tags">
                {submission.tags.map((tag) => (
                  <span className="meta-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="submission-foot">
                <span>Submission #{submission.id}</span>
                <span>{submission.received}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {section === "editor" ? (
        <div className="editor-shell">
          <div className="editor-form-card">
            <div className="editor-form-head">
              <div>
                <span className="panel-eyebrow">Editing</span>
                <h2>{selectedItem?.title ?? "New content draft"}</h2>
              </div>
              <div className="editor-actions">
                <span className={`status-chip ${selectedItem?.status ?? "draft"}`}>
                  {prettyStatusLabel(selectedItem?.status ?? "draft")}
                </span>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => openEditor(undefined)}
                >
                  New item
                </button>
                <button
                  className="primary-button"
                  disabled={isSaving}
                  type="button"
                  onClick={handleSaveDraft}
                >
                  {isSaving ? "Saving..." : "Save draft"}
                </button>
              </div>
            </div>

            <div className="editor-section">
              <span className="editor-section-label">Basics</span>
              <label className="editor-field editor-field--title">
                Title
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current: EditorDraft) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="editor-field">
                Summary
                <textarea
                  rows={3}
                  value={draft.summary}
                  onChange={(event) =>
                    setDraft((current: EditorDraft) => ({
                      ...current,
                      summary: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="editor-section">
              <span className="editor-section-label">Classification</span>
              <label className="editor-field">
                Category
                <select
                  value={draft.tag}
                  onChange={(event) =>
                    setDraft((current: EditorDraft) => ({
                      ...current,
                      tag: event.target.value,
                    }))
                  }
                >
                  {solutionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="editor-field">
                Solution types
                <div className="option-chip-grid">
                  {solutionTypeOptions.map((option) => (
                    <button
                      className={`option-chip option-chip--solution ${
                        mergeSolution(draft.solution).solutionTypes.includes(
                          option.value,
                        )
                          ? "active"
                          : ""
                      }`}
                      key={option.value}
                      type="button"
                      onClick={() =>
                        toggleSolutionArrayValue("solutionTypes", option.value)
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="editor-field">
                Climate hazards
                <div className="option-chip-grid">
                  {hazardOptions.map((option) => (
                    <button
                      className={`option-chip option-chip--hazard ${
                        mergeSolution(draft.solution).climateHazards.includes(
                          option.value,
                        )
                          ? "active"
                          : ""
                      }`}
                      key={option.value}
                      type="button"
                      onClick={() =>
                        toggleSolutionArrayValue("climateHazards", option.value)
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </label>
              <div className="editor-field">
                <span>Cost of implementation</span>
                <div className="cost-selector">
                  {costOptions.map((option) => (
                    <button
                      className={`cost-pill ${
                        draft.solution?.costOfImplementation === option.value
                          ? "active"
                          : ""
                      }`}
                      key={option.value}
                      type="button"
                      onClick={() =>
                        updateSolution({
                          costOfImplementation:
                            draft.solution?.costOfImplementation === option.value
                              ? undefined
                              : (option.value as CostValue),
                        })
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="editor-section">
              <span className="editor-section-label">Media</span>
              <div className="editor-field">
                <span>Cover image</span>
                {mergeSolution(draft.solution).image?.url ? (
                  <div className="uploaded-image-preview">
                    <span
                      style={{
                        backgroundImage: `url("${mergeSolution(draft.solution).image?.url}")`,
                      }}
                    />
                    <div>
                      <strong>{mergeSolution(draft.solution).image?.filename}</strong>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => updateSolution({ image: undefined })}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="image-upload-zone">
                    {isUploading ? (
                      <span className="upload-zone-uploading">Uploading…</span>
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
                        const file = event.target.files?.[0];
                        void handleImageUpload(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <label className="editor-field">
                Useful links
                <div className="link-entry-row">
                  <input
                    placeholder="Paste a URL and press Enter"
                    type="url"
                    value={linkDraft}
                    onChange={(event) => setLinkDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addUsefulLink();
                      }
                    }}
                  />
                </div>
              </label>
              {mergeSolution(draft.solution).usefulLinks.length > 0 ? (
                <div className="editor-token-list">
                  {mergeSolution(draft.solution).usefulLinks.map((link) => (
                    <button
                      key={link.url}
                      type="button"
                      onClick={() => removeUsefulLink(link.url)}
                    >
                      {link.url}
                      <span>✕</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="case-study-editor">
                <div className="case-study-editor-head">
                  <span>Case studies</span>
                  <button className="mini-button" type="button" onClick={addCaseStudy}>
                    + Add
                  </button>
                </div>
                {mergeSolution(draft.solution).caseStudies.map((asset, index) => (
                  <div className="case-study-row" key={`${asset.url}-${index}`}>
                    <input
                      placeholder="Title or filename"
                      type="text"
                      value={asset.filename ?? ""}
                      onChange={(event) =>
                        updateCaseStudy(index, { filename: event.target.value })
                      }
                    />
                    <input
                      placeholder="Attachment URL"
                      type="url"
                      value={asset.url ?? ""}
                      onChange={(event) =>
                        updateCaseStudy(index, { url: event.target.value })
                      }
                    />
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => removeCaseStudy(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="editor-section">
              <span className="editor-section-label">Description</span>
              <label className="editor-field">
                Body
                <textarea
                  rows={12}
                  value={draft.body}
                  onChange={(event) =>
                    setDraft((current: EditorDraft) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </div>

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
                    : (selectedItem?.thumbnail ??
                      "linear-gradient(135deg,#9AB89D,#5C8762)"),
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
                {mergeSolution(draft.solution).climateHazards.length > 0 ? (
                  <div className="compact-tag-row">
                    {mergeSolution(draft.solution)
                      .climateHazards.slice(0, 6)
                      .map((hazard) => (
                        <span className="meta-tag" key={hazard}>
                          {optionLabel(hazard, hazardOptions) ?? hazard}
                        </span>
                      ))}
                  </div>
                ) : null}
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
              {draft.body.split("\n\n").map((paragraph: string, index: number) => (
                <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {detailItem ? (
        <div
          className="solution-drawer-backdrop"
          role="presentation"
          onClick={() => setDetailItemId(null)}
        >
          <aside
            aria-label={`${detailItem.title} details`}
            className="solution-drawer"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="solution-drawer-hero"
              style={{ background: detailItem.thumbnail }}
            />
            <div className="solution-drawer-body">
              <div className="solution-drawer-head">
                <div>
                  <h2>{detailItem.title}</h2>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setDetailItemId(null)}
                >
                  Close
                </button>
              </div>

              <p>{detailItem.summary}</p>

              {solutionMetaLine(detailItem) ? (
                <div className="drawer-fact-row">
                  <span>Type and cost</span>
                  <strong>{solutionMetaLine(detailItem)}</strong>
                </div>
              ) : null}

              {detailItem.solution.climateHazards.length > 0 ? (
                <section className="drawer-section">
                  <span className="panel-eyebrow">Hazards</span>
                  <div className="compact-tag-row">
                    {detailItem.solution.climateHazards.map((hazard) => (
                      <span className="meta-tag" key={hazard}>
                        {optionLabel(hazard, hazardOptions) ?? hazard}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailItem.solution.usefulLinks.length > 0 ? (
                <section className="drawer-section">
                  <span className="panel-eyebrow">Useful links</span>
                  <div className="asset-list compact">
                    {detailItem.solution.usefulLinks.map((link) => (
                      <a
                        className="asset-link"
                        href={link.url}
                        key={link.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>{link.label ?? link.url}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailItem.solution.caseStudies.length > 0 ? (
                <section className="drawer-section">
                  <span className="panel-eyebrow">Case studies</span>
                  <div className="asset-list compact">
                    {detailItem.solution.caseStudies.map((asset) => (
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
                </section>
              ) : null}

              <section className="drawer-section">
                <span className="panel-eyebrow">Description</span>
                {detailItem.body.split("\n\n").map((paragraph, index) => (
                  <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
                ))}
              </section>

              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setDetailItemId(null);
                  openEditor(detailItem);
                }}
              >
                Edit this solution
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
