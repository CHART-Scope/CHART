"use client";

import { CmsContentGrid } from "./CmsContentGrid";
import { CmsEditor } from "./CmsEditor";
import { CmsHeader } from "./CmsHeader";
import { CmsMetrics } from "./CmsMetrics";
import { CmsPipeline } from "./CmsPipeline";
import { CmsSubmissions } from "./CmsSubmissions";
import { SolutionDetailDrawer } from "./SolutionDetailDrawer";
import { useCmsContentStudio } from "./useCmsContentStudio";

export function CmsPage() {
  const studio = useCmsContentStudio();

  return (
    <div className="workspace-shell repository-studio-shell">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/">
          CHART
          <small>CHART repository</small>
        </a>
        <nav aria-label="Repository navigation">
          <a className="workspace-item active" href="/">
            <span className="workspace-dot" />
            <span>Content studio</span>
          </a>
          <a className="workspace-item" href="/admin">
            <span className="workspace-dot public" />
            <span>Payload admin</span>
          </a>
          <a className="workspace-item" href="/api/content-items" target="_blank">
            <span className="workspace-dot public" />
            <span>Repository API</span>
          </a>
        </nav>
        <div className="workspace-sidebar-foot">
          Public repository service for CHART solution records.
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <div className="workspace-crumb">Repository / Content studio</div>
            <h1 className="workspace-title">CHART repository</h1>
          </div>
          <div className="workspace-topbar-right">
            <a className="ghost-button" href="/admin">
              Open admin
            </a>
            <button
              className="primary-button"
              disabled={studio.isLoading}
              type="button"
              onClick={() => void studio.loadSnapshot()}
            >
              Refresh content
            </button>
          </div>
        </header>

        <div className="workspace-content">
          <CmsHeader
            activeSection={studio.section}
            onSectionChange={studio.setSection}
          />

          {studio.errorMessage ? (
            <section className="empty-panel repository-studio-alert">
              <h2>Content request failed</h2>
              <p>{studio.errorMessage}</p>
              <p>
                If this happened while saving, sign in through the Payload admin first,
                then return to the studio.
              </p>
            </section>
          ) : null}

          {studio.isLoading ? (
            <section className="empty-panel">
              <h2>Loading repository content</h2>
              <p>Reading published solution records from Payload.</p>
            </section>
          ) : (
            <>
              <CmsMetrics items={studio.cmsItems} />

              {studio.section === "pipeline" ? (
                <CmsPipeline
                  items={studio.cmsItems}
                  mode={studio.pipelineMode}
                  onModeChange={studio.setPipelineMode}
                  onOpenEditor={studio.openEditor}
                />
              ) : null}

              {studio.section === "content" ? (
                <CmsContentGrid
                  items={studio.cmsItems}
                  statusFilter={studio.statusFilter}
                  onOpenDetail={studio.openDetail}
                  onStatusFilterChange={studio.setStatusFilter}
                />
              ) : null}

              {studio.section === "submissions" ? (
                <CmsSubmissions submissions={studio.cmsSubmissions} />
              ) : null}

              {studio.section === "editor" ? (
                <CmsEditor
                  draft={studio.draft}
                  isSaving={studio.isSaving}
                  isUploading={studio.isUploading}
                  linkDraft={studio.linkDraft}
                  selectedItem={studio.selectedItem}
                  onAddCaseStudy={studio.addCaseStudy}
                  onAddUsefulLink={() => studio.addUsefulLink()}
                  onDraftChange={studio.setDraft}
                  onImageUpload={(file) => void studio.uploadImage(file)}
                  onLinkDraftChange={studio.setLinkDraft}
                  onNewItem={() => studio.openEditor(undefined)}
                  onRemoveCaseStudy={studio.removeCaseStudy}
                  onRemoveUsefulLink={studio.removeUsefulLink}
                  onSaveDraft={() => void studio.saveDraft()}
                  onToggleSolutionArrayValue={studio.toggleSolutionArrayValue}
                  onUpdateCaseStudy={studio.updateCaseStudy}
                  onUploadCaseStudy={(index, file) =>
                    void studio.uploadCaseStudy(index, file)
                  }
                  onUpdateSolution={studio.updateSolution}
                />
              ) : null}

              {studio.detailItem ? (
                <SolutionDetailDrawer
                  item={studio.detailItem}
                  onClose={studio.closeDetail}
                  onEdit={studio.openEditor}
                />
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
