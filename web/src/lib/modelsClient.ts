export type ModelFileInfo = {
  filename: string;
  sha256: string;
};

export type ReleaseInfo = {
  id: string;
  version: string;
  outcome: string;
  outcome_label: string;
  climate_hazard: string | null;
  climate_hazard_label: string | null;
  health_domain: string | null;
  health_domain_label: string | null;
  status: string;
  activated_at: string | null;
  created_at: string;
  model_files: ModelFileInfo[];
  area_count: number;
  manifest_source_path: string | null;
  base_uri: string | null;
  source_git_ref: string | null;
  release_notes: string | null;
  is_active: boolean;
};

export type ModelSyncResponse = {
  activeReleaseIds: string[];
  assignmentCount: number;
};

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function listModelReleases(): Promise<ReleaseInfo[]> {
  const body = await request<{ items: ReleaseInfo[] }>("/api/chart/model-releases");
  return body.items;
}

export async function reloadModelRelease(releaseId: string): Promise<void> {
  await request(`/api/chart/model-releases/${encodeURIComponent(releaseId)}/reload`, {
    method: "POST",
  });
}

export async function syncDeployedModels(): Promise<ModelSyncResponse> {
  return request<ModelSyncResponse>("/api/setup/models/sync", { method: "POST" });
}
