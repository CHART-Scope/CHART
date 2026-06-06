import { NextRequest } from "next/server";
import { getPayload } from "payload";

import config from "@payload-config";

import { requireContentEditor } from "@/lib/chartApiAccess";
import { corsJson, corsOptions } from "@/lib/cors";

export async function POST(request: NextRequest) {
  const access = await requireContentEditor(request);

  if ("response" in access) {
    return access.response;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return corsJson(request, { error: "FILE_REQUIRED" }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const media = await payload.create({
    collection: "media",
    data: {
      alt: formData.get("alt")?.toString() ?? file.name,
      source: "content-studio",
    },
    file: {
      data: Buffer.from(await file.arrayBuffer()),
      mimetype: file.type,
      name: file.name,
      size: file.size,
    },
    overrideAccess: true,
  });

  return corsJson(
    request,
    {
      id: media.id,
      url: media.url,
      filename: media.filename,
      type: media.mimeType,
      size: media.filesize,
    },
    { status: 201 },
  );
}

export function OPTIONS(request: NextRequest) {
  return corsOptions(request);
}
