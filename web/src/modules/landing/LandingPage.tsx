import { useChartContent } from "../../app/ChartContentProvider";
import { PublicAuthAction } from "../auth/PublicAuthAction";
import type { ChartRoute } from "../routes/types";

type LandingPageProps = {
  onNavigate: (route: ChartRoute) => void;
};

type ToolkitPreview = "risk" | "vra" | "solutions";

const partnerLogos = [
  { name: "Scope Impact", label: "SCOPE", className: "scope" },
  { name: "PATH", label: "PATH", className: "path" },
  {
    name: "Clinton Health Access Initiative",
    label: "Clinton Health Access Initiative",
    className: "chai",
  },
  {
    name: "Partner government",
    label: "Partner government",
    className: "partner-government",
  },
];

export function LandingPage({ onNavigate }: LandingPageProps) {
  const {
    landingGovernmentQuestions,
    landingNavLinks,
    landingPriorityExamples,
    landingPriorityStatement,
    landingResourceSections,
    landingWorkflowSteps,
  } = useChartContent();

  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <button
          className="landing-brand"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          CHART
        </button>

        <nav className="landing-links" aria-label="CHART public sections">
          {landingNavLinks.map((item) => (
            <a className="landing-link" href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <PublicAuthAction />
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy-card">
            <h1>CHART</h1>
            <p className="hero-subtitle">
              Climate x Health Adaptation and Resilience Tool
            </p>
            <p>
              CHART helps <strong>district, county, and state officials</strong>{" "}
              understand climate-related health risks, identify where support is most
              needed, and choose practical actions for stronger health systems.
            </p>
            <div className="hero-button-row">
              <a className="button ghost-button" href="#contact">
                Contact us
              </a>
              <a className="button primary-button" href="/onboarding">
                Start setup
              </a>
            </div>
          </div>

          <DashboardLaptopPreview />
        </section>

        <section
          className="priority-decision-section"
          aria-labelledby="priority-decision-title"
        >
          <div className="priority-statement-card">
            <span className="section-kicker">When resources are limited</span>
            <h2 id="priority-decision-title">Decide what to prioritize first</h2>
            <blockquote>{landingPriorityStatement}</blockquote>
          </div>

          <div className="priority-comparison-card">
            <div className="priority-card-head">
              <span>Example planning view</span>
              <strong>Priority signal</strong>
            </div>
            <div className="priority-hazard-list">
              {landingPriorityExamples.map((item) => (
                <div
                  className={`priority-hazard-row ${
                    item.isPriority ? "is-priority" : ""
                  }`}
                  key={item.hazard}
                >
                  <div className="priority-hazard-copy">
                    <strong>{item.hazard}</strong>
                    <span>{item.signal}</span>
                  </div>
                  <div className="priority-score-bar" aria-hidden="true">
                    <span style={{ width: `${item.score}%` }} />
                  </div>
                  <div className="priority-impact-copy">
                    <span>{item.impact}</span>
                    {item.isPriority ? <b>Prioritize first</b> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="government-overview" id="overview">
          <div className="overview-copy">
            <span className="section-kicker">For government planning teams</span>
            <h2>What CHART answers first</h2>
            <p>
              CHART is designed for the first practical questions a government team
              asks: What climate hazards are relevant here? Who may be affected? Where
              are services more vulnerable? What actions can we plan and justify?
            </p>
          </div>

          <div className="government-question-grid">
            {landingGovernmentQuestions.map((item) => (
              <article className="government-question-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-head">
            <span className="section-kicker">One connected workflow</span>
            <h2>From risk to action</h2>
            <p>
              CHART does not treat climate risk, vulnerability, and solutions as
              separate products. It connects them so officials can move from evidence to
              a clear planning discussion.
            </p>
          </div>

          <div className="workflow-step-grid">
            {landingWorkflowSteps.map((item) => (
              <article className="workflow-step-card" key={item.step}>
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="toolkit-section" id="toolkit">
          <div className="toolkit-section-head">
            <h2>How CHART guides planning</h2>
            <p>
              The sections below are steps in the same workflow: understand risk, review
              vulnerability, then identify solutions that can support planning and
              budget conversations.
            </p>
          </div>

          <div className="toolkit-list">
            {landingResourceSections.map((section) => (
              <article className="toolkit-row" id={section.id} key={section.id}>
                <ToolkitPreviewCard preview={section.preview} />
                <div className="toolkit-copy">
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                  <a
                    className="button primary-button"
                    href={section.id === "solutions" ? "/solutions" : `#${section.id}`}
                  >
                    {section.ctaLabel}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="partner-section" id="contact">
          <div className="partner-cta">
            <h2>Sign in and start planning collaboratively</h2>
            <p>
              <strong>
                Are you a local government or organization interested in implementing
                CHART?
              </strong>
              Get in touch to explore how CHART can support your climate and health
              planning efforts.
            </p>
            <div className="hero-button-row">
              <a className="button ghost-button" href="mailto:hello@scopeimpact.fi">
                Contact us
              </a>
              <a className="button primary-button" href="/onboarding">
                Start setup
              </a>
            </div>
          </div>

          <div className="partner-logo-block">
            <h3>Co-created by:</h3>
            <div className="partner-logo-grid">
              {partnerLogos.map((partner) => (
                <div
                  className={`partner-logo ${partner.className}`}
                  key={partner.name}
                  aria-label={partner.name}
                >
                  <span>{partner.label}</span>
                </div>
              ))}
            </div>
          </div>

          <footer className="landing-footer">
            <span>CHART platform code is licensed under AGPL-3.0.</span>
            <a
              href="https://github.com/CHART-Scope/CHART"
              rel="noreferrer"
              target="_blank"
            >
              View on GitHub
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}

function DashboardLaptopPreview() {
  return (
    <div className="laptop-preview" aria-label="CHART dashboard preview">
      <div className="laptop-screen">
        <div className="preview-sidebar">
          <span>CHART</span>
          <small>My dashboard</small>
          <small>My plans</small>
          <small>CHART toolkit</small>
        </div>
        <div className="preview-dashboard">
          <div className="preview-topbar">
            <strong>My dashboard</strong>
            <span>Welcome, planning lead</span>
          </div>
          <div className="preview-metric-grid">
            <div>
              <small>Geography</small>
              <strong>Set scope</strong>
            </div>
            <div>
              <small>Risk layers</small>
              <strong>Connect data</strong>
            </div>
            <div>
              <small>Planning</small>
              <strong>Prioritize</strong>
            </div>
          </div>
          <div className="preview-chart">
            <span />
            <span />
            <span />
          </div>
        </div>
        <span className="preview-play-button" />
      </div>
      <div className="laptop-base" />
    </div>
  );
}

function ToolkitPreviewCard({ preview }: { preview: ToolkitPreview }) {
  if (preview === "risk") {
    return (
      <div className="toolkit-preview risk-preview" aria-hidden="true">
        <h4>Implications of extreme heat on infant mortality</h4>
        <div className="risk-chart">
          <span className="risk-band" />
          <span className="risk-line" />
          <span className="risk-axis x" />
          <span className="risk-axis y" />
        </div>
      </div>
    );
  }

  if (preview === "vra") {
    return (
      <div className="toolkit-preview vra-preview" aria-hidden="true">
        <h4>Health facility infrastructure vulnerability assessment</h4>
        <div className="vra-pill-row">
          <span>Lower risk</span>
          <span>Medium risk</span>
          <span>Higher risk</span>
        </div>
        <div className="vra-question">
          <strong>Does the facility retain services during shocks?</strong>
          <span>Yes</span>
          <span>Sometimes</span>
          <span>No</span>
        </div>
        <div className="vra-input" />
      </div>
    );
  }

  return (
    <div className="toolkit-preview solutions-preview" aria-hidden="true">
      {[
        "Gender-responsive heat action plans",
        "Heat-responsive building codes",
        "Urban greening",
        "Reflective roofs",
        "Early warning systems",
        "Heat health awareness",
      ].map((title) => (
        <div className="solution-tile" key={title}>
          <span />
          <strong>{title}</strong>
          <small>Policy initiative</small>
        </div>
      ))}
    </div>
  );
}
