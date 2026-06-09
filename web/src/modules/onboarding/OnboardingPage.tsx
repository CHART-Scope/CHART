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

const setupSteps = ["Choose geography", "Select hazards", "Create admin"] as const;

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
  const selectedHazardLabels = hazardOptions
    .filter((hazard) => selectedHazardIds.includes(hazard.id))
    .map((hazard) => hazard.label);
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
    Boolean(selectedCountry),
    selectedHazardIds.length > 0,
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
  }, []);

  function continueSetup() {
    if (activeStep === 0 && !selectedCountry) {
      setError("Choose the country for this CHART deployment.");
      return;
    }

    if (activeStep === 1 && selectedHazardIds.length === 0) {
      setError("Choose at least one hazard to personalize this dashboard.");
      return;
    }

    if (activeStep === 2 && isFirstBootstrap && adminUser.password.length < 8) {
      setError("Use a password with at least 8 characters for the first admin.");
      return;
    }

    setError(null);
    setActiveStep((step) => Math.min(setupSteps.length - 1, step + 1));
  }

  function toggleHazard(hazardId: string) {
    setSelectedHazardIds((currentIds) =>
      currentIds.includes(hazardId)
        ? currentIds.filter((currentId) => currentId !== hazardId)
        : [...currentIds, hazardId],
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
      setActiveStep(0);
      setError("Choose the country for this CHART deployment.");
      return;
    }

    if (selectedHazardIds.length === 0) {
      setActiveStep(1);
      setError("Choose at least one hazard to personalize this dashboard.");
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
        setSetupMessage("Setup complete.");
        onNavigate("dashboard");
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
              Choose the country, configure the first geography level, select priority
              hazards, and connect the first administrator account.
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
                <span>Workspace members</span>
                <strong>{status.counts.workspaceMembers}</strong>
              </div>
              <div className="setup-fact">
                <span>Geographies</span>
                <strong>{status.counts.geographies}</strong>
              </div>
              <div className="setup-fact">
                <span>Selected hazards</span>
                <strong>{status.selectedHazards.length}</strong>
              </div>
            </div>
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
                <span className="onboarding-step-label">{step}</span>
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
                  <h2>Priority hazards for the dashboard</h2>
                  <p>
                    These options come from the chart repository API and are stored only
                    as setup context for dashboard personalization.
                  </p>
                </div>
                {hazardOptions.length > 0 ? (
                  <div className="hazard-choice-grid">
                    {hazardOptions.map((hazard) => (
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
                    ))}
                  </div>
                ) : (
                  <p className="onboarding-muted-copy">
                    Hazard options are not available from the chart repository API yet.
                  </p>
                )}
              </article>
            ) : null}

            {activeStep === 2 ? (
              <article className="onboarding-selection-card onboarding-step-panel">
                <div className="onboarding-card-head">
                  <span className="section-kicker">3. Create admin</span>
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
                  ? `${selectedCountry.name} will start with ${geographyLevelLabel} as a configurable geography label${
                      selectedHazardLabels.length > 0
                        ? ` and ${selectedHazardLabels.length} selected hazard${selectedHazardLabels.length === 1 ? "" : "s"} for the dashboard.`
                        : "."
                    }`
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
