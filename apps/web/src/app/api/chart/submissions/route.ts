import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import { mapSubmission } from "@/lib/chartContent";
import { corsJson, corsOptions } from "@/lib/cors";

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "submissions",
    limit: 100,
    overrideAccess: true,
    sort: "-received",
  });

  return corsJson(
    request,
    result.docs.map((item) => mapSubmission(item as never)),
  );
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
