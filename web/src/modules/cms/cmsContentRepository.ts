import { type CmsAsset, type CmsItem, type SubmissionItem } from "../../content/cms";
import { getStoredAuthSession } from "../auth/authClient";

const defaultCmsApiBaseUrl = "/api/chart";

export type CmsDraftInput = Pick<
  CmsItem,
  "title" | "summary" | "body" | "tag" | "solution"
>;

type CmsRepositorySnapshot = {
  items: CmsItem[];
  submissions: SubmissionItem[];
};

export type CmsContentRepository = {
  loadSnapshot: () => Promise<CmsRepositorySnapshot>;
  saveItem: (itemId: string, draft: CmsDraftInput) => Promise<CmsItem | undefined>;
  createItem: (draft: CmsDraftInput) => Promise<CmsItem>;
  uploadMedia: (file: File) => Promise<CmsAsset>;
};

export function createCmsContentRepository(): CmsContentRepository {
  return {
    async loadSnapshot() {
      const itemsResponse = await fetch(`${defaultCmsApiBaseUrl}/content-items`);

      if (!itemsResponse.ok) {
        throw new Error("CMS content request failed.");
      }

      return {
        items: (await itemsResponse.json()) as CmsItem[],
        submissions: await loadSubmissions(),
      };
    },
    async saveItem(itemId, draft) {
      const response = await fetch(`${defaultCmsApiBaseUrl}/content-items/${itemId}`, {
        method: "PATCH",
        headers: jsonAuthHeaders(),
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
        headers: jsonAuthHeaders(),
        body: JSON.stringify(draft),
      });

      if (!response.ok) {
        throw new Error("CMS create request failed.");
      }

      return (await response.json()) as CmsItem;
    },
    async uploadMedia(file) {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("alt", file.name);

      const response = await fetch(`${defaultCmsApiBaseUrl}/media`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error("CMS media upload failed.");
      }

      return (await response.json()) as CmsAsset;
    },
  };
}

async function loadSubmissions() {
  const headers = authHeaders();

  if (!headers.has("Authorization")) {
    return [];
  }

  const response = await fetch(`${defaultCmsApiBaseUrl}/submissions`, {
    headers,
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as SubmissionItem[];
}

function jsonAuthHeaders() {
  const headers = authHeaders();

  headers.set("Content-Type", "application/json");

  return headers;
}

function authHeaders() {
  const headers = new Headers();
  const accessToken = getStoredAuthSession()?.accessToken;

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return headers;
}
