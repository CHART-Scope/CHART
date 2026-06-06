"use client";

import { WorkspaceShell } from "../shell/WorkspaceShell";
import type { CurrentUserContext } from "../auth/authClient";
import { canManageContent, formatRole } from "../auth/userContext";
import { CmsContentGrid } from "./CmsContentGrid";
import { CmsEditor } from "./CmsEditor";
import { CmsHeader } from "./CmsHeader";
import { CmsMetrics } from "./CmsMetrics";
import { CmsPipeline } from "./CmsPipeline";
import { CmsSubmissions } from "./CmsSubmissions";
import { SolutionDetailDrawer } from "./SolutionDetailDrawer";
import { type CmsRoute } from "./types";
import { useCmsContentStudio } from "./useCmsContentStudio";

type CmsPageProps = {
  onNavigate: (route: CmsRoute) => void;
  currentUser: CurrentUserContext;
  onSignOut: (returnTo?: string) => void;
};

export function CmsPage({ currentUser, onNavigate, onSignOut }: CmsPageProps) {
  const userCanManageContent = canManageContent(currentUser);

  if (!userCanManageContent) {
    return (
      <WorkspaceShell
        activeRoute="cms"
        crumb="CHART Toolkit / Content studio"
        currentUser={currentUser}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        pageTitle="Content studio"
      >
        <section className="empty-panel restricted-panel">
          <span className="section-kicker">Content controls</span>
          <h1>Content editing is not enabled for this role</h1>
          <p>
            {formatRole(currentUser.roles[0])} users can browse published public
            actions, but cannot edit or publish repository records.
          </p>
          <button
            className="primary-button"
            type="button"
            onClick={() => onNavigate("solutions")}
          >
            View public action repository
          </button>
        </section>
      </WorkspaceShell>
    );
  }

  return (
    <AuthorizedCmsPage
      currentUser={currentUser}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
    />
  );
}

function AuthorizedCmsPage({ currentUser, onNavigate, onSignOut }: CmsPageProps) {
  const studio = useCmsContentStudio();

  return (
    <WorkspaceShell
      activeRoute="cms"
      crumb="CHART Toolkit / Content studio"
      currentUser={currentUser}
      onNavigate={onNavigate}
      onSignOut={onSignOut}
      pageTitle="Content studio"
    >
      <CmsHeader activeSection={studio.section} onSectionChange={studio.setSection} />
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
    </WorkspaceShell>
  );
}
