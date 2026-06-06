"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { type CmsAsset, type CmsItem, type SubmissionItem } from "../content/cms";
import {
  landingGovernmentQuestions,
  landingNavLinks,
  landingPriorityExamples,
  landingPriorityStatement,
  landingResourceSections,
  landingWorkflowSteps,
} from "../content/landing";
import {
  createCmsContentRepository,
  type CmsContentRepository,
  type CmsDraftInput,
} from "../modules/cms/cmsContentRepository";

type ChartContentValue = {
  landingNavLinks: typeof landingNavLinks;
  landingPriorityStatement: typeof landingPriorityStatement;
  landingPriorityExamples: typeof landingPriorityExamples;
  landingGovernmentQuestions: typeof landingGovernmentQuestions;
  landingWorkflowSteps: typeof landingWorkflowSteps;
  landingResourceSections: typeof landingResourceSections;
  cmsItems: CmsItem[];
  cmsSubmissions: SubmissionItem[];
  saveCmsItem: (itemId: string, draft: CmsDraftInput) => Promise<CmsItem | undefined>;
  createCmsItem: (draft: CmsDraftInput) => Promise<CmsItem>;
  uploadCmsMedia: (file: File) => Promise<CmsAsset>;
};

const chartContentContext = createContext<ChartContentValue | null>(null);

export function ChartContentProvider({ children }: { children: ReactNode }) {
  const cmsRepositoryRef = useRef<CmsContentRepository>(createCmsContentRepository());
  const [cmsItems, setCmsItems] = useState<CmsItem[]>([]);
  const [cmsSubmissions, setCmsSubmissions] = useState<SubmissionItem[]>([]);

  useEffect(() => {
    async function loadCmsSnapshot() {
      try {
        const snapshot = await cmsRepositoryRef.current.loadSnapshot();
        setCmsItems(snapshot.items);
        setCmsSubmissions(snapshot.submissions);
      } catch {
        setCmsItems([]);
        setCmsSubmissions([]);
      }
    }

    void loadCmsSnapshot();
  }, []);

  async function saveCmsItem(itemId: string, draft: CmsDraftInput) {
    const updatedItem = await cmsRepositoryRef.current.saveItem(itemId, draft);

    if (!updatedItem) {
      return undefined;
    }

    setCmsItems((currentItems) =>
      currentItems.map((item) => {
        return item.id === updatedItem.id ? updatedItem : item;
      }),
    );

    return updatedItem;
  }

  async function createCmsItem(draft: CmsDraftInput) {
    const newItem = await cmsRepositoryRef.current.createItem(draft);
    setCmsItems((currentItems) => [newItem, ...currentItems]);
    return newItem;
  }

  async function uploadCmsMedia(file: File) {
    return cmsRepositoryRef.current.uploadMedia(file);
  }

  const value: ChartContentValue = {
    landingNavLinks,
    landingPriorityStatement,
    landingPriorityExamples,
    landingGovernmentQuestions,
    landingWorkflowSteps,
    landingResourceSections,
    cmsItems,
    cmsSubmissions,
    saveCmsItem,
    createCmsItem,
    uploadCmsMedia,
  };

  return (
    <chartContentContext.Provider value={value}>
      {children}
    </chartContentContext.Provider>
  );
}

export function useChartContent() {
  const value = useContext(chartContentContext);

  if (!value) {
    throw new Error("useChartContent must be used inside ChartContentProvider.");
  }

  return value;
}
