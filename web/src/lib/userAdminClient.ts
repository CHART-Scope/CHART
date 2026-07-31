export type ChartRole =
  | "chart_admin"
  | "content_editor"
  | "health_planning_lead"
  | "cross_sector_planning_lead"
  | "health_implementation_officer"
  | "cross_sector_implementation_officer"
  | "public_viewer";

export type AdminGeography = {
  id: string;
  countryCode: string;
  level: "country" | "geo_level_1" | "geo_level_2" | "geo_level_3";
  levelLabel: string;
  name: string;
  parentId: string | null;
  path: string;
};

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

export type InviteUserInput = {
  name: string;
  email: string;
  password: string;
  role: ChartRole;
  geographyId: string;
};

export async function listManagedUsers(accessToken: string) {
  const response = await adminFetch("/api/admin/users", accessToken);
  return (await response.json()) as ManagedUser[];
}

export async function listAdminGeographies(accessToken: string) {
  const response = await adminFetch("/api/admin/geographies", accessToken);
  return (await response.json()) as AdminGeography[];
}

export async function inviteUser(input: InviteUserInput, accessToken: string) {
  const email = input.email.trim().toLowerCase();
  const response = await adminFetch("/api/admin/users", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name.trim(),
      email,
      username: email,
      password: input.password,
      roles: [input.role],
      geographyIds: [input.geographyId],
    }),
  });
  return (await response.json()) as ManagedUser;
}

async function adminFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

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
    case "USER_IDENTITY_USER_CONFLICT":
      return "An account already uses that email address.";
    case "USER_GEOGRAPHY_INVALID":
      return "That planning area is no longer available.";
    case "USER_PASSWORD_REQUIRED":
      return "Use a temporary password with at least eight characters.";
    case "USER_IDENTITY_ADMIN_AUTH_FAILED":
    case "USER_IDENTITY_CONFIG_INVALID":
    case "USER_IDENTITY_CLIENT_MISSING":
    case "USER_IDENTITY_ROLE_MISSING":
      return "Keycloak administrator settings are incomplete.";
    case "ADMIN_SERVICE_UNAVAILABLE":
      return "The CHART people service is unavailable.";
    default:
      return "CHART could not create this account. Please try again.";
  }
}
