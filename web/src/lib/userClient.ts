import type { ChartRole } from "../modules/auth/authClient";

export type UserGeographyScope = {
  geographyId: string;
  path: string;
  name: string;
  levelLabel: string;
};

export type ChartUserRecord = {
  userId: string;
  username: string;
  email?: string;
  phone?: string;
  displayName: string;
  status: "active" | "disabled";
  roles: ChartRole[];
  geographyScopes: UserGeographyScope[];
};

export type CreateUserInput = {
  name: string;
  email: string;
  phone?: string;
  username: string;
  password: string;
  roles: ChartRole[];
  geographyIds: string[];
};

export async function listUsers(accessToken?: string) {
  const response = await fetch("/api/chart/users", {
    cache: "no-store",
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(await readUserError(response));
  }

  return (await response.json()) as ChartUserRecord[];
}

export async function createUser(input: CreateUserInput, accessToken?: string) {
  const response = await fetch("/api/chart/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readUserError(response));
  }

  return (await response.json()) as ChartUserRecord;
}

export async function disableUser(userId: string, accessToken?: string) {
  const response = await fetch(
    `/api/chart/users/${encodeURIComponent(userId)}/disable`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readUserError(response));
  }

  return (await response.json()) as ChartUserRecord;
}

function authHeaders(accessToken: string | undefined): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

async function readUserError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };

    return userErrorMessage(body.error);
  } catch {
    return "CHART user access could not be updated.";
  }
}

function userErrorMessage(errorCode: string | undefined) {
  switch (errorCode) {
    case "AUTH_TOKEN_REQUIRED":
      return "Sign in again before managing users.";
    case "CHART_API_UNAVAILABLE":
      return "The CHART API is not reachable. Start the API service and try again.";
    case "USER_CANNOT_DISABLE_SELF":
      return "You cannot disable your own CHART administrator account.";
    case "USER_EMAIL_REQUIRED":
      return "Enter an email address for the user.";
    case "USER_FORBIDDEN":
      return "Only a CHART administrator can manage users.";
    case "USER_GEOGRAPHY_INVALID":
    case "USER_GEOGRAPHY_REQUIRED":
      return "Choose a valid geography scope for the user.";
    case "USER_IDENTITY_ADMIN_AUTH_FAILED":
    case "USER_IDENTITY_CONFIG_INVALID":
      return "CHART cannot connect to identity administration. Check Keycloak admin configuration.";
    case "USER_IDENTITY_CLIENT_MISSING":
    case "USER_IDENTITY_ROLE_MISSING":
      return "CHART identity roles are not configured correctly. Re-sync the Keycloak realm.";
    case "USER_IDENTITY_GROUP_FAILED":
      return "CHART could not prepare the selected geography in identity access.";
    case "USER_IDENTITY_UNAVAILABLE":
      return "The identity service is not reachable. Start Keycloak and try again.";
    case "USER_IDENTITY_USER_CONFLICT":
      return "That username or email is already used by another identity user.";
    case "USER_IDENTITY_USER_CREATE_FAILED":
      return "CHART could not create or update the identity user.";
    case "USER_NAME_REQUIRED":
      return "Enter the user's name.";
    case "USER_NOT_FOUND":
      return "That CHART user could not be found.";
    case "USER_PASSWORD_REQUIRED":
      return "Use a password with at least 8 characters.";
    case "USER_ROLE_INVALID":
    case "USER_ROLE_REQUIRED":
      return "Choose a valid role for the user.";
    case "USER_USERNAME_REQUIRED":
      return "Enter a username for the user.";
    default:
      return "CHART user access could not be updated.";
  }
}
