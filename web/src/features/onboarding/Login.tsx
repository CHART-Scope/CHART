"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Icon, IconSprite } from "@/components/Icon";
import { startKeycloakSignIn } from "@/lib/authClient";
import { getSetupStatus } from "@/lib/setupClient";
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
      <main className={styles.page}>
        <section className={styles.story} aria-labelledby="chart-landing-title">
          <header className={styles.storyHeader}>
            <a className={styles.brand} href="/" aria-label="CHART home">
              CHART
            </a>
            <span className={styles.productLabel}>Climate × health planning</span>
          </header>

          <div className={styles.storyBody}>
            <p className={styles.eyebrow}>Shared evidence. Coordinated action.</p>
            <h1 id="chart-landing-title">
              Plan for climate risks with the people health depends on.
            </h1>
            <p className={styles.lede}>
              CHART brings climate evidence, health priorities and cross-sector teams
              into one planning workspace—so every decision has a shared view of risk.
            </p>

            <div className={styles.signalGrid} aria-label="What CHART connects">
              <article>
                <span className={styles.signalIcon}>
                  <Icon name="cloud-storm" size={18} />
                </span>
                <div>
                  <strong>Climate evidence</strong>
                  <span>Traceable inputs for the place and period you plan for.</span>
                </div>
              </article>
              <article>
                <span className={styles.signalIcon}>
                  <Icon name="maternal-health" size={23} />
                </span>
                <div>
                  <strong>Health outcomes</strong>
                  <span>
                    Turn changing exposure into planning-relevant health risk.
                  </span>
                </div>
              </article>
              <article>
                <span className={styles.signalIcon}>
                  <Icon name="users" size={18} />
                </span>
                <div>
                  <strong>Joint decisions</strong>
                  <span>
                    Bring health, water, agriculture and planning teams together.
                  </span>
                </div>
              </article>
            </div>
          </div>

          <footer className={styles.storyFooter}>
            <span>Designed for public-sector planning teams</span>
            <span>India · Kenya</span>
          </footer>
        </section>

        <section className={styles.access} aria-labelledby="sign-in-title">
          <div className={styles.accessInner}>
            <div className={styles.mobileBrand}>CHART</div>
            <span className={styles.secureLabel}>
              <span aria-hidden="true" />
              {needsSetup ? "Installation setup" : "Secure workspace"}
            </span>
            <h2 id="sign-in-title">
              {needsSetup ? "Set up this CHART instance" : "Welcome to CHART"}
            </h2>
            <p className={styles.accessCopy}>
              {needsSetup
                ? "Choose this installation’s geography and create its first administrator. This is completed once on a new CHART deployment."
                : "Continue with an account invited by your CHART administrator. Your role and planning area are already assigned before you sign in."}
            </p>

            <Button
              className={styles.signInButton}
              size="lg"
              block
              onClick={continueToAccess}
              disabled={isChecking}
              trailingIcon={<Icon name="arrow-right" size={15} />}
            >
              {isChecking
                ? "Checking this installation…"
                : needsSetup
                  ? "Set up CHART"
                  : "Continue to secure sign in"}
            </Button>

            <div className={styles.firstTime}>
              <span className={styles.firstTimeNumber}>01</span>
              <div>
                <strong>
                  {needsSetup ? "The first administrator" : "Need access?"}
                </strong>
                <p>
                  {needsSetup
                    ? "The person completing setup becomes the instance owner and can invite everyone else."
                    : "Ask your CHART administrator to invite you. Invited people sign in directly—there is no personal geography setup."}
                </p>
              </div>
            </div>

            <p className={styles.support}>
              {detectedMode === "unavailable"
                ? "Setup status could not be checked, but invited accounts can still sign in."
                : "Access is limited to invited organisational accounts."}{" "}
              Trouble signing in? Contact your CHART programme coordinator.
            </p>
          </div>
          <footer className={styles.accessFooter}>
            <span>Climate &amp; Health Adaptation and Resilience Tool</span>
          </footer>
        </section>
      </main>
    </>
  );
}
