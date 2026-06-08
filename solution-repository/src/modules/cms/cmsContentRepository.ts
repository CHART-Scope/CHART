import { type CmsAsset, type CmsItem, type SubmissionItem } from "../../content/cms";
import {
  mapContentItem,
  mapDraftToContentData,
  mapSubmission,
  type StoredContentItem,
  type StoredSubmission,
} from "../../lib/chartContent";

const payloadApiBaseUrl = "/api";

export type CmsDraftInput = Pick<
  CmsItem,
  "title" | "summary" | "body" | "tag" | "solution"
>;

type CmsRepositorySnapshot = {
  items: CmsItem[];
  submissions: SubmissionItem[];
};

type PayloadListResponse<TDoc> = {
  docs: TDoc[];
};

type StoredMediaResponse = {
  id?: string | number;
  url?: string;
  filename?: string;
  mimeType?: string;
  filesize?: number;
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
      const itemsResult = await fetchPayloadJson<
        PayloadListResponse<StoredContentItem>
      >(`${payloadApiBaseUrl}/content-items?depth=1&limit=100&sort=-updatedAt`);

      return {
        items: itemsResult.docs.map(mapContentItem),
        submissions: await loadSubmissions(),
      };
    },
    async saveItem(itemId, draft) {
      const item = await fetchPayloadJson<StoredContentItem>(
        `${payloadApiBaseUrl}/content-items/${itemId}?depth=1`,
        {
          method: "PATCH",
          headers: jsonHeaders(),
          body: JSON.stringify(mapDraftToContentData(draft)),
        },
      );

      return mapContentItem(item);
    },
    async createItem(draft) {
      const item = await fetchPayloadJson<StoredContentItem>(
        `${payloadApiBaseUrl}/content-items?depth=1`,
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify(mapDraftToContentData(draft)),
        },
      );

      return mapContentItem(item);
    },
    async uploadMedia(file) {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("_payload", JSON.stringify({ alt: file.name }));

      const media = await fetchPayloadJson<StoredMediaResponse>(
        `${payloadApiBaseUrl}/media`,
        {
          method: "POST",
          body: formData,
        },
      );

      return {
        id: media.id,
        url: media.url,
        filename: media.filename,
        type: media.mimeType,
        size: media.filesize,
      } satisfies CmsAsset;
    },
  };
}

async function loadSubmissions() {
  try {
    const result = await fetchPayloadJson<PayloadListResponse<StoredSubmission>>(
      `${payloadApiBaseUrl}/submissions?limit=100&sort=-received`,
    );

    return result.docs.map(mapSubmission);
  } catch {
    return [];
  }
}

async function fetchPayloadJson<TResponse>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Payload request failed: ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

function jsonHeaders() {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  return headers;
}
