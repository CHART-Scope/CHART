"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Pill } from "@/components/Pill";
import { Select } from "@/components/Select";
import { Stepper, type Step } from "@/components/Stepper";
import { TextInput } from "@/components/TextInput";
import {
  buildGeoData,
  geoLabelForLevel,
  subGeoLabelForLevel,
  type SetupCountryOption,
} from "./data/geo";
import { SECTORS } from "./data/sectors";
import styles from "./OnboardingWizard.module.css";
import { useOnboardingStore, type OnboardingState } from "./store";

const STEPS: Step[] = [
  { id: "country", title: "Country", sub: "Select your country" },
  { id: "area", title: "Administrative area", sub: "Level & geography" },
  { id: "sectors", title: "Sector & roles", sub: "Your role & collaborators" },
  { id: "workspace", title: "CHART workspace", sub: "Review & launch" },
];

export const exampleSetupSectors: SetupSector[] = SECTORS.map(({ id, label }) => ({
  id,
  label,
}));

export type SetupSector = {
  id: string;
  label: string;
};

export type { OnboardingState } from "./store";

type Props = {
  sectors?: SetupSector[];
  actionRepositoryCount?: number;
  initialStep?: number;
  initialState?: Partial<OnboardingState>;
  onLaunch?: (state: OnboardingState) => void | Promise<void>;
  geographyCatalog?: SetupCountryOption[];
};

export function OnboardingWizard({
  sectors = exampleSetupSectors,
  actionRepositoryCount,
  initialStep,
  initialState,
  onLaunch,
  geographyCatalog = [],
}: Props) {
  const state = useOnboardingStore();
  const {
    setCountry,
    setLevel,
    setGeo,
    setSubgeo,
    selectPrimarySector,
    toggleCollaboratingSector,
    setAdminField,
    setStep,
    hydrate,
    reset,
  } = state;

  useEffect(() => {
    if (!initialState && initialStep === undefined) return;
    reset();
    if (initialState) hydrate(initialState);
    if (initialStep !== undefined) {
      setStep(Math.max(0, Math.min(STEPS.length - 1, initialStep)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const idx = Math.min(STEPS.length - 1, Math.max(0, state.currentStep));

  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [showAdminDialog, setShowAdminDialog] = useState(false);

  const geoData = useMemo(() => buildGeoData(geographyCatalog), [geographyCatalog]);
  const countries = useMemo(() => Object.keys(geoData), [geoData]);
  const levels = useMemo(
    () => (state.country ? Object.keys(geoData[state.country] ?? {}) : []),
    [geoData, state.country],
  );
  const levelCfg =
    state.country && state.level ? geoData[state.country]?.[state.level] : undefined;
  const subOptions = levelCfg?.sub && state.geo ? levelCfg.sub[state.geo] : null;
  const selectedCountry = geographyCatalog.find(
    (country) => country.countryName === state.country,
  );
  const selectedPlaceName = state.subgeo ?? state.geo;
  const selectedPlace = selectedCountry?.places.find(
    (place) => place.name === selectedPlaceName,
  );
  const selectedModelMappings = selectedPlace?.modelMappings ?? [];
  const levelModelPlaces = (selectedCountry?.places ?? []).filter(
    (place) =>
      place.levelLabel === state.level && (place.modelMappings?.length ?? 0) > 0,
  );
  const adminReady =
    state.adminName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail) &&
    state.adminPassword.length >= 8;

  const canContinue = (() => {
    if (idx === 0) return !!state.country;
    if (idx === 1) {
      if (!state.level || !state.geo) return false;
      return !levelCfg?.sub || !!state.subgeo;
    }
    if (idx === 2) return !!state.primarySectorId;
    return true;
  })();

  async function next() {
    if (idx < STEPS.length - 1) {
      setLaunchError(null);
      setStep(idx + 1);
      return;
    }
    if (!adminReady) {
      setShowAdminDialog(true);
      return;
    }
    await launch();
  }

  async function launch() {
    if (!onLaunch || isLaunching) return;

    setIsLaunching(true);
    setLaunchError(null);
    try {
      await onLaunch(snapshot(state));
    } catch (error) {
      setLaunchError(
        error instanceof Error
          ? error.message
          : "CHART could not finish installation setup. Please try again.",
      );
    } finally {
      setIsLaunching(false);
    }
  }

  return (
    <>
      <div className={styles.frame}>
        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <div className={styles.logo}>CHART</div>
            <div className={styles.intro}>
              <h2>Find your role in the CHART workspace</h2>
              <p>
                Tell us the geography, administrative area, and sector you represent,
                and CHART will set up a shared workspace for you and key departments to
                drive climate and health planning in your region.
              </p>
            </div>
            <Stepper
              steps={STEPS}
              currentIndex={idx}
              onStepClick={(stepIndex) => {
                if (stepIndex <= idx) setStep(stepIndex);
              }}
            />
          </aside>

          <div className={styles.content}>
            <div className={styles.header}>
              <div className={styles.indicator}>
                Step {idx + 1} of {STEPS.length} · {STEPS[idx].title}
              </div>
            </div>

            <div className={styles.main}>
              {idx === 0 ? (
                <section>
                  <p className={styles.heading}>What geography do you represent?</p>
                  <p className={styles.desc}>
                    Choose the country you represent to load the right administrative
                    boundaries, climate data and health system context.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Select country</NumberedLabel>
                    <Select
                      className={styles.setupSelect}
                      placeholder="— Choose a country —"
                      value={state.country ?? ""}
                      onChange={(event) => setCountry(event.currentTarget.value)}
                      options={countries.map((country) => ({
                        value: country,
                        label: country,
                      }))}
                    />
                  </div>
                  <div className={styles.infoNote}>
                    <strong>Manifest-configured countries</strong>
                    This installation currently provides {countries.length} configured
                    {countries.length === 1 ? " country" : " countries"}. New countries
                    appear here after their model release and geography manifest is
                    installed.
                  </div>
                </section>
              ) : null}

              {idx === 1 ? (
                <section>
                  <p className={styles.heading}>Your administrative area</p>
                  <p className={styles.desc}>
                    Choose the administrative level you are responsible for and the
                    specific geography you serve.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Administrative level</NumberedLabel>
                    <Select
                      className={styles.setupSelect}
                      placeholder="— Choose a level —"
                      value={state.level ?? ""}
                      onChange={(event) => setLevel(event.currentTarget.value)}
                      options={levels.map((level) => ({
                        value: level,
                        label: level,
                      }))}
                    />
                  </div>
                  {levelCfg ? (
                    <div className={styles.subsection}>
                      <NumberedLabel n={2}>{geoLabelForLevel(levelCfg)}</NumberedLabel>
                      <Select
                        className={styles.setupSelect}
                        placeholder="— Choose —"
                        value={state.geo ?? ""}
                        onChange={(event) => setGeo(event.currentTarget.value)}
                        options={levelCfg.options.map((option) => ({
                          value: option,
                          label: onboardingPlaceLabel(option, selectedCountry),
                        }))}
                      />
                    </div>
                  ) : null}
                  {subOptions ? (
                    <div className={styles.subsection}>
                      <NumberedLabel n={3}>
                        {subGeoLabelForLevel(levelCfg!)}
                      </NumberedLabel>
                      <Select
                        className={styles.setupSelect}
                        placeholder="— Choose —"
                        value={state.subgeo ?? ""}
                        onChange={(event) => setSubgeo(event.currentTarget.value)}
                        options={subOptions.map((option) => ({
                          value: option,
                          label: onboardingPlaceLabel(option, selectedCountry),
                        }))}
                      />
                    </div>
                  ) : null}
                  {levelCfg ? (
                    <ModelMappingDirectory
                      levelLabel={state.level ?? "Area"}
                      places={levelModelPlaces}
                    />
                  ) : null}
                  {selectedPlace && selectedModelMappings.length > 0 ? (
                    <div className={styles.modelMapping} role="status">
                      <strong>Model mapping from the installed manifest</strong>
                      <span>
                        {selectedPlace.name} · {selectedPlace.levelLabel}
                      </span>
                      <ul>
                        {selectedModelMappings.map((mapping) => (
                          <li key={`${mapping.releaseId}-${mapping.outcome}`}>
                            <b>{mapping.outcomeLabel}</b>
                            <span aria-hidden> → </span>
                            {mapping.modelAreaName} ({mapping.modelScopeLabel})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {idx === 2 ? (
                <section>
                  <p className={styles.heading}>Your sector of work</p>
                  <p className={styles.desc}>
                    Climate and health risks cut across sectors — no single department
                    can manage them alone. Tell us where you sit and who you already
                    work with, so CHART can connect you with key departments tackling
                    the same risks.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Your primary sector</NumberedLabel>
                    <div className={styles.sectorGrid}>
                      {sectors.map((sector) => (
                        <Pill
                          key={sector.id}
                          selected={state.primarySectorId === sector.id}
                          onClick={() => selectPrimarySector(sector.id)}
                        >
                          {sector.label}
                        </Pill>
                      ))}
                    </div>
                  </div>
                  <div className={styles.subsection}>
                    <NumberedLabel n={2}>
                      Sectors you already collaborate with
                    </NumberedLabel>
                    <p className={styles.collabHelp}>
                      Invite the departments you already collaborate with. You can add
                      more later.
                    </p>
                    <div className={styles.sectorGrid}>
                      {sectors
                        .filter((sector) => sector.id !== state.primarySectorId)
                        .map((sector) => (
                          <Pill
                            key={sector.id}
                            selected={state.collaboratingSectorIds.includes(sector.id)}
                            onClick={() => toggleCollaboratingSector(sector.id)}
                          >
                            {sector.label}
                          </Pill>
                        ))}
                    </div>
                  </div>
                  <div className={styles.whyBox}>
                    <strong>Why this matters</strong>
                    <p>
                      Climate-health risks rarely respect ministry lines. CHART surfaces
                      shared risks, joint actions and common data — so planning happens
                      together, not in silos.
                    </p>
                  </div>
                </section>
              ) : null}

              {idx === 3 ? (
                <section>
                  <p className={styles.heading}>Ready to join CHART workspace</p>
                  <p className={styles.desc}>
                    Here&apos;s a summary of your setup. You can update it anytime in
                    Settings.
                  </p>
                  <SetupReview
                    state={state}
                    sectors={sectors}
                    actionRepositoryCount={actionRepositoryCount}
                    onEdit={setStep}
                  />
                </section>
              ) : null}
            </div>

            <div className={styles.footer}>
              {launchError ? (
                <p className={styles.launchError} role="alert">
                  {launchError}
                </p>
              ) : null}
              <div className={styles.actions}>
                {idx > 0 ? (
                  <Button variant="secondary" onClick={() => setStep(idx - 1)}>
                    Back
                  </Button>
                ) : null}
                <Button
                  onClick={() => void next()}
                  disabled={!canContinue || isLaunching}
                >
                  {idx === STEPS.length - 1
                    ? isLaunching
                      ? "Launching CHART…"
                      : "Launch CHART"
                    : "Continue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showAdminDialog ? (
        <div className={styles.dialogBackdrop}>
          <section
            className={styles.adminDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-admin-title"
          >
            <span className={styles.dialogEyebrow}>First administrator</span>
            <h2 id="setup-admin-title">Create the account that will own CHART</h2>
            <p>
              This administrator can invite people and assign their roles and planning
              areas after launch.
            </p>
            <div className={styles.adminGrid}>
              <TextInput
                id="setup-admin-name"
                label="Full name"
                value={state.adminName}
                onChange={(event) =>
                  setAdminField("adminName", event.currentTarget.value)
                }
                autoComplete="name"
              />
              <TextInput
                id="setup-admin-email"
                label="Email address"
                type="email"
                value={state.adminEmail}
                onChange={(event) =>
                  setAdminField("adminEmail", event.currentTarget.value)
                }
                autoComplete="email"
              />
              <TextInput
                id="setup-admin-password"
                label="Administrator password"
                type="password"
                minLength={8}
                value={state.adminPassword}
                onChange={(event) =>
                  setAdminField("adminPassword", event.currentTarget.value)
                }
                autoComplete="new-password"
              />
            </div>
            <p className={styles.adminNote}>
              Use at least eight characters. After setup, sign in with the email address
              above.
            </p>
            {launchError ? (
              <p className={styles.dialogError} role="alert">
                {launchError}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setLaunchError(null);
                  setShowAdminDialog(false);
                }}
                disabled={isLaunching}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void launch()}
                disabled={!adminReady || isLaunching}
              >
                {isLaunching ? "Launching CHART…" : "Create account & launch"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function ModelMappingDirectory({
  levelLabel,
  places,
}: {
  levelLabel: string;
  places: SetupCountryOption["places"];
}) {
  if (places.length === 0) {
    return (
      <div className={styles.mappingUnavailable} role="alert">
        <strong>Model mapping details are not available</strong>
        The setup service has not returned the fitted model areas. Restart the backend
        before verifying or launching onboarding.
      </div>
    );
  }

  const modelAreas = [
    ...new Set(
      places.flatMap((place) =>
        (place.modelMappings ?? []).map(
          (mapping) => `${mapping.modelAreaName} · ${mapping.modelScopeLabel}`,
        ),
      ),
    ),
  ];
  return (
    <section className={styles.mappingDirectory} aria-label="Manifest model mappings">
      <strong>{levelLabel} → fitted model area</strong>
      <p>
        The installed manifests map {places.length} {levelLabel.toLowerCase()}
        {places.length === 1 ? "" : "s"} to {modelAreas.length} fitted model area
        {modelAreas.length === 1 ? "" : "s"}.
      </p>
      <div className={styles.mappingAreas}>
        {modelAreas.map((area) => (
          <span key={area}>{area}</span>
        ))}
      </div>
      <details open>
        <summary>{levelLabel} and model-area mappings</summary>
        <ul>
          {places.map((place) => (
            <li key={place.id}>
              <b>{place.name}</b>
              <span>
                {(place.modelMappings ?? [])
                  .map(
                    (mapping) => `${mapping.modelAreaName} (${mapping.outcomeLabel})`,
                  )
                  .join("; ")}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function onboardingPlaceLabel(name: string, country: SetupCountryOption | undefined) {
  const place = country?.places.find((item) => item.name === name);
  const mappings = place?.modelMappings ?? [];
  if (mappings.length === 0) return name;
  const summaries = [
    ...new Set(
      mappings.map(
        (mapping) => `${mapping.modelAreaName} · ${mapping.modelScopeLabel}`,
      ),
    ),
  ];
  const remainder = summaries.length > 1 ? ` +${summaries.length - 1} model` : "";
  return `${name} — ${summaries[0]}${remainder}`;
}

function snapshot(state: OnboardingState): OnboardingState {
  return {
    country: state.country,
    level: state.level,
    geo: state.geo,
    subgeo: state.subgeo,
    primarySectorId: state.primarySectorId,
    collaboratingSectorIds: [...state.collaboratingSectorIds],
    adminName: state.adminName,
    adminEmail: state.adminEmail,
    adminPassword: state.adminPassword,
    currentStep: state.currentStep,
  };
}

function NumberedLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className={styles.sublabel}>
      <div className={styles.subnum}>{n}</div>
      <div className={styles.subtitle}>{children}</div>
    </div>
  );
}

function SetupReview({
  state,
  sectors,
  actionRepositoryCount,
  onEdit,
}: {
  state: OnboardingState;
  sectors: SetupSector[];
  actionRepositoryCount?: number;
  onEdit: (index: number) => void;
}) {
  const primarySector = sectors.find((sector) => sector.id === state.primarySectorId);
  const collaboratingSectors = sectors.filter((sector) =>
    state.collaboratingSectorIds.includes(sector.id),
  );
  const geography = state.subgeo ?? state.geo ?? state.country ?? "—";
  const workspaceSector = primarySector?.label.toLowerCase() ?? "your sector";

  return (
    <div className={styles.reviewStack}>
      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div className={styles.reviewLabel}>Geography</div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(0)}>
            Edit
          </button>
        </div>
        <div className={styles.reviewGrid}>
          <div>
            <div className={styles.reviewLabel}>Country</div>
            <div className={styles.reviewValue}>{state.country ?? "—"}</div>
          </div>
          <div>
            <div className={styles.reviewLabel}>Administrative level</div>
            <div className={styles.reviewValue}>{state.level ?? "—"}</div>
          </div>
          <div>
            <div className={styles.reviewLabel}>Geography</div>
            <div className={styles.reviewValue}>{geography}</div>
          </div>
        </div>
      </div>

      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div>
            <div className={styles.reviewLabel}>Your sector</div>
          </div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(2)}>
            Edit
          </button>
        </div>
        <div>
          <div className={styles.reviewValue}>{primarySector?.label ?? "—"}</div>
        </div>
      </div>

      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div className={styles.reviewLabel}>Collaborating sectors</div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(2)}>
            Edit
          </button>
        </div>
        {collaboratingSectors.length ? (
          <div className={styles.sectorGrid}>
            {collaboratingSectors.map((sector) => (
              <Chip key={sector.id}>{sector.label}</Chip>
            ))}
          </div>
        ) : (
          <div className={styles.reviewValue}>None selected</div>
        )}
      </div>

      {actionRepositoryCount !== undefined ? (
        <div className={styles.reviewCard}>
          <div className={styles.reviewLabel}>Action repository</div>
          <div className={styles.reviewValue}>
            {actionRepositoryCount} published actions loaded
          </div>
        </div>
      ) : null}

      <div className={styles.launchBanner}>
        <h3>CHART collaborative workspace is ready</h3>
        <p>
          Surfacing shared risks and joint actions to protect {workspaceSector} in{" "}
          {geography} — bringing departments together around a common view.
        </p>
      </div>
    </div>
  );
}
