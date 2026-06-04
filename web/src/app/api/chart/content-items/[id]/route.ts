import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import {
  type ChartCmsDraftInput,
  mapContentItem,
  mapDraftToContentData,
} from "@/lib/chartContent";
import { corsJson, corsOptions } from "@/lib/cors";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const payload = await getPayload({ config });
  const draft = (await request.json()) as ChartCmsDraftInput;
  const params = await context.params;
  const item = await payload.update({
    collection: "content-items",
    depth: 1,
    draft: true,
    id: params.id,
    data: mapDraftToContentData(draft),
    overrideAccess: true,
  });

  return corsJson(request, mapContentItem(item as never));
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
