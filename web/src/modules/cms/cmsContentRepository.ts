import { type CmsItem, type SubmissionItem } from "../../content/cms";

const defaultCmsApiBaseUrl = "/api/chart";

export type CmsDraftInput = Pick<
  CmsItem,
  "title" | "summary" | "body" | "type" | "tag" | "solution"
>;

type CmsRepositorySnapshot = {
  items: CmsItem[];
  submissions: SubmissionItem[];
};

export type CmsContentRepository = {
  loadSnapshot: () => Promise<CmsRepositorySnapshot>;
  saveItem: (itemId: string, draft: CmsDraftInput) => Promise<CmsItem | undefined>;
  createItem: (draft: CmsDraftInput) => Promise<CmsItem>;
};

export function createCmsContentRepository(): CmsContentRepository {
  return {
    async loadSnapshot() {
      const [itemsResponse, submissionsResponse] = await Promise.all([
        fetch(`${defaultCmsApiBaseUrl}/content-items`),
        fetch(`${defaultCmsApiBaseUrl}/submissions`),
      ]);

      if (!itemsResponse.ok || !submissionsResponse.ok) {
        throw new Error("CMS snapshot request failed.");
      }

      return {
        items: (await itemsResponse.json()) as CmsItem[],
        submissions: (await submissionsResponse.json()) as SubmissionItem[],
      };
    },
    async saveItem(itemId, draft) {
      const response = await fetch(`${defaultCmsApiBaseUrl}/content-items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        throw new Error("CMS save request failed.");
      }

      return (await response.json()) as CmsItem;
    },
    async createItem(draft) {
      const response = await fetch(`${defaultCmsApiBaseUrl}/content-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        throw new Error("CMS create request failed.");
      }

      return (await response.json()) as CmsItem;
    },
  };
}
