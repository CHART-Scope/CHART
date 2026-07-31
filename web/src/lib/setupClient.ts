import type {
  OnboardingState,
  SetupSector,
} from "@/features/onboarding/OnboardingWizard";

export type { SetupSector };

export type SetupStatus = {
  completed: boolean;
  requiresOnboarding: boolean;
  countryCode?: string;
  countryName?: string;
  rootGeographyId?: string;
  firstAdminUserId?: string;
  primarySectorId?: string;
  collaboratingSectorIds: string[];
  counts: {
    geographies: number;
    workspaceMembers: number;
  };
};

export type SetupOptions = {
  sectors?: SetupSector[];
};

export type ActionRepositoryStatus = {
  actionCount: number;
  trackedActionCount: number;
};

export type BootstrapSetupResult = {
  setup: SetupStatus;
  admin: {
    userId: string;
    username: string;
    email: string;
  };
};

export async function getSetupStatus() {
  const response = await fetch("/api/setup", {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("CHART installation status is unavailable.");
  }
  return (await response.json()) as SetupStatus;
}

export async function getSetupOptions() {
  const response = await fetch("/api/setup/options", {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error("CHART setup choices are unavailable.");
  }
  return (await response.json()) as SetupOptions;
}

export async function loadActionRepository() {
  const response = await fetch("/api/setup/action-repository", {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(
      "The action repository could not be loaded. Check the repository service and try again.",
    );
  }
  return (await response.json()) as ActionRepositoryStatus;
}

export async function bootstrapChartSetup(state: OnboardingState) {
  const response = await fetch("/api/setup/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toBootstrapInput(state)),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(setupErrorMessage(body?.error));
  }

  return (await response.json()) as BootstrapSetupResult;
}

function toBootstrapInput(state: OnboardingState) {
  if (
    !state.country ||
    !state.level ||
    !state.geo ||
    !state.primarySectorId ||
    !state.adminName.trim() ||
    !state.adminEmail.trim() ||
    state.adminPassword.length < 8
  ) {
    throw new Error("Complete every setup step before launching CHART.");
  }

  const countryCode = state.country === "India" ? "IN" : "KE";
  const countrySlug = slugify(state.country);
  const rootId = `geo-${countryCode.toLowerCase()}`;
  const geographyLevelLabel = state.country === "India" ? "State" : "County";
  const hasFirstLevel = state.level !== "National";
  const firstId = `geo-${countryCode.toLowerCase()}-${slugify(state.geo)}`;
  const firstPath = `/${countrySlug}/${slugify(state.geo)}`;
  const geographies = hasFirstLevel
    ? [
        {
          id: firstId,
          level: "geo_level_1",
          levelLabel: geographyLevelLabel,
          name: state.geo,
          parentId: rootId,
          path: firstPath,
          sortOrder: 10,
        },
      ]
    : [];

  if (state.subgeo) {
    geographies.push({
      id: `${firstId}-${slugify(state.subgeo)}`,
      level: "geo_level_2",
      levelLabel: state.country === "India" ? "District" : "Sub-county",
      name: state.subgeo,
      parentId: firstId,
      path: `${firstPath}/${slugify(state.subgeo)}`,
      sortOrder: 20,
    });
  }

  const adminEmail = state.adminEmail.trim().toLowerCase();
  return {
    countryCode,
    countryName: state.country,
    geographyLevelLabel,
    geographies,
    primarySectorId: state.primarySectorId,
    collaboratingSectorIds: [...state.collaboratingSectorIds],
    admin: {
      name: state.adminName.trim(),
      email: adminEmail,
      username: adminEmail,
      password: state.adminPassword,
    },
  };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function setupErrorMessage(code?: string) {
  switch (code) {
    case "SETUP_BOOTSTRAP_LOCKED":
      return "This CHART installation has already been set up. Return to sign in.";
    case "SETUP_ADMIN_PASSWORD_REQUIRED":
    case "SETUP_IDENTITY_PASSWORD_REJECTED":
      return "Use an administrator password with at least eight characters.";
    case "SETUP_IDENTITY_USER_CONFLICT":
      return "That administrator account already exists. Use a different email address.";
    case "SETUP_SECTOR_REQUIRED":
      return "Choose the primary sector for this CHART installation.";
    case "SETUP_SECTOR_INVALID":
      return "One of the selected sectors is no longer available. Reload and choose again.";
    case "SETUP_IDENTITY_ADMIN_AUTH_FAILED":
    case "SETUP_IDENTITY_CONFIG_INVALID":
    case "SETUP_IDENTITY_CLIENT_MISSING":
    case "SETUP_IDENTITY_ROLE_MISSING":
      return "Keycloak is not ready for the first administrator. Check the CHART identity configuration.";
    case "SETUP_IDENTITY_GROUP_FAILED":
    case "SETUP_IDENTITY_UNAVAILABLE":
    case "SETUP_IDENTITY_USER_CREATE_FAILED":
      return "CHART could not create the first administrator in Keycloak. Try again.";
    case "SETUP_SERVICE_UNAVAILABLE":
      return "The CHART setup service is unavailable. Check that the application API is running.";
    default:
      return "CHART could not finish installation setup. Please try again.";
  }
}
