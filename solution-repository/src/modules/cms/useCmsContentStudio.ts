import { useEffect, useState } from "react";

import {
  type CmsAsset,
  type CmsItem,
  type CmsSolutionMetadata,
  type CmsStatus,
  type SubmissionItem,
} from "../../content/cms";
import {
  type HazardValue,
  type SolutionTypeValue,
} from "../../lib/solutionRepositoryOptions";
import { createCmsContentRepository } from "./cmsContentRepository";
import { createDraft, mergeSolution } from "./cmsViewModel";
import { type CmsSection, type EditorDraft, type PipelineMode } from "./types";

export function useCmsContentStudio() {
  const [cmsItems, setCmsItems] = useState<CmsItem[]>([]);
  const [cmsSubmissions, setCmsSubmissions] = useState<SubmissionItem[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    void loadSnapshot();
  }, []);

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

  const selectedItem = selectedItemId
    ? cmsItems.find((item) => item.id === selectedItemId)
    : undefined;
  const detailItem = detailItemId
    ? cmsItems.find((item) => item.id === detailItemId)
    : undefined;

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

  async function uploadCaseStudy(index: number, file?: File) {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(undefined);
    try {
      const asset = await createCmsContentRepository().uploadMedia(file);
      updateCaseStudy(index, asset);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  function removeCaseStudy(index: number) {
    updateSolution({
      caseStudies: mergeSolution(draft.solution).caseStudies.filter(
        (_asset, itemIndex) => itemIndex !== index,
      ),
    });
  }

  async function uploadImage(file?: File) {
    if (!file) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(undefined);
    try {
      const image = await createCmsContentRepository().uploadMedia(file);
      updateSolution({ image });
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function saveDraft() {
    setIsSaving(true);
    setErrorMessage(undefined);
    try {
      const repository = createCmsContentRepository();
      const savedItem = selectedItem
        ? await repository.saveItem(selectedItem.id, draft)
        : await repository.createItem(draft);

      if (!savedItem) {
        return;
      }

      setCmsItems((currentItems) => upsertItem(currentItems, savedItem));
      setSelectedItemId(savedItem.id);
      setDraft(createDraft(savedItem));
      setSection("editor");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function loadSnapshot() {
    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const snapshot = await createCmsContentRepository().loadSnapshot();
      setCmsItems(snapshot.items);
      setCmsSubmissions(snapshot.submissions);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setCmsItems([]);
      setCmsSubmissions([]);
    } finally {
      setIsLoading(false);
    }
  }

  return {
    cmsItems,
    cmsSubmissions,
    detailItem,
    draft,
    isSaving,
    isUploading,
    isLoading,
    linkDraft,
    pipelineMode,
    section,
    selectedItem,
    statusFilter,
    errorMessage,
    addCaseStudy,
    addUsefulLink,
    closeDetail: () => setDetailItemId(null),
    loadSnapshot,
    openDetail: setDetailItemId,
    openEditor,
    removeCaseStudy,
    removeUsefulLink,
    saveDraft,
    setDraft,
    setLinkDraft,
    setPipelineMode,
    setSection,
    setStatusFilter,
    toggleSolutionArrayValue,
    updateCaseStudy,
    updateSolution,
    uploadCaseStudy,
    uploadImage,
  };
}

function upsertItem(items: CmsItem[], item: CmsItem) {
  if (items.some((currentItem) => currentItem.id === item.id)) {
    return items.map((currentItem) =>
      currentItem.id === item.id ? item : currentItem,
    );
  }

  return [item, ...items];
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Content studio request failed.";
}
