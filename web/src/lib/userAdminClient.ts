import { authFetch } from "./authFetch";

export type ChartRole =
  | "chart_admin"
  | "content_editor"
  | "health_planning_lead"
  | "cross_sector_planning_lead"
  | "health_implementation_officer"
  | "cross_sector_implementation_officer"
  | "public_viewer";

export type ManagedUser = {
  userId: string;
  username: string;
  email?: string;
  displayName: string;
  status: "active" | "disabled";
  roles: ChartRole[];
  geographyScopes: {
    geographyId: string;
    path: string;
    name: string;
    levelLabel: string;
  }[];
};

export async function listManagedUsers(accessToken: string) {
  const response = await adminFetch("/api/admin/users", accessToken);
  return (await response.json()) as ManagedUser[];
}

async function adminFetch(url: string, accessToken: string | null | undefined) {
  const response = await authFetch(url, { accessToken, timeoutMs: 20_000 });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(adminErrorMessage(body?.error));
  }
  return response;
}

function adminErrorMessage(code?: string) {
  switch (code) {
    case "USER_FORBIDDEN":
      return "Only a CHART administrator can manage people.";
    case "ADMIN_SERVICE_UNAVAILABLE":
      return "The CHART people service is unavailable.";
    default:
      return "CHART could not load people. Please try again.";
  }
}
