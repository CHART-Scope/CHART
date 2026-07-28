"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbPill,
  Button,
  Chip,
  FillFigure,
  Icon,
  IconArray,
  IconSprite,
  Modal,
  Panel,
  PrecisionBadge,
  Select,
  Slider,
  Stepper,
} from "@/components";

import styles from "./design-system.module.css";

const BASE_SWATCHES: Array<{ token: string; label: string; note?: string }> = [
  { token: "--color-ivory", label: "Ivory", note: "bg" },
  { token: "--color-charcoal", label: "Charcoal", note: "text / nav" },
  { token: "--color-nexus", label: "Nexus (blue)", note: "primary" },
  { token: "--color-maroon", label: "Maroon", note: "critical / risk" },
  { token: "--color-lime", label: "Lime", note: "active / done" },
  { token: "--color-grey-mid", label: "Grey mid", note: "borders" },
  { token: "--color-grey-light", label: "Grey light", note: "surfaces" },
  { token: "--color-text-muted", label: "Text muted" },
  { token: "--color-text-light", label: "Text light" },
];

const SEMANTIC_SWATCHES: Array<{ token: string; label: string }> = [
  { token: "--color-success", label: "Success / High" },
  { token: "--color-amber", label: "Amber / Moderate" },
  { token: "--color-sem-low", label: "Rose / Low, Policy" },
  { token: "--color-env", label: "Environment" },
  { token: "--color-sem-behaviour", label: "Behaviour change" },
];

export default function DesignSystemPage() {
  const [step, setStep] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [slider, setSlider] = useState(32);

  return (
    <>
      <IconSprite />
      <div className={styles.wrap}>
        <Hero />

        <Section
          title="1. Foundations"
          desc="Color and type tokens used consistently across all three prototypes."
        >
          <Subblock title="Color · Base palette">
            <SwatchGrid swatches={BASE_SWATCHES} />
          </Subblock>

          <Subblock title="Color · Semantic (status / precision / solution type)">
            <SwatchGrid swatches={SEMANTIC_SWATCHES} />
            <p className={styles.note}>
              Pattern: semantic chips / badges use a 10–12% opacity tint of their color
              as background, and the full-strength color for text / border / icon —
              never a solid fill. See §5 Chips & badges.
            </p>
          </Subblock>

          <Subblock title="Typography">
            <div className={styles.row}>
              <div className={styles.stage} style={{ flex: 1, minWidth: 260 }}>
                <div className={styles.stageLabel}>
                  Display / data / labels — Fira Sans
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 500,
                  }}
                >
                  Aa 35°C 12%
                </div>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginTop: 8,
                  }}
                >
                  Page titles, panel titles, eyebrow labels, stat numbers, breadcrumb
                  chips, buttons with numeric content.
                </p>
              </div>
              <div className={styles.stage} style={{ flex: 1, minWidth: 260 }}>
                <div className={styles.stageLabel}>Body — Noto Sans Display</div>
                <div style={{ fontSize: 16 }}>Aa The quick brown fox</div>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    marginTop: 8,
                  }}
                >
                  Paragraphs, descriptions, form inputs, buttons, nav items.
                </p>
              </div>
            </div>
          </Subblock>

          <Subblock title="Radius & elevation">
            <p
              style={{
                fontSize: 12.5,
                color: "var(--color-text-muted)",
                lineHeight: 1.7,
              }}
            >
              Cards / panels: <code className={styles.code}>12–14px</code> radius,{" "}
              <code className={styles.code}>1px grey-mid</code> border, no shadow at
              rest. Buttons / inputs: <code className={styles.code}>6–8px</code>. Pills
              / chips / badges: <code className={styles.code}>99px</code> (full round).
              Modals: <code className={styles.code}>14px</code> radius + soft shadow —
              the only elevated surface in the system.
            </p>
          </Subblock>
        </Section>

        <Section
          title="2. Navigation"
          desc="Persistent top bar + collapsible left sidebar (see AppShell). Breadcrumbs come in two variants."
        >
          <Subblock title="Breadcrumbs — two variants">
            <div className={styles.row}>
              <div className={styles.stage} style={{ flex: 1, minWidth: 220 }}>
                <div className={styles.stageLabel}>
                  Static box (pre-analysis, e.g. sentence builder)
                </div>
                <BreadcrumbPill>India › Madhya Pradesh</BreadcrumbPill>
              </div>
              <div className={styles.stage} style={{ flex: 1, minWidth: 280 }}>
                <div className={styles.stageLabel}>
                  Interactive crumb bar (analysis screens)
                </div>
                <Breadcrumb
                  items={[
                    { label: "India" },
                    { label: "Madhya Pradesh", onClick: () => {} },
                    { label: "Recommended actions", active: true },
                  ]}
                />
              </div>
            </div>
            <p className={styles.note}>
              Every non-terminal crumb is clickable (nexus-blue, underline on hover).
              The final segment is bold charcoal and inert (current page).
            </p>
          </Subblock>
        </Section>

        <Section
          title="3. Stages · Onboarding stepper"
          desc="Multi-step wizard from the onboarding prototype. States: upcoming (transparent) → active (maroon) → done (lime)."
        >
          <div
            className={styles.stage}
            style={{ background: "var(--surface-inverse)" }}
          >
            <Stepper
              steps={[
                { id: "country", title: "Country", sub: "Select your country" },
                {
                  id: "area",
                  title: "Administrative area",
                  sub: "Level & geography",
                },
                {
                  id: "sector",
                  title: "Sector",
                  sub: "Your role & collaborators",
                },
                {
                  id: "workspace",
                  title: "CHART workspace",
                  sub: "Review & launch",
                },
              ]}
              currentIndex={step}
              onStepClick={setStep}
            />
          </div>
          <p className={styles.note}>
            Clicking any step in the list jumps directly to it (non-linear navigation
            allowed). Try it above.
          </p>
        </Section>

        <Section title="4. Buttons">
          <div className={styles.stage}>
            <div className={styles.row} style={{ alignItems: "center" }}>
              <Button variant="primary">Primary action</Button>
              <Button variant="primary" disabled>
                Primary (disabled)
              </Button>
              <Button variant="secondary">Secondary action</Button>
              <Button variant="icon" aria-label="More">
                <Icon name="chevron-down" size={16} />
              </Button>
            </div>
            <p className={styles.note}>
              Primary: solid nexus blue — used once per view for the main forward
              action. Secondary: charcoal 1.5px outline — used for reversible / lesser
              actions. Icon button: square, bordered — used for overflow menus and
              toolbar actions.
            </p>
          </div>
        </Section>

        <Section title="5. Cards, panels & chips">
          <Subblock title="Panel anatomy">
            <div style={{ maxWidth: 320 }}>
              <Panel eyebrow="Panel eyebrow label">
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-charcoal)",
                  }}
                >
                  Panel content goes here
                </div>
              </Panel>
            </div>
            <p className={styles.note}>
              White fill, 1px grey-mid border, 12px radius. Eyebrow label (Fira Sans,
              uppercase, letter-spaced) is the standard way to title a panel inside a
              multi-panel row.
            </p>
          </Subblock>

          <Subblock title="Chips & tags (color-coded by category)">
            <div className={styles.row}>
              <Chip tone="behaviour">Behaviour change</Chip>
              <Chip tone="environment">Environment</Chip>
              <Chip tone="policy">Policy</Chip>
            </div>
            <p className={styles.note}>
              Tint background + full-color text, no border. Used for solution type,
              department, and other single-value categorical tags.
            </p>
          </Subblock>

          <Subblock title="Precision / confidence badge">
            <div className={styles.row}>
              <PrecisionBadge level="high" onClick={() => setModalOpen(true)} />
              <PrecisionBadge level="moderate" onClick={() => setModalOpen(true)} />
              <PrecisionBadge level="low" onClick={() => setModalOpen(true)} />
            </div>
            <p className={styles.note}>
              Outlined pill (not tint-filled, unlike category chips) — signals "this is
              a meta-judgment about the data." Click any badge to open the explainer
              modal (§9).
            </p>
          </Subblock>
        </Section>

        <Section title="6. Form controls">
          <div className={styles.row}>
            <div className={styles.stage} style={{ flex: 1, minWidth: 260 }}>
              <div className={styles.stageLabel}>Inline sentence-builder select</div>
              <Select
                variant="inline"
                options={[
                  { value: "heat", label: "Extreme heat" },
                  { value: "flood", label: "Flooding" },
                ]}
              />
              <p className={styles.note}>
                Nexus-tinted pill, borderless — sits inline inside a sentence ("…for the
                impacts of [Extreme heat]…").
              </p>
            </div>
            <div className={styles.stage} style={{ flex: 1, minWidth: 260 }}>
              <div className={styles.stageLabel}>Standard filter / dropdown</div>
              <Select
                variant="filter"
                options={[
                  { value: "all", label: "All solution types" },
                  { value: "policy", label: "Policy" },
                ]}
              />
              <p className={styles.note}>
                Bordered pill, white fill — used for filters and any standalone
                dropdown, e.g. the geography selector.
              </p>
            </div>
          </div>

          <div className={styles.stage} style={{ marginTop: 14 }}>
            <div className={styles.stageLabel}>Range slider</div>
            <Slider
              min={30}
              max={35}
              step={0.1}
              value={slider}
              onChange={setSlider}
              formatReadout={(v) => `${v.toFixed(1)}°C`}
              formatLabel={(v) => `${v}°C`}
              ariaLabel="Temperature threshold"
            />
            <p className={styles.note}>
              Custom track (grey, thin) + circular nexus-blue thumb with white border.
              Track fills nexus-blue up to the thumb via inline gradient.
            </p>
          </div>
        </Section>

        <Section
          title="7. Data visualization patterns"
          desc="Recurring illustrative-data patterns rather than generic chart output — kept consistent so different metrics feel like the same product."
        >
          <div className={styles.row}>
            <div className={styles.stage} style={{ flex: 1, minWidth: 300 }}>
              <div className={styles.stageLabel}>
                Fill figure — heat exposure comparison
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 40,
                  justifyContent: "center",
                  padding: "12px 0",
                }}
              >
                <FillFigure
                  figure="mother-baby"
                  value={22}
                  color="var(--color-nexus)"
                  label="Shaded / cool"
                  subFigure="baby"
                />
                <FillFigure
                  figure="mother-baby"
                  value={72}
                  color="var(--color-maroon)"
                  label="Heat exposed"
                  subFigure="baby"
                />
              </div>
              <p className={styles.note}>
                Body-shaped silhouette filled bottom-up in a color to represent a
                percentage. Use when the goal is to feel a magnitude (severity, risk
                share). Paired to compare two conditions.
              </p>
            </div>
            <div className={styles.stage} style={{ flex: 1, minWidth: 260 }}>
              <div className={styles.stageLabel}>
                Icon array — maternal heat exposure
              </div>
              <IconArray
                value={25}
                figure="mother-baby"
                captionSuffix="maternal heat exposure"
              />
              <p className={styles.note}>
                10×10 grid of a single figure, N filled = N%. Prefer over the fill
                figure when the goal is making a percentage feel countable rather than a
                magnitude.
              </p>
            </div>
            <div className={styles.stage} style={{ flex: 1, minWidth: 220 }}>
              <div className={styles.stageLabel}>Choropleth grid map (planned)</div>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--color-text-muted)",
                  lineHeight: 1.6,
                }}
              >
                Procedurally-generated colored grid (ivory → amber → orange → maroon)
                clipped to a boundary path.
              </p>
            </div>
          </div>
        </Section>

        <Section title="9. Modal / overlay">
          <div className={styles.stage}>
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
            <p className={styles.note}>
              Only surface in the system with elevation (shadow). Centered,
              backdrop-dimmed. Secondary "Close" always present; primary CTA only when
              there's a next action.
            </p>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Precision"
            description="Explains what a badge or metric means, with a level-specific detail line below."
            footer={
              <>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Close
                </Button>
                <Button variant="primary">Improve precision</Button>
              </>
            }
          />
        </Section>

        <Section
          title="10. Icon system"
          desc="Hand-built inline SVG line-contour symbols (not an external icon font) — thin uniform stroke, rounded caps / joins, colored via currentColor."
        >
          <IconRow />
        </Section>
      </div>
    </>
  );
}

function Hero() {
  return (
    <div className={styles.hero}>
      <div className={styles.heroEyebrow}>CHART · Design System v0.1 (draft)</div>
      <div className={styles.heroTitle}>Preliminary UI Design System</div>
      <p className={styles.heroDesc}>
        Compiled from the three existing CHART prototypes (onboarding, Kenya / Kajiado
        app, India / Madhya Pradesh MNCH). This page is the live rendering; the same
        components power Storybook and every product surface. To change the system, edit{" "}
        <code className={styles.code}>src/styles/tokens.css</code> — everything
        downstream updates.
      </p>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {desc && <p className={styles.sectionDesc}>{desc}</p>}
      {children}
    </div>
  );
}

function Subblock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.subblock}>
      <div className={styles.subblockTitle}>{title}</div>
      {children}
    </div>
  );
}

function SwatchGrid({
  swatches,
}: {
  swatches: Array<{ token: string; label: string; note?: string }>;
}) {
  return (
    <div className={styles.grid}>
      {swatches.map((s) => (
        <SwatchCard key={s.token} spec={s} />
      ))}
    </div>
  );
}

function SwatchCard({
  spec,
}: {
  spec: { token: string; label: string; note?: string };
}) {
  const [hex, setHex] = useState("");
  useEffect(() => {
    setHex(
      getComputedStyle(document.documentElement).getPropertyValue(spec.token).trim(),
    );
  }, [spec.token]);
  return (
    <div className={styles.swatch}>
      <div
        className={styles.swatchColor}
        style={{ background: `var(${spec.token})` }}
      />
      <div className={styles.swatchLabel}>
        <div className={styles.swatchName}>{spec.label}</div>
        <div className={styles.swatchHex}>
          {hex || spec.token}
          {spec.note ? ` · ${spec.note}` : ""}
        </div>
      </div>
    </div>
  );
}

function IconRow() {
  const names = [
    "info-circle",
    "book",
    "users",
    "settings",
    "arrow-right",
    "arrow-left",
    "arrow-down",
    "sun",
    "stethoscope",
    "alert-triangle",
    "leaf",
    "policy",
  ] as const;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
        gap: 10,
      }}
    >
      {names.map((n) => (
        <div
          key={n}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            fontSize: 9.5,
            color: "var(--color-text-muted)",
            textAlign: "center",
            padding: 12,
            background: "var(--color-white)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <Icon name={n} size={22} />
          <span>{n}</span>
        </div>
      ))}
    </div>
  );
}
