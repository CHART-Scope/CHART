"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { type CmsItem, type SubmissionItem } from "../content/cms";
import {
  dashboardActions,
  dashboardBoundary,
  dashboardFilters,
  dashboardHealthPosts,
  dashboardMetrics,
  dashboardPlans,
  dashboardZones,
} from "../content/dashboard";
import {
  datasetSources,
  landingNavLinks,
  landingResourceSections,
  landingSummarySteps,
  licenseLayers,
} from "../content/landing";
import {
  createCmsContentRepository,
  type CmsContentRepository,
  type CmsDraftInput,
} from "../modules/cms/cmsContentRepository";

type ChartContentValue = {
  landingNavLinks: typeof landingNavLinks;
  landingSummarySteps: typeof landingSummarySteps;
  landingResourceSections: typeof landingResourceSections;
  licenseLayers: typeof licenseLayers;
  datasetSources: typeof datasetSources;
  dashboardFilters: typeof dashboardFilters;
  dashboardMetrics: typeof dashboardMetrics;
  dashboardActions: typeof dashboardActions;
  dashboardPlans: typeof dashboardPlans;
  dashboardBoundary: typeof dashboardBoundary;
  dashboardZones: typeof dashboardZones;
  dashboardHealthPosts: typeof dashboardHealthPosts;
  cmsItems: CmsItem[];
  cmsSubmissions: SubmissionItem[];
  saveCmsItem: (itemId: string, draft: CmsDraftInput) => Promise<CmsItem | undefined>;
  createCmsItem: (draft: CmsDraftInput) => Promise<CmsItem>;
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

  const value = useMemo<ChartContentValue>(
    () => ({
      landingNavLinks,
      landingSummarySteps,
      landingResourceSections,
      licenseLayers,
      datasetSources,
      dashboardFilters,
      dashboardMetrics,
      dashboardActions,
      dashboardPlans,
      dashboardBoundary,
      dashboardZones,
      dashboardHealthPosts,
      cmsItems,
      cmsSubmissions,
      saveCmsItem,
      createCmsItem,
    }),
    [cmsItems, cmsSubmissions],
  );

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
