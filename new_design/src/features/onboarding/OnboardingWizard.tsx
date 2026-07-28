"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Icon, IconSprite } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { Select } from "@/components/Select";
import { Stepper, type Step } from "@/components/Stepper";
import { COUNTRIES, GEO_DATA, geoLabelForLevel, subGeoLabelForLevel } from "./data/geo";
import { SECTORS } from "./data/sectors";
import styles from "./OnboardingWizard.module.css";

const STEPS: Step[] = [
  { id: "country", title: "Country", sub: "Select your country" },
  { id: "area", title: "Administrative area", sub: "Level & geography" },
  { id: "sector", title: "Sector", sub: "Your role & collaborators" },
  { id: "workspace", title: "CHART workspace", sub: "Review & launch" },
];

type State = {
  country: string | null;
  level: string | null;
  geo: string | null;
  subgeo: string | null;
  sector: string | null;
  collab: Set<string>;
};

const EMPTY: State = {
  country: null,
  level: null,
  geo: null,
  subgeo: null,
  sector: null,
  collab: new Set(),
};

type Props = {
  onLaunch?: (state: State) => void;
};

export function OnboardingWizard({ onLaunch }: Props) {
  const [state, setState] = useState<State>(EMPTY);
  const [idx, setIdx] = useState(0);

  const levels = useMemo(
    () => (state.country ? Object.keys(GEO_DATA[state.country]) : []),
    [state.country],
  );
  const levelCfg =
    state.country && state.level ? GEO_DATA[state.country][state.level] : undefined;
  const subOptions = levelCfg?.sub && state.geo ? levelCfg.sub[state.geo] : null;

  const canContinue = (() => {
    if (idx === 0) return !!state.country;
    if (idx === 1) {
      if (!state.level || !state.geo) return false;
      if (levelCfg?.sub && !state.subgeo) return false;
      return true;
    }
    if (idx === 2) return !!state.sector;
    return true;
  })();

  const next = () => (idx < STEPS.length - 1 ? setIdx(idx + 1) : onLaunch?.(state));
  const back = () => idx > 0 && setIdx(idx - 1);

  const setCountry = (v: string) =>
    setState({
      country: v || null,
      level: null,
      geo: null,
      subgeo: null,
      sector: state.sector,
      collab: state.collab,
    });
  const setLevel = (v: string) =>
    setState((s) => ({ ...s, level: v || null, geo: null, subgeo: null }));
  const setGeo = (v: string) =>
    setState((s) => ({ ...s, geo: v || null, subgeo: null }));
  const setSubGeo = (v: string) => setState((s) => ({ ...s, subgeo: v || null }));

  const toggleSector = (id: string) =>
    setState((s) => {
      const collab = new Set(s.collab);
      collab.delete(id);
      return { ...s, sector: id, collab };
    });
  const toggleCollab = (id: string) =>
    setState((s) => {
      const collab = new Set(s.collab);
      if (collab.has(id)) collab.delete(id);
      else collab.add(id);
      return { ...s, collab };
    });

  return (
    <>
      <IconSprite />
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
            <Stepper steps={STEPS} currentIndex={idx} onStepClick={setIdx} />
          </aside>

          <div className={styles.content}>
            <div className={styles.header}>
              <div className={styles.indicator}>
                Step {idx + 1} of {STEPS.length} · {STEPS[idx].title}
              </div>
            </div>
            <div className={styles.main}>
              {idx === 0 && (
                <div>
                  <p className={styles.heading}>What geography do you represent?</p>
                  <p className={styles.desc}>
                    Choose the country you represent to load the right administrative
                    boundaries, climate data and health system context.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Select country</NumberedLabel>
                    <Select
                      placeholder="— Choose a country —"
                      value={state.country ?? ""}
                      onChange={(e) => setCountry(e.currentTarget.value)}
                      options={COUNTRIES.map((c) => ({ value: c, label: c }))}
                    />
                  </div>
                  <div className={styles.infoNote}>
                    <strong>More countries coming soon</strong>
                    CHART currently supports India and Kenya. Expansion to additional
                    countries in Africa and Asia is underway.
                  </div>
                </div>
              )}

              {idx === 1 && (
                <div>
                  <p className={styles.heading}>Your administrative area</p>
                  <p className={styles.desc}>
                    Choose the administrative level you are responsible for and the
                    specific geography you serve.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Administrative level</NumberedLabel>
                    <Select
                      placeholder="— Choose a level —"
                      value={state.level ?? ""}
                      onChange={(e) => setLevel(e.currentTarget.value)}
                      options={levels.map((l) => ({ value: l, label: l }))}
                    />
                  </div>
                  {levelCfg && (
                    <div className={styles.subsection}>
                      <NumberedLabel n={2}>
                        {geoLabelForLevel(state.level!)}
                      </NumberedLabel>
                      <Select
                        placeholder="— Choose —"
                        value={state.geo ?? ""}
                        onChange={(e) => setGeo(e.currentTarget.value)}
                        options={levelCfg.options.map((o) => ({
                          value: o,
                          label: o,
                        }))}
                      />
                    </div>
                  )}
                  {subOptions && (
                    <div className={styles.subsection}>
                      <NumberedLabel n={3}>
                        {subGeoLabelForLevel(state.level!)}
                      </NumberedLabel>
                      <Select
                        placeholder="— Choose —"
                        value={state.subgeo ?? ""}
                        onChange={(e) => setSubGeo(e.currentTarget.value)}
                        options={subOptions.map((o) => ({
                          value: o,
                          label: o,
                        }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {idx === 2 && (
                <div>
                  <p className={styles.heading}>Your sector of work</p>
                  <p className={styles.desc}>
                    Climate and health risks cut across sectors — no single department
                    can manage them alone. Tell us where you sit and who you already
                    work with, so CHART can connect you with key departments tackling
                    the same risks.
                  </p>
                  <div className={styles.subsection}>
                    <NumberedLabel n={1}>Your primary sector</NumberedLabel>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {SECTORS.map((s) => (
                        <Pill
                          key={s.id}
                          selected={state.sector === s.id}
                          onClick={() => toggleSector(s.id)}
                          leadingIcon={<Icon name={s.icon} size={13} />}
                        >
                          {s.label}
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {SECTORS.filter((s) => s.id !== state.sector).map((s) => (
                        <Pill
                          key={s.id}
                          selected={state.collab.has(s.id)}
                          onClick={() => toggleCollab(s.id)}
                          leadingIcon={<Icon name={s.icon} size={13} />}
                        >
                          {s.label}
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
                </div>
              )}

              {idx === 3 && <Review state={state} onEdit={setIdx} />}
            </div>
            <div className={styles.footer}>
              <div className={styles.actions}>
                {idx > 0 && (
                  <Button
                    variant="secondary"
                    onClick={back}
                    leadingIcon={<Icon name="arrow-left" size={14} />}
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={next}
                  disabled={!canContinue}
                  trailingIcon={<Icon name="arrow-right" size={14} />}
                >
                  {idx === STEPS.length - 1 ? "Launch CHART" : "Continue"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function NumberedLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className={styles.sublabel}>
      <div className={styles.subnum}>{n}</div>
      <div className={styles.subtitle}>{children}</div>
    </div>
  );
}

function Review({ state, onEdit }: { state: State; onEdit: (i: number) => void }) {
  const sector = SECTORS.find((s) => s.id === state.sector);
  const collab = SECTORS.filter((s) => state.collab.has(s.id));
  const place = state.subgeo || state.geo || state.country || "your region";
  const sectorLabel = sector ? sector.label.toLowerCase() : "health";
  return (
    <div>
      <p className={styles.heading}>Ready to join CHART workspace</p>
      <p className={styles.desc}>
        Here's a summary of your setup. You can update it anytime in Settings.
      </p>
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
            <div className={styles.reviewValue}>
              {[state.geo, state.subgeo].filter(Boolean).join(" › ") || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div className={styles.reviewLabel}>Your sector</div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(2)}>
            Edit
          </button>
        </div>
        <div className={styles.reviewValue}>{sector?.label ?? "—"}</div>
      </div>

      <div className={styles.reviewCard}>
        <div className={styles.reviewRow}>
          <div className={styles.reviewLabel}>Collaborating sectors</div>
          <button type="button" className={styles.reviewEdit} onClick={() => onEdit(2)}>
            Edit
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {collab.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--color-text-light)" }}>
              None selected — you can add departments later
            </span>
          ) : (
            collab.map((s) => (
              <Chip key={s.id} leadingIcon={<Icon name={s.icon} size={11} />}>
                {s.label}
              </Chip>
            ))
          )}
        </div>
      </div>

      <div className={styles.launchBanner}>
        <h3>CHART collaborative workspace is ready</h3>
        <p>
          Surfacing shared risks and joint actions to protect {sectorLabel} in {place} —
          bringing departments together around a common view.
        </p>
      </div>
    </div>
  );
}
