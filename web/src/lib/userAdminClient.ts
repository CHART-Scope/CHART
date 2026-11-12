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
  /** Set right after an invitation was attempted. */
  invitation?: "sent" | "failed" | null;
};

export type Invitation = {
  name: string;
  email: string;
  role: ChartRole;
  geographyId: string;
};

export async function listManagedUsers(accessToken: string) {
  const response = await adminFetch("/api/admin/users", accessToken);
  return (await response.json()) as ManagedUser[];
}

/** Adds the person (no password) and has Keycloak email their invitation. */
export async function invitePerson(invitation: Invitation, accessToken: string) {
  const email = invitation.email.trim().toLowerCase();
  const response = await adminFetch("/api/admin/users", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: invitation.name.trim(),
      email,
      username: email,
      roles: [invitation.role],
      geographyIds: [invitation.geographyId],
    }),
  });
  return (await response.json()) as ManagedUser;
}

export async function resendInvitation(userId: string, accessToken: string) {
  const response = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/invitation`,
    accessToken,
    { method: "POST" },
  );
  return (await response.json()) as ManagedUser;
}

async function adminFetch(
  url: string,
  accessToken: string | null | undefined,
  init: RequestInit = {},
) {
  const response = await authFetch(url, { ...init, accessToken, timeoutMs: 20_000 });

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
      return "That planning area is no longer available. Choose another.";
    case "USER_ROLE_INVALID":
      return "Choose one of the listed roles.";
    case "USER_INVITE_FAILED":
      return "The invitation email could not be sent. Check CHART's email settings, then try again.";
    case "USER_DISABLED":
      return "This account is turned off, so it cannot be invited.";
    case "ADMIN_SERVICE_UNAVAILABLE":
      return "The CHART people service is unavailable.";
    default:
      return "CHART could not complete that. Please try again.";
  }
}
