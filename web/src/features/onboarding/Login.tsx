"use client";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { Button, buttonClassName } from "@/components/Button";
import { ExplainerVideo } from "@/components/ExplainerVideo";
import { Icon, IconSprite } from "@/components/Icon";
import { startKeycloakSignIn, takeSignedOutReason } from "@/lib/authClient";
import { getSetupStatus } from "@/lib/setupClient";
import { DashboardPreview } from "./DashboardPreview";
import styles from "./Login.module.css";

type SetupMode = "auto" | "configured" | "required";

type Props = {
  onSignIn?: () => void;
  onSetup?: () => void;
  setupMode?: SetupMode;
};

export function Login({
  onSignIn = startKeycloakSignIn,
  onSetup,
  setupMode = "auto",
}: Props) {
  const [detectedMode, setDetectedMode] = useState<
    "checking" | "configured" | "required" | "unavailable"
  >(setupMode === "auto" ? "checking" : setupMode);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);

  useEffect(() => {
    const reason = takeSignedOutReason();
    if (reason === "idle") {
      setSignedOutNotice(
        "You were signed out after 30 minutes without activity. Sign in to continue.",
      );
    } else if (reason === "other_tab") {
      setSignedOutNotice("You signed out of CHART in another tab.");
    }
  }, []);

  useEffect(() => {
    if (setupMode !== "auto") {
      setDetectedMode(setupMode);
      return;
    }

    let cancelled = false;
    getSetupStatus()
      .then((status) => {
        if (!cancelled) {
          setDetectedMode(status.requiresOnboarding ? "required" : "configured");
        }
      })
      .catch(() => {
        if (!cancelled) setDetectedMode("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [setupMode]);

  const needsSetup = detectedMode === "required";
  const isChecking = detectedMode === "checking";

  function continueToAccess() {
    if (needsSetup) {
      if (onSetup) onSetup();
      else window.location.assign("/onboarding");
      return;
    }
    onSignIn();
  }

  return (
    <>
      <IconSprite />
      <div className={styles.page}>
        <header className={styles.header}>
          <a className={styles.brand} href="/" aria-label="CHART home">
            <BrandMark size={28} tone="light" wordmark />
          </a>
          <nav className={styles.nav} aria-label="Main navigation">
            <a href="/explore">Explore the map</a>
            <a href="/learning">Learning Hub</a>
            <button type="button" disabled title="Coming soon">
              Solutions Repository <span>Coming soon</span>
            </button>
            <Button onClick={continueToAccess} disabled={isChecking}>
              {isChecking ? "Please wait…" : needsSetup ? "Set up CHART" : "Sign in"}
            </Button>
          </nav>
        </header>
        <main>
          {signedOutNotice ? (
            <p className={styles.signedOutNotice} role="status">
              {signedOutNotice}
            </p>
          ) : null}
          <section className={styles.hero} aria-labelledby="chart-landing-title">
            <div className={styles.heroInner}>
              <p className={styles.eyebrow}>Open source · Climate × health</p>
              <h1 id="chart-landing-title">
                See how heat affects mothers and children, place by place
              </h1>
              <p className={styles.lede}>
                CHART estimates how much low birth weight and under-five mortality is
                linked to heat in each district and county, for every month of the past
                twenty years and under future climate scenarios, and helps health
                planners decide where and how to act.
              </p>
              <div className={styles.heroActions}>
                <a className={buttonClassName({ size: "lg" })} href="/explore">
                  Explore the map <Icon name="arrow-right" size={16} />
                </a>
                <a
                  className={buttonClassName({ size: "lg", variant: "secondary" })}
                  href="mailto:info@scopeimpact.fi"
                >
                  Request access
                </a>
              </div>
            </div>
            <ExplainerVideo className={styles.heroVideo} />
          </section>
          <div className={styles.dashboardPreview}>
            <DashboardPreview />
          </div>
          <section className={styles.questions} aria-labelledby="questions-title">
            <h2 id="questions-title">Three questions CHART answers</h2>
            <ol className={styles.questionList}>
              <li>
                <h3>What did heat do here?</h3>
                <p>
                  For each month since 2006, the share of low birth weight and
                  under-five deaths linked to that month&rsquo;s heat, from Copernicus
                  ERA5 temperatures and models fitted on local health surveys.
                </p>
              </li>
              <li>
                <h3>What is coming?</h3>
                <p>
                  How that share changes to 2100 under low, high and very high emissions
                  scenarios, with the season each country plans around.
                </p>
              </li>
              <li>
                <h3>Where should we act first?</h3>
                <p>
                  Heat risk beside vulnerability and capacity, and the actions that
                  reduce it, ready to put into a plan.
                </p>
              </li>
            </ol>
            <p className={styles.openNote}>
              Anyone can explore the published estimates without an account. CHART is
              free and open source, so a ministry or partner can run it for their own
              country.
            </p>
          </section>
          <section className={styles.toolkit} aria-labelledby="toolkit-title">
            <h2 id="toolkit-title">Explore the CHART toolkit</h2>
            <div className={styles.cards}>
              <article className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon name="book" size={24} />
                </span>
                <h3>Learning Hub</h3>
                <p>Learn about climate and health, at your own pace.</p>
                <a className={styles.toolLink} href="/learning">
                  Explore Learning Hub <Icon name="arrow-right" size={15} />
                </a>
              </article>
              <article className={styles.card}>
                <span className={styles.cardIcon}>
                  <Icon name="users" size={24} />
                </span>
                <h3>Solutions Repository</h3>
                <p>Find practical actions for climate-resilient health systems.</p>
                <div className={styles.comingSoon}>
                  <Button variant="secondary" disabled>
                    Explore solutions
                  </Button>
                  <span>Coming soon</span>
                </div>
              </article>
            </div>
          </section>
          <section className={styles.partners} aria-labelledby="partners-title">
            <h2 id="partners-title">Co-created with our partners</h2>
            <ul aria-label="Partners">
              <li>
                <a
                  href="https://www.ubs.com/global/en/sustainability-impact/social-impact-and-philanthropy/optimus-foundation.html"
                  aria-label="UBS Optimus Foundation"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src="/partners/ubs.png" alt="UBS" width="90" height="34" />
                  <span>Optimus Foundation</span>
                </a>
              </li>
              <li>
                <a
                  href="https://scopeimpact.fi/"
                  aria-label="SCOPE Impact"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    className={styles.scopeLogo}
                    src="/partners/scope.png"
                    alt="SCOPE Impact"
                    width="152"
                    height="101"
                  />
                </a>
              </li>
              <li>
                <a
                  href="https://www.ceew.in/"
                  aria-label="CEEW"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src="/partners/ceew.png" alt="CEEW" width="143" height="76" />
                </a>
              </li>
              <li>
                <a
                  href="https://www.path.org/"
                  aria-label="PATH"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src="/partners/path.png" alt="PATH" width="140" height="54" />
                </a>
              </li>
              <li>
                <a
                  href="https://globaldevincubator.org/south-asia/"
                  aria-label="Global Development Incubator South Asia"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src="/partners/gdi.svg"
                    alt="Global Development Incubator"
                    width="150"
                    height="85"
                  />
                  <span>South Asia</span>
                </a>
              </li>
              <li>
                <a
                  href="https://amphealth.org/"
                  aria-label="AMP Health"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src="/partners/amp-health.png"
                    alt="AMP Health"
                    width="160"
                    height="36"
                  />
                </a>
              </li>
              <li>
                <a
                  href="https://amref.org/"
                  aria-label="Amref Health Africa"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src="/partners/amref.png"
                    alt="Amref Health Africa"
                    width="150"
                    height="89"
                  />
                </a>
              </li>
              <li>
                <a
                  href="https://www.expert-analytics.com/"
                  aria-label="Expert Analytics"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src="/partners/expert-analytics.png"
                    alt="Expert Analytics"
                    width="160"
                    height="58"
                  />
                </a>
              </li>
            </ul>
          </section>
        </main>
        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <a href="/" className={styles.brand} aria-label="CHART home">
              <BrandMark size={28} tone="light" wordmark />
            </a>
            <p>
              Climate &amp; Health Adaptation
              <br />
              and Resilience Toolkit
            </p>
          </div>
          <nav className={styles.footerLinks} aria-label="Resources">
            <h2>Resources</h2>
            <a
              href="https://chart-scope.github.io/CHART/docs/"
              target="_blank"
              rel="noreferrer"
            >
              Documentation <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://chart-scope.github.io/CHART/"
              target="_blank"
              rel="noreferrer"
            >
              Brand Kit <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://github.com/CHART-Scope/CHART"
              target="_blank"
              rel="noreferrer"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://github.com/CHART-Scope/CHART/blob/main/LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              License <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </footer>
      </div>
    </>
  );
}
