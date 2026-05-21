import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import {
  type ChartCmsDraftInput,
  mapContentItem,
  mapDraftToContentData,
} from "@/lib/chartContent";
import { corsJson, corsOptions } from "@/lib/cors";

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "content-items",
    limit: 100,
    overrideAccess: true,
    sort: "-updatedAt",
  });

  return corsJson(
    request,
    result.docs.map((item) => mapContentItem(item as never)),
  );
}

export async function POST(request: NextRequest) {
  const draft = (await request.json()) as ChartCmsDraftInput;
  const payload = await getPayload({ config });
  const item = await payload.create({
    collection: "content-items",
    data: {
      ...mapDraftToContentData(draft),
      workflowState: "draft",
      owner: "Editorial team",
    },
    overrideAccess: true,
  });

  return corsJson(request, mapContentItem(item as never), { status: 201 });
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
