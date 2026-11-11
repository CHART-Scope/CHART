"use client";

import { useEffect, useState } from "react";

import { ExplainerVideo } from "@/components/ExplainerVideo";
import { startKeycloakSignIn, takeSignedOutReason } from "@/lib/authClient";
import { getSetupStatus } from "@/lib/setupClient";
import { ContactDialog, type ContactReason } from "./ContactDialog";
import { ArrowIcon, LineIcon } from "./landingIcons";
import styles from "./Landing.module.css";

type SetupMode = "auto" | "configured" | "required";

const STEPS = [
  {
    icon: "target",
    title: "1. Understand the risk",
    text: "See who and where is most exposed, down to district level.",
  },
  {
    icon: "checklist",
    title: "2. Get recommended actions",
    text: "Evidence-based actions, matched to the departments that own them.",
  },
  {
    icon: "bars",
    title: "3. Coordinate, track, and report",
    text: "Assign costed actions across departments, then monitor progress and impact in one shared view.",
  },
] as const;

const COMING_SOON = [
  {
    icon: "shield",
    title: "Vulnerability & Resilience Assessments",
    text: "Hotspot ranking and facility readiness, built on hazard, exposure, sensitivity and adaptive capacity.",
  },
  {
    icon: "checklist",
    title: "Action repository",
    text: "A searchable library of evidence-based, costed actions with case studies from India and Kenya.",
  },
] as const;

/** Quotes from co-design partners. Empty until the partners approve wording;
 * the section shows its heading and call to action without them. */
const QUOTES: readonly { text: string; role: string; place: string }[] = [];

const COALITION = [
  {
    name: "Amref Health Africa",
    href: "https://amref.org/",
    src: "/partners/amref.png",
    width: 251,
    height: 152,
  },
  {
    name: "AMP Health",
    href: "https://amphealth.org/",
    src: "/partners/amp-health.png",
    width: 284,
    height: 67,
  },
  {
    name: "SCOPE Impact",
    href: "https://scopeimpact.fi/",
    src: "/partners/scope.png",
    width: 278,
    height: 152,
  },
  {
    name: "PATH",
    href: "https://www.path.org/",
    src: "/partners/path.png",
    width: 284,
    height: 113,
  },
  {
    name: "CEEW",
    href: "https://www.ceew.in/",
    src: "/partners/ceew.png",
    width: 279,
    height: 152,
  },
] as const;

const RESOURCES = [
  ["Documentation", "https://chart-scope.github.io/CHART/docs/"],
  ["Brand Kit", "https://chart-scope.github.io/CHART/"],
  ["GitHub", "https://github.com/CHART-Scope/CHART"],
  ["License", "https://github.com/CHART-Scope/CHART/blob/main/LICENSE"],
] as const;

export function Landing({
  onSignIn = startKeycloakSignIn,
  setupMode = "auto",
}: {
  onSignIn?: () => void;
  setupMode?: SetupMode;
}) {
  const [mode, setMode] = useState<
    "checking" | "configured" | "required" | "unavailable"
  >(setupMode === "auto" ? "checking" : setupMode);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactReason | null>(null);

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
    if (setupMode !== "auto") return;
    let cancelled = false;
    getSetupStatus()
      .then((status) => {
        if (!cancelled) setMode(status.requiresOnboarding ? "required" : "configured");
      })
      .catch(() => {
        if (!cancelled) setMode("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [setupMode]);

  const needsSetup = mode === "required";
  function logIn() {
    if (needsSetup) window.location.assign("/onboarding");
    else onSignIn();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Main navigation">
          <a className={styles.brand} href="/" aria-label="CHART home">
            CHART
          </a>
          <div className={styles.navLinks}>
            <a href="/explore">Climate x health risks</a>
            <a href="#toolkit">VRAs</a>
            <a href="#toolkit">Actions repository</a>
          </div>
          <div className={styles.navActions}>
            <button
              type="button"
              className={styles.outline}
              onClick={() => setContact("other")}
            >
              Contact us
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={logIn}
              disabled={mode === "checking"}
            >
              {mode === "checking"
                ? "Please wait…"
                : needsSetup
                  ? "Set up CHART"
                  : "Log in"}
            </button>
          </div>
        </nav>
      </header>

      <main className={styles.main}>
        {signedOutNotice ? (
          <p className={styles.notice} role="status">
            {signedOutNotice}
          </p>
        ) : null}

        <section className={styles.hero} aria-labelledby="chart-landing-title">
          <div className={styles.heroText}>
            <h1 id="chart-landing-title">CHART</h1>
            <p className={styles.subtitle}>
              Climate x Health Adaptation and Resilience Tool
            </p>
            <p className={styles.lede}>
              CHART is a multi-sectoral platform where governments make proactive
              decisions and plans for climate x health action.
            </p>
            <div className={styles.ctaRow}>
              <a className={`${styles.primary} ${styles.large}`} href="#toolkit">
                Explore the toolkit <ArrowIcon size={14} />
              </a>
              <button
                type="button"
                className={`${styles.outline} ${styles.large}`}
                onClick={() => setContact("demo")}
              >
                Request a demo
              </button>
            </div>
          </div>
          <div className={styles.laptop}>
            <div className={styles.screen}>
              <ExplainerVideo className={styles.video} />
            </div>
            <div className={styles.base} aria-hidden="true" />
          </div>
        </section>

        <section className={styles.section} aria-labelledby="together-title">
          <div className={styles.inner}>
            <h2 id="together-title">Plan for climate-health risk, together</h2>
            <p className={styles.wide}>
              No single dataset, and no single sector, can capture climate-health risk
              in full. CHART brings together climate and health data with local
              vulnerability data and community knowledge to build a fuller picture — not
              only what&rsquo;s forecast, but who is exposed, why, and how — then turns
              it into a costed, multi-department action plan, so health, water, urban
              planning, and other sectors can respond to the same threat with one shared
              picture, instead of working from separate ones.
            </p>
            <p className={styles.eyebrow}>How CHART works</p>
            <ol className={styles.steps}>
              {STEPS.map((step) => (
                <li key={step.title}>
                  <span className={styles.tile}>
                    <LineIcon name={step.icon} />
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="toolkit"
          className={styles.section}
          aria-labelledby="toolkit-title"
        >
          <div className={styles.inner}>
            <h2 id="toolkit-title">Explore CHART toolkit</h2>
            <p className={styles.intro}>
              Explore CHART publicly available core components.
            </p>
            <div className={styles.cards}>
              <article className={`${styles.card} ${styles.cardLive}`}>
                <span className={styles.tile}>
                  <LineIcon name="map" />
                </span>
                <h3>Climate x Health risk modeling and predictions</h3>
                <p>
                  Heat-attributable low birth weight and under-five mortality, mapped to
                  district level — observed and projected.
                </p>
                <a className={styles.textLink} href="/explore">
                  Explore <ArrowIcon size={13} />
                </a>
              </article>
              {COMING_SOON.map((tool) => (
                <article key={tool.title} className={styles.card}>
                  <span className={styles.soon}>Coming soon</span>
                  <span className={`${styles.tile} ${styles.tileMuted}`}>
                    <LineIcon name={tool.icon} />
                  </span>
                  <h3>{tool.title}</h3>
                  <p>{tool.text}</p>
                  <button
                    type="button"
                    className={styles.textLink}
                    onClick={() => setContact("notify")}
                    aria-label={`Notify me about ${tool.title}`}
                  >
                    Notify me <ArrowIcon size={13} />
                  </button>
                </article>
              ))}
            </div>
            <div className={styles.strip}>
              <p>
                Interested in seeing how it all comes together for climate-health
                anticipatory planning and action?
              </p>
              <button
                type="button"
                className={`${styles.outline} ${styles.large}`}
                onClick={() => setContact("demo")}
              >
                Request a demo
              </button>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="codesign-title">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>Co-designed with government</p>
            <h2 id="codesign-title">CHART co-design government partners</h2>
            <p className={styles.wide}>
              CHART is co-created with state-level governments in India and county-level
              governments in Kenya — with 200+ officials, health workers and community
              members involved.
            </p>
            {QUOTES.length > 0 ? (
              <div className={styles.quotes}>
                {QUOTES.map((quote) => (
                  <figure key={quote.role}>
                    <blockquote>&ldquo;{quote.text}&rdquo;</blockquote>
                    <figcaption>
                      <strong>{quote.role}</strong>
                      <span>{quote.place}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            <div className={styles.strip}>
              <p>
                Interested in becoming a co-creator partner for CHART and becoming a
                front runner in climate x health action?
              </p>
              <button
                type="button"
                className={`${styles.outline} ${styles.large}`}
                onClick={() => setContact("partner")}
              >
                Contact us
              </button>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="coalition-title">
          <div className={styles.inner}>
            <p className={styles.eyebrow}>CHART coalition</p>
            <h2 id="coalition-title">A Digital Public Good, stewarded together</h2>
            <p className={styles.intro}>
              CHART is a Digital Public Good stewarded by a coalition across regions and
              sectors:
            </p>
            <ul className={styles.logos} aria-label="Partners">
              {COALITION.map((partner) => (
                <li key={partner.name}>
                  <a
                    href={partner.href}
                    aria-label={partner.name}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={partner.src}
                      alt={partner.name}
                      width={partner.width}
                      height={partner.height}
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <a className={styles.brand} href="/" aria-label="CHART home">
              CHART
            </a>
            <p>Climate &amp; Health Adaptation and Resilience Tool</p>
          </div>
          <nav className={styles.resources} aria-label="Resources">
            <h2>Resources</h2>
            {RESOURCES.map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noreferrer">
                {name} <span aria-hidden="true">↗</span>
              </a>
            ))}
          </nav>
        </div>
        <div className={styles.footerBottom}>© 2026 CHART coalition</div>
      </footer>

      <ContactDialog reason={contact} onClose={() => setContact(null)} />
    </div>
  );
}
