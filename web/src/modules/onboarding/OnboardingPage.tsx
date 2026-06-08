"use client";

import { useEffect, useMemo, useState } from "react";

import type { CountryOption } from "../../lib/countries";
import {
  bootstrapSetup,
  completeSetup,
  getSetupOptions,
  getSetupStatus,
  type SetupOptions,
  type SetupStatus,
} from "../../lib/setupClient";
import {
  listPublicSolutions,
  type SolutionRepositoryItem,
} from "../../lib/solutionRepositoryClient";
import {
  getStoredAuthSession,
  storeTokenSession,
  type AuthSession,
} from "../auth/authClient";
import { PublicAuthAction } from "../auth/PublicAuthAction";
import type { ChartRoute } from "../routes/types";
import { OnboardingCountryMap } from "./OnboardingCountryMap";

type OnboardingPageProps = {
  countryOptions: CountryOption[];
  onNavigate: (route: ChartRoute) => void;
};

const setupSteps = [
  "Choose geography",
  "Select hazards",
  "Prepare repository",
  "Create admin",
] as const;

const geographyLevelLabels = [
  "administrative area",
  "county",
  "province",
  "region",
  "district",
] as const;

export function OnboardingPage({ countryOptions, onNavigate }: OnboardingPageProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [options, setOptions] = useState<SetupOptions | null>(null);
  const [solutionItems, setSolutionItems] = useState<SolutionRepositoryItem[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [geographyLevelLabel, setGeographyLevelLabel] = useState("administrative area");
  const [selectedHazardIds, setSelectedHazardIds] = useState<string[]>([]);
  const [adminUser, setAdminUser] = useState({
    name: "CHART administrator",
    email: "chart-admin@example.org",
    username: "chart-admin",
    password: "",
  });
  const [activeStep, setActiveStep] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCountry = useMemo(
    () =>
      countryOptions.find((country) => country.code === selectedCountryCode) ?? null,
    [selectedCountryCode],
  );
  const hazardOptions = options?.hazards ?? [];
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
  const repositoryGroups = useMemo(
    () => groupSolutionsByHazard(solutionItems, hazardOptions, selectedHazardIds),
    [hazardOptions, solutionItems, selectedHazardIds],
  );
  const matchingRepositoryItemCount = repositoryGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const completedSteps = [
    Boolean(selectedCountry),
    selectedHazardIds.length > 0,
    repositoryGroups.some((group) => group.items.length > 0),
    isFirstBootstrap
      ? Boolean(
          adminUser.name.trim() &&
          adminUser.email.trim() &&
          adminUser.username.trim() &&
          adminUser.password.length >= 8,
        )
      : Boolean(session && isAdmin),
  ];
  const progress = isSetupComplete
    ? 100
    : Math.round((completedSteps.filter(Boolean).length / completedSteps.length) * 100);

  useEffect(() => {
    setSession(getStoredAuthSession());

    async function loadSetup() {
      try {
        const setupOptions = await getSetupOptions();
        const repository = await listPublicSolutions({ limit: "100" });
        setOptions(setupOptions);
        setSolutionItems(repository.items);
        setStatus(await getSetupStatus());
      } catch {
        setError("CHART setup options could not be loaded.");
      }
    }

    void loadSetup();
  }, []);

  useEffect(() => {
    if (selectedHazardIds.length > 0 || hazardOptions.length === 0) {
      return;
    }

    const defaultHazard =
      hazardOptions.find((hazard) => hazard.id === "hazard-extreme-heat") ??
      hazardOptions[0];

    setSelectedHazardIds([defaultHazard.id]);
  }, [hazardOptions, selectedHazardIds.length]);

  function toggleHazard(taxonomyId: string) {
    setSelectedHazardIds((currentIds) => {
      if (currentIds.includes(taxonomyId)) {
        return currentIds.filter((currentId) => currentId !== taxonomyId);
      }

      return [...currentIds, taxonomyId];
    });
  }

  function continueSetup() {
    if (activeStep === 0 && !selectedCountry) {
      setError("Choose the country for this CHART deployment.");
      return;
    }

    if (activeStep === 1 && selectedHazardIds.length === 0) {
      setError("Select at least one climate hazard to onboard.");
      return;
    }

    if (activeStep === 3 && isFirstBootstrap && adminUser.password.length < 8) {
      setError("Use a password with at least 8 characters for the first admin.");
      return;
    }

    setError(null);
    setActiveStep((step) => Math.min(setupSteps.length - 1, step + 1));
  }

  async function finishSetup() {
    if (!status) {
      setError("CHART setup status is still loading.");
      return;
    }

    if (!status.requiresOnboarding) {
      onNavigate("landing");
      return;
    }

    if (!selectedCountry) {
      setActiveStep(0);
      setError("Choose the country for this CHART deployment.");
      return;
    }

    if (selectedHazardIds.length === 0) {
      setActiveStep(1);
      setError("Select at least one climate hazard to onboard.");
      return;
    }

    if (!isFirstBootstrap && (!session || !isAdmin)) {
      setError("Sign in as a CHART administrator to update setup.");
      return;
    }

    setIsCompleting(true);
    setError(null);
    setSetupMessage("Preparing workspace and importing matching action records.");

    try {
      if (isFirstBootstrap) {
        const response = await bootstrapSetup({
          countryCode: selectedCountry.code,
          countryName: selectedCountry.name,
          geographyLevelLabel,
          hazardIds: selectedHazardIds,
          admin: adminUser,
        });
        const nextSession = await storeTokenSession(response.tokens);

        setSession(nextSession);
        setStatus(response.setup);
        setSetupMessage(response.setup.solutionImport.message);
        onNavigate("landing");
        return;
      }

      const nextStatus = await completeSetup(
        {
          countryCode: selectedCountry.code,
          countryName: selectedCountry.name,
          geographyLevelLabel,
          hazardIds: selectedHazardIds,
        },
        session?.accessToken,
      );

      setStatus(nextStatus);
      setSetupMessage(nextStatus.solutionImport.message);
      onNavigate("landing");
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

  return (
    <div className="onboarding-shell">
      <header className="landing-nav">
        <button
          className="landing-brand"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          CHART
        </button>
        <nav className="landing-links" aria-label="CHART onboarding navigation">
          <a className="landing-link" href="/">
            Public site
          </a>
          <a className="landing-link" href="/solutions">
            Action repository
          </a>
        </nav>
        <PublicAuthAction />
      </header>

      <main className="onboarding-main">
        <section className="onboarding-hero onboarding-hero-wide">
          <div>
            <span className="section-kicker">Required setup</span>
            <h1>Onboard a CHART deployment before planning starts</h1>
            <p>
              Choose the country, select priority climate hazards, prepare the public
              action repository, and connect the first administrator account.
            </p>
          </div>
          <div className="onboarding-progress-card" aria-label="Setup progress">
            <strong>{progress}%</strong>
            <span>
              {status
                ? status.requiresOnboarding
                  ? "setup required"
                  : "setup complete"
                : "checking setup"}
            </span>
            <div className="onboarding-progress-track">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>

        {status && isSetupComplete ? (
          <section className="onboarding-selection-card onboarding-step-panel">
            <div className="onboarding-card-head">
              <span className="section-kicker">Setup complete</span>
              <h2>{status.countryName ?? "This CHART deployment"} is ready</h2>
            </div>
            <div className="setup-fact-grid">
              <div className="setup-fact">
                <span>Configured hazards</span>
                <strong>{status.counts.hazards}</strong>
              </div>
              <div className="setup-fact">
                <span>Workspace members</span>
                <strong>{status.counts.workspaceMembers}</strong>
              </div>
              <div className="setup-fact">
                <span>Geographies</span>
                <strong>{status.counts.geographies}</strong>
              </div>
              <div className="setup-fact">
                <span>Repository actions</span>
                <strong>{status.counts.workspaceSolutions}</strong>
              </div>
            </div>
            <p>{status.solutionImport.message}</p>
            <div className="hero-button-row">
              <button
                className="primary-button"
                type="button"
                onClick={() => onNavigate("landing")}
              >
                Go to home
              </button>
              <a className="button ghost-button" href="/auth/signin">
                Sign in
              </a>
            </div>
          </section>
        ) : null}

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
              <a className="button primary-button" href="/auth/signin">
                Sign in as admin
              </a>
              <button
                className="ghost-button"
                type="button"
                onClick={() => onNavigate("landing")}
              >
                Go to home
              </button>
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

        {canUseWizard ? (
          <section className="onboarding-progress-steps" aria-label="Setup steps">
            {setupSteps.map((step, index) => (
              <button
                className={`onboarding-progress-step ${
                  completedSteps[index] ? "complete" : ""
                } ${activeStep === index ? "active" : ""}`}
                key={step}
                type="button"
                onClick={() => setActiveStep(index)}
              >
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </button>
            ))}
          </section>
        ) : null}

        {error ? <div className="auth-error onboarding-error">{error}</div> : null}
        {setupMessage ? (
          <div className="onboarding-status-message">{setupMessage}</div>
        ) : null}

        {canUseWizard ? (
          <section className="onboarding-builder-grid">
            {activeStep === 0 ? (
              <article className="onboarding-map-card">
                <div className="onboarding-card-head">
                  <span className="section-kicker">1. Choose geography</span>
                  <h2>Country to onboard</h2>
                  <p>
                    CHART uses a flexible geography model so each country can use the
                    administrative labels that make sense locally.
                  </p>
                </div>
                <OnboardingCountryMap countryName={selectedCountry?.name ?? ""} />
                <div className="onboarding-form-grid">
                  <label>
                    Country
                    <select
                      value={selectedCountryCode}
                      onChange={(event) => setSelectedCountryCode(event.target.value)}
                    >
                      <option value="">Select country</option>
                      {countryOptions.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    First subnational label
                    <select
                      value={geographyLevelLabel}
                      onChange={(event) => setGeographyLevelLabel(event.target.value)}
                    >
                      {geographyLevelLabels.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            ) : null}

            {activeStep === 1 ? (
              <article className="onboarding-selection-card onboarding-step-panel">
                <div className="onboarding-card-head">
                  <span className="section-kicker">2. Select hazards</span>
                  <h2>Priority climate hazards</h2>
                  <p>
                    These hazards decide which action repository records and planning
                    prompts the first workspace starts with.
                  </p>
                </div>
                <div className="hazard-choice-grid">
                  {hazardOptions.length > 0 ? (
                    hazardOptions.map((hazard) => (
                      <button
                        className={`hazard-choice ${
                          selectedHazardIds.includes(hazard.id) ? "selected" : ""
                        }`}
                        key={hazard.id}
                        type="button"
                        onClick={() => toggleHazard(hazard.id)}
                      >
                        {hazard.label}
                      </button>
                    ))
                  ) : (
                    <div className="empty-panel">
                      <h2>No hazards available yet</h2>
                      <p>CHART could not load the initial action repository choices.</p>
                    </div>
                  )}
                </div>
              </article>
            ) : null}

            {activeStep === 2 ? (
              <article className="onboarding-selection-card onboarding-step-panel">
                <div className="onboarding-card-head">
                  <span className="section-kicker">3. Prepare repository</span>
                  <h2>Actions matching selected hazards</h2>
                  <p>
                    Review the action repository records CHART will surface first for
                    the hazards selected in this setup.
                  </p>
                </div>
                <div className="setup-fact-grid">
                  <div className="setup-fact">
                    <span>Repository actions</span>
                    <strong>{matchingRepositoryItemCount}</strong>
                  </div>
                  <div className="setup-fact">
                    <span>Selected hazards</span>
                    <strong>{selectedHazardIds.length}</strong>
                  </div>
                </div>
                <p className="onboarding-muted-copy">
                  Finishing setup imports these matching actions into the workspace
                  snapshot so planning can continue even if the repository service is
                  unavailable later.
                </p>
                <div className="onboarding-repository-preview">
                  {repositoryGroups.map((group) => (
                    <div className="onboarding-repository-group" key={group.id}>
                      <div>
                        <strong>{group.label}</strong>
                        <span>{group.items.length} actions</span>
                      </div>
                      <div className="onboarding-solution-strip">
                        {group.items.slice(0, 4).map((item) => (
                          <article className="onboarding-solution-card" key={item.id}>
                            <strong>{item.name}</strong>
                            <p>{item.summary ?? item.description}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onNavigate("solutions")}
                >
                  Preview public repository
                </button>
              </article>
            ) : null}

            {activeStep === 3 ? (
              <article className="onboarding-selection-card onboarding-step-panel">
                <div className="onboarding-card-head">
                  <span className="section-kicker">4. Create admin</span>
                  <h2>First administrator account</h2>
                  <p>
                    This account becomes the first owner for the selected country
                    workspace and can add more users after setup.
                  </p>
                </div>
                <div className="onboarding-form-grid">
                  <label>
                    Name
                    <input
                      value={adminUser.name}
                      onChange={(event) =>
                        setAdminUser((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={adminUser.email}
                      onChange={(event) =>
                        setAdminUser((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Username
                    <input
                      value={adminUser.username}
                      onChange={(event) =>
                        setAdminUser((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Password
                    <input
                      minLength={8}
                      type="password"
                      value={adminUser.password}
                      onChange={(event) =>
                        setAdminUser((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </article>
            ) : null}
          </section>
        ) : null}

        {canUseWizard ? (
          <section className="onboarding-summary-band">
            <div>
              <span className="section-kicker">Setup summary</span>
              <h2>{selectedCountry?.name ?? "Choose a country"} deployment</h2>
              <p>
                {selectedCountry
                  ? `${selectedCountry.name} will start with ${geographyLevelLabel} as a configurable geography label.`
                  : "Select a country to connect the map and geography model."}
              </p>
            </div>
            <div className="hero-button-row">
              <button
                className="ghost-button"
                type="button"
                disabled={activeStep === 0}
                onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
              >
                Back
              </button>
              {activeStep < setupSteps.length - 1 ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={continueSetup}
                >
                  Continue
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  disabled={isCompleting}
                  onClick={finishSetup}
                >
                  {isCompleting ? "Creating setup" : "Finish setup"}
                </button>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function groupSolutionsByHazard(
  items: SolutionRepositoryItem[],
  hazards: { id: string; label: string }[],
  selectedHazardIds: string[],
) {
  return selectedHazardIds.map((hazardId) => {
    const hazard = hazards.find((candidate) => candidate.id === hazardId);

    return {
      id: hazardId,
      label: hazard?.label ?? hazardId,
      items: items.filter((item) =>
        item.taxonomies.some((taxonomy) => taxonomy.id === hazardId),
      ),
    };
  });
}
