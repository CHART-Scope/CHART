"use client";

import { useEffect, useState } from "react";

import { useChartContent } from "../../app/ChartContentProvider";
import { type CmsDraftInput } from "./cmsContentRepository";
import {
  type CmsItem,
  type CmsSolutionMetadata,
  type CmsStatus,
  type CmsType,
} from "../../content/cms";
import { WorkspaceShell } from "../shell/WorkspaceShell";

type CmsPageProps = {
  onNavigate: (route: "landing" | "dashboard" | "cms") => void;
};

type CmsSection = "pipeline" | "content" | "submissions" | "editor";
type PipelineMode = "kanban" | "timeline" | "table";
type EditorDraft = CmsDraftInput;

function emptySolution(): CmsSolutionMetadata {
  return {
    climateHazards: [],
    healthDomains: [],
    resiliencePhases: [],
    usefulLinks: [],
    caseStudies: [],
  };
}

function mergeSolution(solution?: Partial<CmsSolutionMetadata>) {
  return {
    ...emptySolution(),
    ...solution,
    climateHazards: solution?.climateHazards ?? [],
    healthDomains: solution?.healthDomains ?? [],
    resiliencePhases: solution?.resiliencePhases ?? [],
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
      type: "solution",
      tag: "New block",
      solution: emptySolution(),
    };
  }

  return {
    title: item.title,
    summary: item.summary,
    body: item.body,
    type: item.type,
    tag: item.tag,
    solution: mergeSolution(item.solution),
  };
}

function prettyTypeLabel(type: CmsType) {
  if (type === "vra") {
    return "VRA";
  }

  if (type === "landing") {
    return "Landing";
  }

  return `${type[0].toUpperCase()}${type.slice(1)}`;
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

function previewBackgroundForType(type: CmsType) {
  if (type === "model") {
    return "linear-gradient(135deg,#FCE9DF,#F0936B)";
  }

  if (type === "vra") {
    return "linear-gradient(135deg,#E0F4F4,#0EA5A5)";
  }

  if (type === "landing") {
    return "linear-gradient(135deg,#E8F3EA,#2E9449)";
  }

  return "linear-gradient(135deg,#9AB89D,#5C8762)";
}

function toListText(values?: string[]) {
  return values?.join(", ") ?? "";
}

function parseListText(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toLinksText(values?: { url: string }[]) {
  return values?.map((item) => item.url).join("\n") ?? "";
}

function parseLinksText(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((url) => ({ url }));
}

function solutionMetaLine(item: CmsItem) {
  return [
    item.solution.solutionType,
    item.solution.costOfImplementation,
    item.solution.implementationEffort,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CmsPage({ onNavigate }: CmsPageProps) {
  const { cmsItems, cmsSubmissions, createCmsItem, saveCmsItem } = useChartContent();
  const [section, setSection] = useState<CmsSection>("pipeline");
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("kanban");
  const [typeFilter, setTypeFilter] = useState<CmsType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CmsStatus | "all">("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    cmsItems[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<EditorDraft>(() => createDraft(cmsItems[0]));
  const [isSaving, setIsSaving] = useState(false);

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

  const filteredByType = cmsItems.filter((item) => {
    return typeFilter === "all" ? true : item.type === typeFilter;
  });

  const filteredByStatus = cmsItems.filter((item) => {
    return statusFilter === "all" ? true : item.status === statusFilter;
  });

  const selectedItem = selectedItemId
    ? cmsItems.find((item) => item.id === selectedItemId)
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

            <div className="type-filter-row">
              {(["all", "solution", "model", "vra", "landing"] as const).map(
                (filterType) => (
                  <button
                    className={`filter-chip ${
                      typeFilter === filterType ? "active" : ""
                    }`}
                    key={filterType}
                    type="button"
                    onClick={() => setTypeFilter(filterType)}
                  >
                    {filterType === "all" ? "All" : prettyTypeLabel(filterType)}
                  </button>
                ),
              )}
            </div>
          </div>

          {pipelineMode === "kanban" ? (
            <div className="kanban-grid">
              {(["draft", "review", "scheduled", "published"] as CmsStatus[]).map(
                (status) => {
                  const items = filteredByType.filter((item) => item.status === status);

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
                            <span className={`type-pill ${item.type}`}>
                              {prettyTypeLabel(item.type)}
                            </span>
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
                                      {hazard}
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
                {filteredByType
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
                      <small>
                        {prettyTypeLabel(item.type)} · {prettyStatusLabel(item.status)}
                      </small>
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <div className="content-table">
              <div className="content-table-head">
                <span>Name</span>
                <span>Type</span>
                <span>Status</span>
                <span>Owner</span>
                <span>Updated</span>
              </div>
              {filteredByType.map((item) => (
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
                  <span>{prettyTypeLabel(item.type)}</span>
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
          <div className="content-table">
            <div className="content-table-head">
              <span>Name</span>
              <span>Type</span>
              <span>Status</span>
              <span>Owner</span>
              <span>Updated</span>
            </div>
            {filteredByStatus.map((item) => (
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
                <span>{prettyTypeLabel(item.type)}</span>
                <span className={`status-chip ${item.status}`}>
                  {prettyStatusLabel(item.status)}
                </span>
                <span>{item.owner}</span>
                <span>{item.updated}</span>
              </button>
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

            <label className="editor-field">
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

            <div className="editor-field-row">
              <label className="editor-field">
                Type
                <select
                  value={draft.type}
                  onChange={(event) =>
                    setDraft((current: EditorDraft) => ({
                      ...current,
                      type: event.target.value as CmsType,
                    }))
                  }
                >
                  {(["solution", "model", "vra", "landing"] as const).map((type) => (
                    <option key={type} value={type}>
                      {prettyTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="editor-field">
                Tag
                <input
                  type="text"
                  value={draft.tag}
                  onChange={(event) =>
                    setDraft((current: EditorDraft) => ({
                      ...current,
                      tag: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="editor-field">
              Summary
              <textarea
                rows={4}
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current: EditorDraft) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </label>

            {draft.type === "solution" ? (
              <div className="solution-editor-block">
                <div className="editor-field-row">
                  <label className="editor-field">
                    Solution type
                    <input
                      type="text"
                      value={draft.solution?.solutionType ?? ""}
                      onChange={(event) =>
                        updateSolution({ solutionType: event.target.value })
                      }
                    />
                  </label>

                  <label className="editor-field">
                    Cost
                    <input
                      type="text"
                      value={draft.solution?.costOfImplementation ?? ""}
                      onChange={(event) =>
                        updateSolution({
                          costOfImplementation: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="editor-field-row">
                  <label className="editor-field">
                    Effort
                    <input
                      type="text"
                      value={draft.solution?.implementationEffort ?? ""}
                      onChange={(event) =>
                        updateSolution({
                          implementationEffort: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="editor-field">
                    Organization
                    <input
                      type="text"
                      value={draft.solution?.organizationName ?? ""}
                      onChange={(event) =>
                        updateSolution({ organizationName: event.target.value })
                      }
                    />
                  </label>
                </div>

                <label className="editor-field">
                  Climate hazards
                  <input
                    type="text"
                    value={toListText(draft.solution?.climateHazards)}
                    onChange={(event) =>
                      updateSolution({
                        climateHazards: parseListText(event.target.value),
                      })
                    }
                  />
                </label>

                <label className="editor-field">
                  Health domains
                  <input
                    type="text"
                    value={toListText(draft.solution?.healthDomains)}
                    onChange={(event) =>
                      updateSolution({
                        healthDomains: parseListText(event.target.value),
                      })
                    }
                  />
                </label>

                <label className="editor-field">
                  Useful links
                  <textarea
                    rows={3}
                    value={toLinksText(draft.solution?.usefulLinks)}
                    onChange={(event) =>
                      updateSolution({
                        usefulLinks: parseLinksText(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

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

          <aside className="editor-preview-card">
            <div className="preview-toolbar">
              <span className="panel-eyebrow">Live preview</span>
            </div>
            <div className="preview-card">
              <div
                className="preview-card-hero"
                style={{
                  background:
                    selectedItem?.thumbnail ?? previewBackgroundForType(draft.type),
                }}
              >
                <span className="preview-card-tag">{draft.tag}</span>
              </div>
              <div className="preview-card-body">
                <h3>{draft.title}</h3>
                <p>{draft.summary}</p>
                <div className="preview-card-meta">
                  <span>{prettyTypeLabel(draft.type)}</span>
                  <span>{selectedItem?.owner ?? "Editorial team"}</span>
                  <span>{prettyStatusLabel(selectedItem?.status ?? "draft")}</span>
                </div>
                {draft.type === "solution" &&
                mergeSolution(draft.solution).climateHazards.length > 0 ? (
                  <div className="compact-tag-row">
                    {mergeSolution(draft.solution)
                      .climateHazards.slice(0, 6)
                      .map((hazard) => (
                        <span className="meta-tag" key={hazard}>
                          {hazard}
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
    </WorkspaceShell>
  );
}
