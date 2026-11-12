import { listActions } from "./actionsClient";
import { authFetch } from "./authFetch";
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
};

export async function getSetupStatus() {
  const response = await authFetch("/api/setup", { auth: false, timeoutMs: 15_000 });
  if (!response.ok) {
    throw new Error("CHART installation status is unavailable.");
  }
  return (await response.json()) as SetupStatus;
}

export async function getSetupOptions() {
  const response = await authFetch("/api/setup/options", {
    auth: false,
    timeoutMs: 15_000,
  });
  if (!response.ok) {
    throw new Error("CHART setup choices are unavailable.");
  }
  return (await response.json()) as SetupOptions;
}

export async function loadActionRepository(): Promise<ActionRepositoryStatus> {
  try {
    const { items } = await listActions();
    return { actionCount: items.length };
  } catch {
    throw new Error("The action repository could not be loaded. Try again.");
  }
}

/** The signed-in administrator (the default `admin`) completes setup. */
export async function completeChartSetup(
  state: OnboardingState,
  geographyCatalog: SetupCountryOption[],
  accessToken: string,
) {
  const response = await authFetch("/api/setup/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toSetupInput(state, geographyCatalog)),
    accessToken,
    timeoutMs: 60_000,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(setupErrorMessage(body?.error));
  }

  return (await response.json()) as SetupStatus;
}

function toSetupInput(state: OnboardingState, geographyCatalog: SetupCountryOption[]) {
  if (!state.country || !state.level || !state.geo || !state.primarySectorId) {
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

  return {
    countryCode: country.countryCode,
    countryName: country.countryName,
    geographyLevelLabel: chain[0].levelLabel,
    geographies,
    primarySectorId: state.primarySectorId,
    collaboratingSectorIds: [...state.collaboratingSectorIds],
  };
}

export async function resetInstallation(accessToken?: string | null) {
  const response = await authFetch("/api/setup/reset", {
    method: "POST",
    accessToken,
    timeoutMs: 20_000,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(resetErrorMessage(body?.error));
  }
  return (await response.json()) as SetupStatus;
}

export async function syncInstalledModels(accessToken?: string | null) {
  const response = await authFetch("/api/setup/models/sync", {
    method: "POST",
    accessToken,
    timeoutMs: 60_000,
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
    case "SETUP_FORBIDDEN":
      return "Only a CHART administrator can set up CHART. Sign in as admin.";
    case "AUTH_TOKEN_REQUIRED":
    case "AUTH_TOKEN_INVALID":
      return "Your session ended. Sign in again to finish setup.";
    case "SETUP_BOOTSTRAP_IN_PROGRESS":
    case "SETUP_PROVISIONING_LOST":
      return "Another setup attempt is running. Wait a few minutes and try again.";
    case "SETUP_SECTOR_REQUIRED":
      return "Choose the primary sector for this CHART installation.";
    case "SETUP_SECTOR_INVALID":
      return "One of the selected sectors is no longer available. Reload and choose again.";
    case "SETUP_GEOGRAPHY_MODEL_UNAVAILABLE":
      return "The selected geography does not have an installed model. Reload and choose an available area.";
    case "SETUP_IDENTITY_GROUP_FAILED":
      return "CHART could not give your account the installed country in Keycloak. Try again.";
    case "SETUP_MODEL_PREPARATION_FAILED":
      return "One or more installed models could not be verified and started. Check the model service and artifacts, then retry setup.";
    case "SETUP_SERVICE_UNAVAILABLE":
      return "The CHART setup service is unavailable. Check that the application API is running.";
    default:
      return "CHART could not finish installation setup. Please try again.";
  }
}
