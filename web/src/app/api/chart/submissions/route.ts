import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import { type StoredSubmission, mapSubmission } from "@/lib/chartContent";
import { requireContentEditor } from "@/lib/chartApiAccess";
import { corsJson, corsOptions } from "@/lib/cors";

export async function GET(request: NextRequest) {
  const access = await requireContentEditor(request);

  if ("response" in access) {
    return access.response;
  }

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "submissions",
    limit: 100,
    overrideAccess: true,
    sort: "-received",
  });

  return corsJson(
    request,
    result.docs.map((item) => mapSubmission(item as unknown as StoredSubmission)),
  );
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
