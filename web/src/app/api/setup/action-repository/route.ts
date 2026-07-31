import { NextResponse } from "next/server";

const defaultLegacyApiUrl = "http://127.0.0.1:3200";

type RepositorySolution = {
  sourceRecordId?: string | null;
};

type RepositoryResponse = {
  items?: RepositorySolution[];
  total?: number;
};

export const dynamic = "force-dynamic";

export async function GET() {
  const apiUrl = (
    process.env.CHART_API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_CHART_API_URL ??
    defaultLegacyApiUrl
  ).replace(/\/$/, "");

  try {
    const response = await fetch(`${apiUrl}/solutions?limit=100&status=published`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "ACTION_REPOSITORY_UNAVAILABLE" },
        { status: 502 },
      );
    }

    const repository = (await response.json()) as RepositoryResponse;
    const items = Array.isArray(repository.items) ? repository.items : [];
    const actionCount =
      typeof repository.total === "number" ? repository.total : items.length;

    return NextResponse.json({
      actionCount,
      trackedActionCount: items.filter((item) => item.sourceRecordId?.trim()).length,
    });
  } catch {
    return NextResponse.json(
      { error: "ACTION_REPOSITORY_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
