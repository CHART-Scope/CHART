export type SetupStatus = {
  completed: boolean;
  requiresOnboarding: boolean;
  countryCode?: string;
  countryName?: string;
  rootGeographyId?: string;
  firstAdminUserId?: string;
  selectedHazards: {
    id: string;
    label: string;
  }[];
  counts: {
    geographies: number;
    workspaceMembers: number;
  };
};

export type CompleteSetupInput = {
  countryCode: string;
  countryName: string;
  geographyLevelLabel: string;
  hazardIds: string[];
};

export type BootstrapSetupInput = CompleteSetupInput & {
  admin: {
    name: string;
    email: string;
    username: string;
    password: string;
  };
};

export type BootstrapSetupResponse = {
  setup: SetupStatus;
  admin: {
    userId: string;
    username: string;
    email: string;
  };
  tokens: {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
  };
};

export type SetupOptions = {
  hazards: {
    id: string;
    label: string;
  }[];
};

export async function getSetupStatus(options: { signal?: AbortSignal } = {}) {
  const response = await fetch("/api/chart/setup/status", {
    cache: "no-store",
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error("Could not read CHART setup status.");
  }

  return (await response.json()) as SetupStatus;
}

export async function getSetupOptions() {
  const response = await fetch("/api/chart/setup/options", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load CHART setup options.");
  }

  return (await response.json()) as SetupOptions;
}

export async function completeSetup(input: CompleteSetupInput, accessToken?: string) {
  const response = await fetch("/api/chart/setup/complete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readSetupError(response));
  }

  return (await response.json()) as SetupStatus;
}

export async function bootstrapSetup(input: BootstrapSetupInput) {
  const response = await fetch("/api/chart/setup/bootstrap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readSetupError(response));
  }

  return (await response.json()) as BootstrapSetupResponse;
}

export async function resetSetup(accessToken?: string) {
  const response = await fetch("/api/chart/setup/reset", {
    method: "POST",
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(await readSetupError(response));
  }

  return (await response.json()) as SetupStatus;
}

async function readSetupError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };

    return setupErrorMessage(body.error);
  } catch {
    return "CHART setup could not be updated.";
  }
}

function setupErrorMessage(errorCode: string | undefined) {
  switch (errorCode) {
    case "AUTH_TOKEN_REQUIRED":
      return "Sign in again before changing setup.";
    case "CHART_API_UNAVAILABLE":
      return "The CHART API is not reachable. Start the API service and try again.";
    case "SETUP_ADMIN_PASSWORD_REQUIRED":
    case "SETUP_IDENTITY_PASSWORD_REJECTED":
      return "Use a stronger password for the first administrator.";
    case "SETUP_ADMIN_REQUIRED":
      return "Enter the first administrator name, email, username, and password.";
    case "SETUP_BOOTSTRAP_LOCKED":
      return "First setup is already locked. Sign in as a CHART administrator to update setup.";
    case "SETUP_COUNTRY_REQUIRED":
      return "Choose the country and geography level for this CHART deployment.";
    case "SETUP_FORBIDDEN":
      return "Only a CHART administrator can change setup.";
    case "SETUP_HAZARD_INVALID":
      return "One or more selected hazards are no longer available from the chart repository.";
    case "SETUP_HAZARD_REQUIRED":
      return "Choose at least one hazard to personalize this CHART deployment.";
    case "SETUP_IDENTITY_ADMIN_AUTH_FAILED":
    case "SETUP_IDENTITY_CONFIG_INVALID":
      return "CHART cannot connect to identity administration. Check the Keycloak admin configuration.";
    case "SETUP_IDENTITY_CLIENT_MISSING":
    case "SETUP_IDENTITY_ROLE_MISSING":
      return "CHART identity roles are not configured correctly. Re-sync the Keycloak realm.";
    case "SETUP_IDENTITY_GROUP_FAILED":
      return "CHART could not prepare the selected country in identity access. Try another country or re-sync identity.";
    case "SETUP_IDENTITY_UNAVAILABLE":
      return "The identity service is not reachable. Start Keycloak and try again.";
    case "SETUP_IDENTITY_USER_CONFLICT":
      return "That username or email is already used by another identity user. Use a different first admin account.";
    case "SETUP_IDENTITY_USER_CREATE_FAILED":
      return "CHART could not create or update the first administrator account.";
    case "SETUP_SIGN_IN_FAILED":
      return "The administrator was created, but CHART could not sign in with those credentials. Try signing in manually.";
    default:
      return "CHART setup could not be updated.";
  }
}
