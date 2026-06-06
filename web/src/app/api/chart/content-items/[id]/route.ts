import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import {
  type ChartCmsDraftInput,
  type StoredContentItem,
  mapContentItem,
  mapDraftToContentData,
} from "@/lib/chartContent";
import { requireContentEditor } from "@/lib/chartApiAccess";
import { corsJson, corsOptions } from "@/lib/cors";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const access = await requireContentEditor(request);

  if ("response" in access) {
    return access.response;
  }

  const payload = await getPayload({ config });
  const draft = (await request.json()) as ChartCmsDraftInput;
  const params = await context.params;
  const itemId = Number(params.id);

  if (!Number.isInteger(itemId)) {
    return corsJson(request, { error: "CONTENT_ITEM_ID_INVALID" }, { status: 400 });
  }

  const item = await payload.update({
    collection: "content-items",
    depth: 1,
    draft: true,
    id: itemId,
    data: mapDraftToContentData(draft),
    overrideAccess: true,
  });

  return corsJson(request, mapContentItem(item as unknown as StoredContentItem));
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
