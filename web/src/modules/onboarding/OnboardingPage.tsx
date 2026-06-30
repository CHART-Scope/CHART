"use client";

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CountryOption } from "../../lib/countries";
import {
  bootstrapSetup,
  completeSetup,
  getSetupOptions,
  getSetupStatus,
  type SetupOptions,
  type SetupGeographyInput,
  type SetupStatus,
} from "../../lib/setupClient";
import {
  getStoredAuthSession,
  storeTokenSession,
  type AuthSession,
} from "../auth/authClient";
import { PublicAuthAction } from "../auth/PublicAuthAction";
import type { ChartRoute } from "../routes/types";
import { Button } from "../ui/Button";
import { OptionCard } from "../ui/OptionCard";
import { SearchableSelect } from "../ui/SearchableSelect";
import { Select } from "../ui/Select";
import { TextInput } from "../ui/TextInput";

import { OnboardingIcon, type FocusAreaIconId } from "./focusAreaIcons";
import { OnboardingCountryMap } from "./OnboardingCountryMap";
import {
  countryOnboardingConfigs,
  slugify,
  type GeographyOption,
  type JurisdictionLevel,
  type OnboardingGeographyLevel,
} from "./onboardingGeographies";

type OnboardingPageProps = {
  countryOptions: CountryOption[];
  onNavigate: (route: ChartRoute) => void;
  initialOptions?: SetupOptions | null;
  initialSession?: AuthSession | null;
  initialStatus?: SetupStatus | null;
  initialStepIndex?: number;
  skipSetupLoad?: boolean;
};

type SetupStepId = "jurisdiction" | "focus" | "admin";

const setupSteps: {
  id: SetupStepId;
  title: string;
}[] = [
  {
    id: "jurisdiction",
    title: "Jurisdiction",
  },
  {
    id: "focus",
    title: "Focus areas",
  },
  {
    id: "admin",
    title: "Account",
  },
];

const focusAreaOptions: {
  id: FocusAreaIconId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "health",
    label: "Health",
    blurb: "Public health, clinical services",
  },
  {
    id: "climate-environment",
    label: "Climate and environment",
    blurb: "Climate adaptation, ecosystems",
  },
  {
    id: "water-sanitation",
    label: "Water and sanitation",
    blurb: "WASH, water security",
  },
  {
    id: "education",
    label: "Education",
    blurb: "Schools, learning continuity",
  },
  {
    id: "agriculture",
    label: "Agriculture",
    blurb: "Food systems, livelihoods",
  },
  {
    id: "disaster-management",
    label: "Disaster management",
    blurb: "Preparedness, response",
  },
  {
    id: "other",
    label: "Other",
    blurb: "Cross-cutting or custom",
  },
];

const healthDevelopmentOptions = [
  { id: "maternal-child-health", label: "Maternal and child health" },
  { id: "infectious-disease", label: "Infectious disease" },
  { id: "nutrition", label: "Nutrition" },
  { id: "health-facilities", label: "Health facilities" },
  { id: "emergency-preparedness", label: "Emergency preparedness" },
  { id: "heat-stroke", label: "Heat stroke prediction" },
  { id: "cardiovascular-disease", label: "Cardiovascular disease prediction" },
] as const;

const geographyLevelOrder: OnboardingGeographyLevel[] = [
  "country",
  "geo_level_1",
  "geo_level_2",
];

function buildSetupGeographies(input: {
  countryCode: string;
  countryName: string;
  geographies: GeographyOption[];
  selectedIds: string[];
}): SetupGeographyInput[] {
  const byId = new Map(input.geographies.map((geography) => [geography.id, geography]));
  const included = new Map<string, GeographyOption>();

  for (const selectedId of input.selectedIds) {
    includeGeographyWithParents(selectedId, byId, included);
  }

  const countrySlug = slugify(input.countryName);
  const rootGeographyId = `geo-${input.countryCode.toLowerCase()}`;

  return [...included.values()]
    .filter((geography) => geography.level !== "country")
    .sort((first, second) => {
      const levelComparison =
        geographyLevelOrder.indexOf(first.level) -
        geographyLevelOrder.indexOf(second.level);

      return levelComparison || first.sortOrder - second.sortOrder;
    })
    .map((geography) => ({
      id: `geo-${geography.id}`,
      level: geography.level,
      levelLabel: geography.levelLabel,
      name: geography.label,
      parentId:
        geography.level === "geo_level_1"
          ? rootGeographyId
          : geography.parentId
            ? `geo-${geography.parentId}`
            : undefined,
      path: buildGeographyPath(geography, byId, countrySlug),
      sortOrder: geography.sortOrder,
    }));
}

function includeGeographyWithParents(
  geographyId: string,
  byId: Map<string, GeographyOption>,
  included: Map<string, GeographyOption>,
) {
  const geography = byId.get(geographyId);

  if (!geography || included.has(geography.id)) {
    return;
  }

  if (geography.parentId) {
    includeGeographyWithParents(geography.parentId, byId, included);
  }

  included.set(geography.id, geography);
}

function buildGeographyPath(
  geography: GeographyOption,
  byId: Map<string, GeographyOption>,
  countrySlug: string,
) {
  const pathParts = [slugify(geography.label)];
  let current = geography;

  while (current.parentId) {
    const parent = byId.get(current.parentId);

    if (!parent || parent.level === "country") {
      break;
    }

    pathParts.unshift(slugify(parent.label));
    current = parent;
  }

  return `/${[countrySlug, ...pathParts].join("/")}`;
}

function buildAdminUser(adminUser: { email: string; password: string }) {
  const email = adminUser.email.trim().toLowerCase();
  const username = normalizeAdminUsername(email);

  return {
    name: "CHART administrator",
    email,
    username,
    password: adminUser.password,
  };
}

function normalizeAdminUsername(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const username = slugify(localPart);

  return username.length >= 2 ? username : "chart-admin";
}

export function OnboardingPage({
  countryOptions,
  initialOptions = null,
  initialSession = null,
  initialStatus = null,
  initialStepIndex = 0,
  onNavigate,
  skipSetupLoad = false,
}: OnboardingPageProps) {
  const [status, setStatus] = useState<SetupStatus | null>(initialStatus);
  const [options, setOptions] = useState<SetupOptions | null>(initialOptions);
  const [session, setSession] = useState<AuthSession | null>(initialSession);
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [selectedJurisdictionLevelId, setSelectedJurisdictionLevelId] = useState<
    OnboardingGeographyLevel | ""
  >("");
  const [selectedParentGeographyId, setSelectedParentGeographyId] = useState("");
  const [parentGeographyQuery, setParentGeographyQuery] = useState("");
  const [geographyQuery, setGeographyQuery] = useState("");
  const [selectedGeographyIds, setSelectedGeographyIds] = useState<string[]>([]);
  const [selectedFocusAreaIds, setSelectedFocusAreaIds] = useState<string[]>([]);
  const [selectedHazardIds, setSelectedHazardIds] = useState<string[]>([]);
  const [selectedHealthAreaIds, setSelectedHealthAreaIds] = useState<string[]>([]);
  const [adminUser, setAdminUser] = useState({
    email: "chart-admin@example.org",
    password: "",
  });
  const [activeStepIndex, setActiveStepIndex] = useState(initialStepIndex);
  const [isCompleting, setIsCompleting] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supportedCountryOptions = useMemo(() => {
    const supportedCodes = new Set(Object.keys(countryOnboardingConfigs));
    const supportedCountries = countryOptions.filter((country) =>
      supportedCodes.has(country.code),
    );

    return supportedCountries.length > 0 ? supportedCountries : countryOptions;
  }, [countryOptions]);
  const selectedCountry = useMemo(
    () =>
      supportedCountryOptions.find((country) => country.code === selectedCountryCode) ??
      null,
    [selectedCountryCode, supportedCountryOptions],
  );
  const selectedCountryConfig = selectedCountryCode
    ? countryOnboardingConfigs[selectedCountryCode]
    : null;
  const allGeographyOptions = selectedCountryConfig?.geographies ?? [];
  const countryGeography =
    allGeographyOptions.find((geography) => geography.level === "country") ?? null;
  const jurisdictionLevelOptions = selectedCountryConfig?.levels ?? [];
  const selectedJurisdictionLevel =
    jurisdictionLevelOptions.find(
      (level) => level.id === selectedJurisdictionLevelId,
    ) ?? null;
  const geographyLevelLabel =
    selectedJurisdictionLevel?.label.toLowerCase() ?? "administrative area";
  const parentLevelId = selectedJurisdictionLevel?.parentLevelId;
  const parentGeographyOptions = parentLevelId
    ? allGeographyOptions.filter((geography) => geography.level === parentLevelId)
    : [];
  const selectedParentGeography =
    parentGeographyOptions.find(
      (geography) => geography.id === selectedParentGeographyId,
    ) ?? null;
  const geographyOptions = selectedJurisdictionLevel
    ? allGeographyOptions.filter(
        (geography) =>
          geography.level === selectedJurisdictionLevel.id &&
          (!selectedJurisdictionLevel.parentLevelId ||
            geography.parentId === selectedParentGeographyId),
      )
    : [];
  const selectedGeographies = allGeographyOptions.filter((geography) =>
    selectedGeographyIds.includes(geography.id),
  );
  const primarySelectedGeography =
    selectedGeographies[0] ?? selectedParentGeography ?? countryGeography;
  const mapBounds =
    primarySelectedGeography?.bounds ??
    selectedParentGeography?.bounds ??
    null;
  const mapMarker =
    primarySelectedGeography?.marker ??
    selectedParentGeography?.marker ??
    selectedCountryConfig?.marker ??
    null;
  const mapGeographyLabel =
    selectedGeographies[0]?.label ?? selectedParentGeography?.label ?? "";
  const hazardOptions = options?.hazards ?? [];
  const selectedHazardLabels = hazardOptions
    .filter((hazard) => selectedHazardIds.includes(hazard.id))
    .map((hazard) => hazard.label);
  const selectedFocusLabels = focusAreaOptions
    .filter((focusArea) => selectedFocusAreaIds.includes(focusArea.id))
    .map((focusArea) => focusArea.label);
  const selectedHealthAreaLabels = healthDevelopmentOptions
    .filter((healthArea) => selectedHealthAreaIds.includes(healthArea.id))
    .map((healthArea) => healthArea.label);
  const activeStep = setupSteps[activeStepIndex] ?? setupSteps[0];
  const isAdmin = Boolean(session?.user.roles.includes("chart_admin"));
  const isFirstBootstrap = Boolean(
    status?.requiresOnboarding && status.counts.workspaceMembers === 0,
  );
  const isSetupComplete = Boolean(status && !status.requiresOnboarding);
  const requiresAdminSetup = Boolean(
    status?.requiresOnboarding &&
    status.counts.workspaceMembers > 0 &&
    !isFirstBootstrap,
  );
  const canUseWizard = Boolean(
    status && (isFirstBootstrap || (requiresAdminSetup && isAdmin)),
  );
  const completedSteps = [
    Boolean(
      selectedCountry && selectedJurisdictionLevel && selectedGeographyIds.length > 0,
    ),
    Boolean(
      selectedFocusAreaIds.length > 0 &&
      selectedHazardIds.length > 0 &&
      selectedHealthAreaIds.length > 0,
    ),
    isFirstBootstrap
      ? Boolean(adminUser.email.trim() && adminUser.password.length >= 8)
      : Boolean(session && isAdmin),
  ];
  const progress = isSetupComplete
    ? 100
    : Math.round((completedSteps.filter(Boolean).length / completedSteps.length) * 100);
  const activeStepTitle = activeStep.title;

  function selectCountry(countryCode: string) {
    const nextConfig = countryOnboardingConfigs[countryCode];
    const nextLevelId = nextConfig?.defaultLevelId ?? "";
    const nextLevel = nextConfig?.levels.find((level) => level.id === nextLevelId);
    const nextParentId = nextLevel?.parentLevelId
      ? (nextConfig?.defaultParentId ?? "")
      : "";
    const nextCountryGeography = nextConfig?.geographies.find(
      (geography) => geography.level === "country",
    );
    setSelectedCountryCode(countryCode);
    setSelectedJurisdictionLevelId(nextLevelId);
    setSelectedParentGeographyId(nextParentId);
    setParentGeographyQuery("");
    setGeographyQuery("");
    setSelectedGeographyIds(
      nextLevelId === "country" && nextCountryGeography
        ? [nextCountryGeography.id]
        : [],
    );
  }

  useEffect(() => {
    if (skipSetupLoad) {
      return;
    }

    setSession(getStoredAuthSession());

    async function loadSetup() {
      try {
        const [nextStatus, nextOptions] = await Promise.all([
          getSetupStatus(),
          getSetupOptions(),
        ]);

        setStatus(nextStatus);
        setOptions(nextOptions);
      } catch {
        setError("CHART setup status could not be loaded.");
      }
    }

    void loadSetup();
  }, [skipSetupLoad]);

  function continueSetup() {
    const validationError = stepValidationError(activeStep.id);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setActiveStepIndex((step) => Math.min(setupSteps.length - 1, step + 1));
  }

  function stepValidationError(stepId: SetupStepId) {
    if (stepId === "jurisdiction") {
      if (!selectedCountry) {
        return "Choose the country for your CHART profile.";
      }

      if (!selectedJurisdictionLevel) {
        return "Choose the administrative level you work at.";
      }

      if (selectedGeographyIds.length === 0) {
        return "Choose the geography for your jurisdiction.";
      }
    }

    if (stepId === "focus") {
      if (selectedFocusAreaIds.length === 0) {
        return "Choose at least one sector or work area.";
      }

      if (selectedHazardIds.length === 0) {
        return "Choose at least one climate hazard to prioritize.";
      }

      if (selectedHealthAreaIds.length === 0) {
        return "Choose at least one health or development priority.";
      }
    }

    if (
      stepId === "admin" &&
      isFirstBootstrap &&
      !(adminUser.email.trim() && adminUser.password.length >= 8)
    ) {
      return "Enter the first administrator email and use a password with at least 8 characters.";
    }

    return null;
  }

  function toggleSelection(
    optionId: string,
    setSelection: Dispatch<SetStateAction<string[]>>,
  ) {
    setSelection((currentIds) =>
      currentIds.includes(optionId)
        ? currentIds.filter((currentId) => currentId !== optionId)
        : [...currentIds, optionId],
    );
  }

  function selectJurisdictionLevel(levelId: OnboardingGeographyLevel | "") {
    const nextLevel = jurisdictionLevelOptions.find((level) => level.id === levelId);
    const nextParentId = nextLevel?.parentLevelId
      ? (selectedCountryConfig?.defaultParentId ?? "")
      : "";

    setSelectedJurisdictionLevelId(levelId);
    setSelectedParentGeographyId(nextParentId);
    setParentGeographyQuery("");
    setGeographyQuery("");
    setSelectedGeographyIds(
      levelId === "country" && countryGeography ? [countryGeography.id] : [],
    );
  }

  async function finishSetup() {
    if (!status) {
      setError("CHART setup status is still loading.");
      return;
    }

    if (!status.requiresOnboarding) {
      onNavigate("dashboard");
      return;
    }

    if (!selectedCountry) {
      setActiveStepIndex(0);
      setError("Choose the country for your CHART profile.");
      return;
    }

    if (!selectedJurisdictionLevel) {
      setActiveStepIndex(0);
      setError("Choose the administrative level you work at.");
      return;
    }

    if (selectedGeographyIds.length === 0) {
      setActiveStepIndex(0);
      setError("Choose the geography for your jurisdiction.");
      return;
    }

    if (selectedFocusAreaIds.length === 0) {
      setActiveStepIndex(1);
      setError("Choose at least one sector or work area.");
      return;
    }

    if (selectedHazardIds.length === 0) {
      setActiveStepIndex(1);
      setError("Choose at least one climate hazard to prioritize.");
      return;
    }

    if (selectedHealthAreaIds.length === 0) {
      setActiveStepIndex(1);
      setError("Choose at least one health or development priority.");
      return;
    }

    if (
      isFirstBootstrap &&
      !(adminUser.email.trim() && adminUser.password.length >= 8)
    ) {
      setActiveStepIndex(2);
      setError(
        "Enter the first administrator email and use a password with at least 8 characters.",
      );
      return;
    }

    if (!isFirstBootstrap && (!session || !isAdmin)) {
      setError("Sign in as a CHART administrator to update setup.");
      return;
    }

    setIsCompleting(true);
    setError(null);
    setSetupMessage("Creating deployment geography and workspace.");

    try {
      const setupGeographies = buildSetupGeographies({
        countryCode: selectedCountry.code,
        countryName: selectedCountry.name,
        geographies: allGeographyOptions,
        selectedIds: selectedGeographyIds,
      });

      if (isFirstBootstrap) {
        const response = await bootstrapSetup({
          countryCode: selectedCountry.code,
          countryName: selectedCountry.name,
          focusAreaIds: selectedFocusAreaIds,
          geographies: setupGeographies,
          geographyLevelLabel,
          hazardIds: selectedHazardIds,
          healthAreaIds: selectedHealthAreaIds,
          admin: buildAdminUser(adminUser),
        });
        const nextSession = await storeTokenSession(response.tokens);

        setSession(nextSession);
        setStatus(response.setup);
        setSetupMessage("Setup complete.");
        onNavigate("dashboard");
        return;
      }

      const nextStatus = await completeSetup(
        {
          countryCode: selectedCountry.code,
          countryName: selectedCountry.name,
          focusAreaIds: selectedFocusAreaIds,
          geographies: setupGeographies,
          geographyLevelLabel,
          hazardIds: selectedHazardIds,
          healthAreaIds: selectedHealthAreaIds,
        },
        session?.accessToken,
      );

      setStatus(nextStatus);
      setSetupMessage("Setup complete.");
      onNavigate("dashboard");
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "CHART onboarding could not be completed.",
      );
      setSetupMessage(null);
    } finally {
      setIsCompleting(false);
    }
  }

  if (status && isSetupComplete) {
    return (
      <div className="onboarding-shell onboarding-shell-success">
        <main className="onboarding-main onboarding-main-success">
          <SetupCompleteSuccess
            countryName={status.countryName}
            onOpenDashboard={() => onNavigate("dashboard")}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="onboarding-shell">
      <main className="onboarding-main">
        <section className="onboarding-hero onboarding-hero-wide">
          <div>
            <span className="section-kicker">User onboarding</span>
            <h1>Set your jurisdiction and planning focus</h1>
            <p>
              Choose your country, the administrative level you work at, the geography
              you support, and the focus areas CHART should prioritize.
            </p>
          </div>
          <div className="onboarding-progress-card" aria-label="Setup progress">
            <span className="onboarding-stage-eyebrow">Onboarding step</span>
            <strong>
              {isSetupComplete
                ? "Ready"
                : status
                  ? `Step ${activeStepIndex + 1} of ${setupSteps.length}`
                  : "Checking"}
            </strong>
            <span>
              {status
                ? status.requiresOnboarding
                  ? activeStepTitle
                  : "setup complete"
                : "checking setup"}
            </span>
            <div className="onboarding-progress-track">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>

        {status && requiresAdminSetup && !isAdmin ? (
          <section className="onboarding-selection-card onboarding-step-panel">
            <div className="onboarding-card-head">
              <span className="section-kicker">Admin required</span>
              <h2>Sign in to update setup</h2>
              <p>
                This deployment already has user or workspace records. To prevent
                takeover, public onboarding is disabled after the first administrator
                has been created.
              </p>
            </div>
            <div className="hero-button-row">
              <Button href="/auth/signin">Sign in as admin</Button>
              <Button variant="ghost" onClick={() => onNavigate("landing")}>
                Go to home
              </Button>
            </div>
          </section>
        ) : null}

        {!status ? (
          <section className="onboarding-selection-card onboarding-step-panel">
            <div className="onboarding-card-head">
              <span className="section-kicker">Loading setup</span>
              <h2>Checking CHART setup state</h2>
              <p>
                CHART is checking whether this is a new deployment or an existing setup.
              </p>
            </div>
          </section>
        ) : null}

        {error ? <div className="auth-error onboarding-error">{error}</div> : null}
        {setupMessage ? (
          <div className="onboarding-status-message">{setupMessage}</div>
        ) : null}

        {canUseWizard ? (
          <section className="onboarding-flow-card">
            <div className="onboarding-flow-left">
              <div
                className="onboarding-step-board onboarding-step-board-compact"
                aria-label="Onboarding steps"
              >
                {setupSteps.map((step, stepIndex) => (
                  <button
                    aria-pressed={activeStepIndex === stepIndex}
                    className={`onboarding-progress-step ${
                      completedSteps[stepIndex] ? "complete" : ""
                    } ${activeStepIndex === stepIndex ? "active" : ""}`}
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStepIndex(stepIndex)}
                  >
                    <span>{stepIndex + 1}</span>
                    <span className="onboarding-step-text">
                      <span className="onboarding-step-label">{step.title}</span>
                    </span>
                  </button>
                ))}
              </div>

              <article className="onboarding-step-detail">
                <div className="onboarding-card-head">
                  <h2>{activeStep.title}</h2>
                </div>

                {activeStep.id === "jurisdiction" ? (
                  <div className="onboarding-step-fields">
                    <SelectField
                      counter="1"
                      label="Country"
                      options={supportedCountryOptions.map((country) => ({
                        id: country.code,
                        label: country.name,
                        meta: country.code,
                      }))}
                      placeholder="Choose a country"
                      value={selectedCountryCode}
                      onChange={selectCountry}
                    />

                    <SelectField
                      counter="2"
                      disabled={!selectedCountry}
                      label="Jurisdiction level"
                      options={jurisdictionLevelOptions.map((level) => ({
                        id: level.id,
                        label: level.label,
                      }))}
                      placeholder={
                        selectedCountry
                          ? "Choose the administrative level you work at"
                          : "Select a country first"
                      }
                      value={selectedJurisdictionLevelId}
                      onChange={(levelId) =>
                        selectJurisdictionLevel(
                          levelId as OnboardingGeographyLevel | "",
                        )
                      }
                    />

                    <SpecificGeographySection
                      countryName={selectedCountry?.name ?? ""}
                      geographyOptions={geographyOptions}
                      geographyQuery={geographyQuery}
                      parentGeographyOptions={parentGeographyOptions}
                      parentGeographyQuery={parentGeographyQuery}
                      parentLevelLabel={
                        selectedJurisdictionLevel?.parentLevelId
                          ? getLevelLabel(
                              jurisdictionLevelOptions,
                              selectedJurisdictionLevel.parentLevelId,
                            )
                          : ""
                      }
                      selectedGeographyId={selectedGeographyIds[0] ?? ""}
                      selectedJurisdictionLevel={selectedJurisdictionLevel}
                      selectedParentGeographyId={selectedParentGeography?.id ?? ""}
                      onGeographyQueryChange={setGeographyQuery}
                      onGeographySelect={(geographyId) => {
                        setSelectedGeographyIds([geographyId]);
                        setGeographyQuery("");
                      }}
                      onParentGeographyClear={() => {
                        setSelectedParentGeographyId("");
                        setSelectedGeographyIds([]);
                        setGeographyQuery("");
                      }}
                      onParentGeographyQueryChange={setParentGeographyQuery}
                      onParentGeographySelect={(geographyId) => {
                        setSelectedParentGeographyId(geographyId);
                        setParentGeographyQuery("");
                        setSelectedGeographyIds([]);
                        setGeographyQuery("");
                      }}
                    />
                  </div>
                ) : null}

                {activeStep.id === "focus" ? (
                  <div className="onboarding-step-fields">
                    <section className="onboarding-fieldset">
                      <div>
                        <span>1</span>
                        <h3>Select sector or area of work</h3>
                      </div>
                      <div className="onboarding-focus-grid">
                        {focusAreaOptions.map((focusArea) => (
                          <OptionCard
                            description={focusArea.blurb}
                            icon={<OnboardingIcon id={focusArea.id} />}
                            key={focusArea.id}
                            label={focusArea.label}
                            selected={selectedFocusAreaIds.includes(focusArea.id)}
                            onToggle={() =>
                              toggleSelection(focusArea.id, setSelectedFocusAreaIds)
                            }
                          />
                        ))}
                      </div>
                    </section>

                    <section className="onboarding-fieldset">
                      <div>
                        <span>2</span>
                        <h3>Select priority climate hazards</h3>
                      </div>
                      {hazardOptions.length > 0 ? (
                        <div className="onboarding-option-grid">
                          {hazardOptions.map((hazard) => (
                            <OptionCard
                              icon={<OnboardingIcon id={hazard.id} />}
                              key={hazard.id}
                              label={hazard.label}
                              selected={selectedHazardIds.includes(hazard.id)}
                              onToggle={() =>
                                toggleSelection(hazard.id, setSelectedHazardIds)
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="onboarding-muted-copy">
                          Hazard options are not available from the chart repository API
                          yet.
                        </p>
                      )}
                    </section>

                    <section className="onboarding-fieldset">
                      <div>
                        <span>3</span>
                        <h3>Select health and development priorities</h3>
                      </div>
                      <div className="onboarding-option-grid">
                        {healthDevelopmentOptions.map((healthArea) => (
                          <OptionCard
                            icon={<OnboardingIcon id={healthArea.id} />}
                            key={healthArea.id}
                            label={healthArea.label}
                            selected={selectedHealthAreaIds.includes(healthArea.id)}
                            onToggle={() =>
                              toggleSelection(healthArea.id, setSelectedHealthAreaIds)
                            }
                          />
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}

                {activeStep.id === "admin" ? (
                  <div className="onboarding-account-form">
                    {isFirstBootstrap ? (
                      <p className="onboarding-account-intro">
                        You&apos;re creating the first administrator account for this
                        CHART deployment. You can invite teammates from the dashboard
                        once setup is complete.
                      </p>
                    ) : null}
                    <TextInput
                      autoComplete="email"
                      label="Email"
                      placeholder="you@organization.org"
                      type="email"
                      value={adminUser.email}
                      onChange={(event) =>
                        setAdminUser((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                    <TextInput
                      autoComplete="new-password"
                      hint="Use at least 8 characters."
                      label="Password"
                      minLength={8}
                      placeholder="At least 8 characters"
                      type="password"
                      value={adminUser.password}
                      onChange={(event) =>
                        setAdminUser((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </article>

              <div className="onboarding-flow-footer">
                <div className="onboarding-summary-copy">
                  <strong>{selectedCountry?.name ?? "Choose country"}</strong>
                  <span>
                    {selectedJurisdictionLevel
                      ? selectedGeographies.length > 0
                        ? `${selectedJurisdictionLevel.label}: ${selectedGeographies.map((geography) => geography.label).join(", ")}`
                        : `${selectedJurisdictionLevel.label}: geography not selected`
                      : "Jurisdiction not complete"}
                  </span>
                </div>
                <div className="hero-button-row">
                  <Button
                    compact
                    disabled={activeStepIndex === 0}
                    variant="ghost"
                    onClick={() => setActiveStepIndex((step) => Math.max(0, step - 1))}
                  >
                    Back
                  </Button>
                  {activeStepIndex < setupSteps.length - 1 ? (
                    <Button compact onClick={continueSetup}>
                      Continue
                    </Button>
                  ) : (
                    <Button compact disabled={isCompleting} onClick={finishSetup}>
                      {isCompleting ? "Creating setup" : "Finish setup"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <aside
              className="onboarding-flow-map"
              aria-label={
                activeStep.id === "focus"
                  ? "Focus area preview"
                  : "Jurisdiction map preview"
              }
            >
              {activeStep.id === "focus" ? (
                <FocusProfilePreview
                  focusLabels={selectedFocusLabels}
                  hazardLabels={selectedHazardLabels}
                  healthAreaLabels={selectedHealthAreaLabels}
                />
              ) : (
                <>
                  <div className="onboarding-map-aside">
                    <span>Jurisdiction preview</span>
                    <strong>
                      {primarySelectedGeography?.label ??
                        selectedCountry?.name ??
                        "Select a country"}
                    </strong>
                  </div>
                  <OnboardingCountryMap
                    bounds={mapBounds}
                    countryName={selectedCountry?.name ?? ""}
                    geographyLabel={mapGeographyLabel}
                    marker={mapMarker}
                  />
                  <div className="onboarding-map-context">
                    <span>{selectedCountry?.name ?? "Country not selected"}</span>
                    <span>
                      {selectedJurisdictionLevel?.label ?? "Level not selected"}
                    </span>
                    <span>
                      {selectedGeographies.length > 0
                        ? selectedGeographies[0]?.label
                        : "Geography not selected"}
                    </span>
                    {selectedFocusLabels.length > 0 ? (
                      <span>{selectedFocusLabels[0]}</span>
                    ) : null}
                    {selectedHazardLabels.length > 0 ? (
                      <span>{selectedHazardLabels.length} hazard focus</span>
                    ) : null}
                    {selectedHealthAreaLabels.length > 0 ? (
                      <span>{selectedHealthAreaLabels.length} health focus</span>
                    ) : null}
                  </div>
                </>
              )}
            </aside>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function SetupCompleteSuccess({
  countryName,
  onOpenDashboard,
}: {
  countryName?: string | null;
  onOpenDashboard: () => void;
}) {
  return (
    <section
      className="onboarding-complete-success"
      aria-labelledby="setup-complete-title"
    >
      <span className="onboarding-success-mark" aria-hidden="true" />
      <span className="section-kicker">Setup complete</span>
      <h1 id="setup-complete-title">Welcome to CHART</h1>
      <p>
        {countryName
          ? `${countryName} is ready for planning.`
          : "Your workspace is ready for planning."}
      </p>
      <Button onClick={onOpenDashboard}>Open dashboard</Button>
    </section>
  );
}

function SelectField({
  counter,
  disabled = false,
  label,
  options,
  placeholder,
  value,
  onChange,
}: {
  counter: string;
  label: string;
  disabled?: boolean;
  options: {
    id: string;
    label: string;
    meta?: string;
  }[];
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="onboarding-fieldset">
      <div>
        <span>{counter}</span>
        <h3>{label}</h3>
      </div>
      <Select
        aria-label={label}
        disabled={disabled}
        options={options.map((option) => ({
          value: option.id,
          label: option.meta ? `${option.label} (${option.meta})` : option.label,
        }))}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  );
}

function SpecificGeographySection({
  countryName,
  geographyOptions,
  geographyQuery,
  parentGeographyOptions,
  parentGeographyQuery,
  parentLevelLabel,
  selectedGeographyId,
  selectedJurisdictionLevel,
  selectedParentGeographyId,
  onGeographyQueryChange,
  onGeographySelect,
  onParentGeographyClear,
  onParentGeographyQueryChange,
  onParentGeographySelect,
}: {
  countryName: string;
  geographyOptions: GeographyOption[];
  geographyQuery: string;
  parentGeographyOptions: GeographyOption[];
  parentGeographyQuery: string;
  parentLevelLabel: string;
  selectedGeographyId: string;
  selectedJurisdictionLevel: JurisdictionLevel | null;
  selectedParentGeographyId: string;
  onGeographyQueryChange: (query: string) => void;
  onGeographySelect: (geographyId: string) => void;
  onParentGeographyClear: () => void;
  onParentGeographyQueryChange: (query: string) => void;
  onParentGeographySelect: (geographyId: string) => void;
}) {
  if (!selectedJurisdictionLevel) {
    return (
      <section className="onboarding-fieldset">
        <div>
          <span>3</span>
          <h3>Specific geography</h3>
        </div>
        <p className="onboarding-muted-copy">
          Select a country and jurisdiction level first.
        </p>
      </section>
    );
  }

  if (selectedJurisdictionLevel.id === "country") {
    return (
      <section className="onboarding-fieldset">
        <div>
          <span>3</span>
          <h3>Specific geography</h3>
        </div>
        <div className="onboarding-readonly-value">
          <strong>{countryName || "Country not selected"}</strong>
          <span>National jurisdiction</span>
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-fieldset">
      <div>
        <span>3</span>
        <h3>Specific geography</h3>
      </div>
      <div
        className={
          selectedJurisdictionLevel.parentLevelId && !selectedParentGeographyId
            ? "onboarding-geography-stack two-column"
            : "onboarding-geography-stack"
        }
      >
        {selectedJurisdictionLevel.parentLevelId ? (
          selectedParentGeographyId ? (
            <div className="ui-searchable-select">
              <span className="ui-text-input-label">{parentLevelLabel}</span>
              <div className="onboarding-readonly-value">
                <strong>
                  {parentGeographyOptions.find(
                    (o) => o.id === selectedParentGeographyId,
                  )?.label ?? selectedParentGeographyId}
                </strong>
                <button
                  className="onboarding-readonly-change"
                  type="button"
                  onClick={onParentGeographyClear}
                >
                  Change
                </button>
              </div>
            </div>
          ) : (
            <SearchableSelect
              emptyLabel={`No matching ${parentLevelLabel.toLowerCase()}.`}
              label={parentLevelLabel}
              options={parentGeographyOptions.map(toSearchableOption)}
              placeholder={`Search ${parentLevelLabel.toLowerCase()}`}
              query={parentGeographyQuery}
              selectedId={selectedParentGeographyId}
              onQueryChange={onParentGeographyQueryChange}
              onSelect={onParentGeographySelect}
            />
          )
        ) : null}
        <SearchableSelect
          emptyLabel={
            selectedJurisdictionLevel.parentLevelId
              ? selectedParentGeographyId
                ? "No lower-level geographies match this parent."
                : `Select ${parentLevelLabel.toLowerCase()} first.`
              : `No matching ${selectedJurisdictionLevel.pluralLabel.toLowerCase()}.`
          }
          label={selectedJurisdictionLevel.label}
          options={geographyOptions.map(toSearchableOption)}
          placeholder={`Search ${selectedJurisdictionLevel.pluralLabel.toLowerCase()}`}
          query={geographyQuery}
          selectedId={selectedGeographyId}
          onQueryChange={onGeographyQueryChange}
          onSelect={onGeographySelect}
        />
      </div>
    </section>
  );
}

function toSearchableOption(option: GeographyOption) {
  return { id: option.id, label: option.label, keywords: option.levelLabel };
}

function FocusProfilePreview({
  focusLabels,
  hazardLabels,
  healthAreaLabels,
}: {
  focusLabels: string[];
  hazardLabels: string[];
  healthAreaLabels: string[];
}) {
  return (
    <div className="onboarding-focus-preview">
      <div className="onboarding-map-aside">
        <span>Focus preview</span>
        <strong>
          {focusLabels.length > 0
            ? `${focusLabels.length} areas`
            : "Choose focus areas"}
        </strong>
      </div>
      <PreviewChipGroup
        emptyLabel="No focus areas selected"
        labels={focusLabels}
        title="Focus areas"
      />
      <PreviewChipGroup
        emptyLabel="No hazards selected"
        labels={hazardLabels}
        title="Climate hazards"
      />
      <PreviewChipGroup
        emptyLabel="No priorities selected"
        labels={healthAreaLabels}
        title="Health and development"
      />
    </div>
  );
}

function PreviewChipGroup({
  emptyLabel,
  labels,
  title,
}: {
  emptyLabel: string;
  labels: string[];
  title: string;
}) {
  return (
    <div className="onboarding-preview-group">
      <strong>{title}</strong>
      <div className="onboarding-map-context">
        {labels.length > 0 ? (
          labels.map((label) => <span key={label}>{label}</span>)
        ) : (
          <span>{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

function getLevelLabel(levels: JurisdictionLevel[], levelId: OnboardingGeographyLevel) {
  return levels.find((level) => level.id === levelId)?.label ?? "geography";
}
