import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import {
  type ChartCmsDraftInput,
  type StoredContentItem,
  mapContentItem,
  mapDraftToContentData,
} from "@/lib/chartContent";
import { getContentEditorAccess, requireContentEditor } from "@/lib/chartApiAccess";
import { corsJson, corsOptions } from "@/lib/cors";

export async function GET(request: NextRequest) {
  const access = await getContentEditorAccess(request);

  if ("response" in access) {
    return access.response;
  }

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "content-items",
    depth: 1,
    limit: 100,
    overrideAccess: true,
    sort: "-updatedAt",
    where: access.canEditContent
      ? undefined
      : {
          workflowState: {
            equals: "published",
          },
        },
  });

  return corsJson(
    request,
    result.docs.map((item) => mapContentItem(item as unknown as StoredContentItem)),
  );
}

export async function POST(request: NextRequest) {
  const access = await requireContentEditor(request);

  if ("response" in access) {
    return access.response;
  }

  const draft = (await request.json()) as ChartCmsDraftInput;
  const payload = await getPayload({ config });
  const item = await payload.create({
    collection: "content-items",
    depth: 1,
    draft: true,
    data: {
      ...mapDraftToContentData(draft),
      workflowState: "draft",
      owner: "Editorial team",
    },
    overrideAccess: true,
  });

  return corsJson(request, mapContentItem(item as unknown as StoredContentItem), {
    status: 201,
  });
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
