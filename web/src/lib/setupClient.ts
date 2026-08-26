import type {
  OnboardingState,
  SetupSector,
} from "@/features/onboarding/OnboardingWizard";
import type { SetupCountryOption } from "@/features/onboarding/data/geo";

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
  geographies?: SetupCountryOption[];
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

export async function bootstrapChartSetup(
  state: OnboardingState,
  geographyCatalog: SetupCountryOption[],
) {
  const response = await fetch("/api/setup/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toBootstrapInput(state, geographyCatalog)),
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

function toBootstrapInput(
  state: OnboardingState,
  geographyCatalog: SetupCountryOption[],
) {
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

  const country = geographyCatalog.find(
    (option) => option.countryName === state.country,
  );
  if (!country) throw new Error("The selected country is no longer configured.");
  const selectedName = state.subgeo ?? state.geo;
  const selected = country.places.find(
    (place) => place.name === selectedName && place.levelLabel === state.level,
  );
  if (!selected) throw new Error("The selected geography is no longer configured.");
  const byCode = new Map(country.places.map((place) => [place.placeCode, place]));
  const chain = [selected];
  let parentCode = selected.parentPlaceCode;
  while (parentCode) {
    const parent = byCode.get(parentCode);
    if (!parent) throw new Error("The selected geography hierarchy is incomplete.");
    chain.unshift(parent);
    parentCode = parent.parentPlaceCode;
  }
  const geographies = chain.map((place) => ({
    id: place.id,
    level: place.level,
    levelLabel: place.levelLabel,
    name: place.name,
    parentId:
      place.parentPlaceCode === null
        ? country.rootId
        : byCode.get(place.parentPlaceCode)?.id,
    path: place.path,
    sortOrder: place.sortOrder,
  }));

  const adminEmail = state.adminEmail.trim().toLowerCase();
  return {
    countryCode: country.countryCode,
    countryName: country.countryName,
    geographyLevelLabel: chain[0].levelLabel,
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

export async function resetInstallation(accessToken: string) {
  const response = await fetch("/api/setup/reset", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(resetErrorMessage(body?.error));
  }
  return (await response.json()) as SetupStatus;
}

export async function syncInstalledModels(accessToken: string) {
  const response = await fetch("/api/setup/models/sync", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error === "SETUP_MODEL_PREPARATION_FAILED"
        ? "A model artifact could not be verified and prepared."
        : "CHART could not check for model updates.",
    );
  }
  return (await response.json()) as {
    activeReleaseIds: string[];
    assignmentCount: number;
  };
}

function resetErrorMessage(code?: string) {
  switch (code) {
    case "SETUP_FORBIDDEN":
      return "Only a CHART administrator can reset the installation.";
    case "SETUP_UNAUTHENTICATED":
      return "Sign in again to reset the installation.";
    case "SETUP_SERVICE_UNAVAILABLE":
      return "The CHART setup service is unavailable.";
    default:
      return "CHART could not reset the installation. Please try again.";
  }
}

function setupErrorMessage(code?: string) {
  switch (code) {
    case "SETUP_BOOTSTRAP_LOCKED":
      return "This CHART installation has already been set up. Return to sign in.";
    case "SETUP_BOOTSTRAP_IN_PROGRESS":
      return "A CHART setup attempt is already running. Wait a few minutes and retry.";
    case "SETUP_BOOTSTRAP_REQUEST_MISMATCH":
      return "Another setup request is still running with different details. Wait a moment, then try again.";
    case "SETUP_PROVISIONING_LOST":
      return "The CHART setup session was interrupted. Try launching setup again.";
    case "SETUP_ADMIN_PASSWORD_REQUIRED":
    case "SETUP_IDENTITY_PASSWORD_REJECTED":
      return "Use an administrator password with at least eight characters.";
    case "SETUP_IDENTITY_USER_CONFLICT":
      return "That administrator account already exists. Use a different email address.";
    case "SETUP_SECTOR_REQUIRED":
      return "Choose the primary sector for this CHART installation.";
    case "SETUP_SECTOR_INVALID":
      return "One of the selected sectors is no longer available. Reload and choose again.";
    case "SETUP_GEOGRAPHY_MODEL_UNAVAILABLE":
      return "The selected geography does not have an installed model. Reload and choose an available area.";
    case "SETUP_IDENTITY_ADMIN_AUTH_FAILED":
    case "SETUP_IDENTITY_CONFIG_INVALID":
    case "SETUP_IDENTITY_CLIENT_MISSING":
    case "SETUP_IDENTITY_ROLE_MISSING":
      return "Keycloak is not ready for the first administrator. Check the CHART identity configuration.";
    case "SETUP_IDENTITY_GROUP_FAILED":
    case "SETUP_IDENTITY_UNAVAILABLE":
    case "SETUP_IDENTITY_USER_CREATE_FAILED":
      return "CHART could not create the first administrator in Keycloak. Try again.";
    case "SETUP_MODEL_PREPARATION_FAILED":
      return "One or more installed models could not be verified and started. Check the model service and artifacts, then retry setup.";
    case "SETUP_SERVICE_UNAVAILABLE":
      return "The CHART setup service is unavailable. Check that the application API is running.";
    default:
      return "CHART could not finish installation setup. Please try again.";
  }
}
