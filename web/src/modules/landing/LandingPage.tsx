import { useChartContent } from "../../app/ChartContentProvider";

export type ChartRoute = "landing" | "dashboard" | "cms";

type LandingPageProps = {
  onNavigate: (route: ChartRoute) => void;
};

export function LandingPage({ onNavigate }: LandingPageProps) {
  const {
    datasetSources,
    landingNavLinks,
    landingResourceSections,
    landingSummarySteps,
    licenseLayers,
  } = useChartContent();

  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <button
          className="landing-brand"
          type="button"
          onClick={() => onNavigate("landing")}
        >
          <span className="landing-brand-mark">CH</span>
          <span>CHART</span>
        </button>

        <nav className="landing-links">
          {landingNavLinks.map((item) => (
            <a className="landing-link" href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-actions">
          <button
            className="button ghost-button"
            type="button"
            onClick={() => onNavigate("cms")}
          >
            Open CMS
          </button>
          <button
            className="button primary-button"
            type="button"
            onClick={() => onNavigate("dashboard")}
          >
            Open workspace
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy-card">
            <span className="section-kicker">Climate and health adaptation</span>
            <h1>
              Public resources first. <em>Shared planning</em> behind login.
            </h1>
            <p>
              CHART is a public toolkit for climate-health methods, vulnerability
              resources and solution references. Government teams move into a private
              workspace only when they need collaborative planning, priority mapping and
              a funding-ready action case.
            </p>
            <div className="hero-button-row">
              <a className="button primary-button" href="#models">
                Browse public resources
              </a>
              <button
                className="button green-button"
                type="button"
                onClick={() => onNavigate("dashboard")}
              >
                Go to planning workspace
              </button>
            </div>
            <div className="hero-stat-row">
              <div>
                <b>3</b>
                <span>Public libraries</span>
              </div>
              <div>
                <b>1</b>
                <span>Shared workspace</span>
              </div>
              <div>
                <b>4</b>
                <span>License layers</span>
              </div>
            </div>
          </div>

          <div className="hero-visual-card">
            <div className="hero-window">
              <div className="hero-window-bar">
                <span />
                <span />
                <span />
              </div>
              <div className="hero-window-grid">
                <div className="hero-metric">
                  <label>Priority zones</label>
                  <strong>12</strong>
                </div>
                <div className="hero-metric">
                  <label>Heat-exposed population</label>
                  <strong>76K</strong>
                </div>
                <div className="hero-chart-card">
                  <h3>Composite risk</h3>
                  <div className="hero-chart-bars">
                    <span style={{ height: "48%" }} />
                    <span style={{ height: "68%" }} />
                    <span style={{ height: "84%" }} />
                    <span style={{ height: "58%" }} />
                    <span style={{ height: "32%" }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-info-card">
              <span className="small-kicker">Priority district</span>
              <strong>Gwalior South</strong>
              <div className="mini-metrics">
                <span>Heat 91</span>
                <span>Water 83</span>
              </div>
            </div>
            <div className="floating-info-card left">
              <span className="small-kicker">Action candidate</span>
              <strong>HeatCare Kit</strong>
              <div className="mini-progress">
                <span />
              </div>
            </div>
          </div>
        </section>

        <section className="access-band">
          <article className="access-card public">
            <span className="section-kicker">Public layer</span>
            <h2>Read, download and adapt resources freely</h2>
            <p>
              The public site is for models, VRA resources, solution references and
              licensing guidance. No login needed.
            </p>
          </article>
          <article className="access-card private">
            <span className="section-kicker">Private workspace</span>
            <h2>Invite U1 and U2 into the same planning context</h2>
            <p>
              The authenticated workspace adds geography-scoped dashboards,
              collaborative planning and a funding justification layer.
            </p>
          </article>
        </section>

        <section className="summary-grid">
          {landingSummarySteps.map((step) => (
            <article className="summary-card" key={step.number}>
              <span className="summary-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </section>

        {landingResourceSections.map((section) => (
          <section className="resource-section" id={section.id} key={section.id}>
            <div className="resource-section-head">
              <div>
                <span className="section-kicker">{section.eyebrow}</span>
                <h2>{section.title}</h2>
                <p>{section.description}</p>
              </div>
            </div>
            <div className="resource-card-grid">
              {section.items.map((item) => (
                <article className="resource-card" key={item.title}>
                  <span className="resource-tag">{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="resource-meta">{item.meta}</div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="license-section" id="license">
          <div className="resource-section-head">
            <div>
              <span className="section-kicker">License and data</span>
              <h2>Four layers with different reuse rules</h2>
              <p>
                Most of CHART is open. External data is not CHART’s to relicense, so the
                platform keeps the code, schemas, docs and provider data visibly
                separate.
              </p>
            </div>
          </div>

          <div className="license-layer-grid">
            {licenseLayers.map((layer) => (
              <article className={`license-card ${layer.accentClass}`} key={layer.name}>
                <h3>{layer.name}</h3>
                <strong>{layer.license}</strong>
                <p>{layer.description}</p>
              </article>
            ))}
          </div>

          <div className="dataset-table">
            <div className="dataset-table-head">
              <span>Dataset</span>
              <span>Use</span>
              <span>Redistribution</span>
              <span>Source</span>
            </div>
            {datasetSources.map((source) => (
              <div className="dataset-table-row" key={source.name}>
                <strong>{source.name}</strong>
                <span>{source.use}</span>
                <span>{source.redistribution}</span>
                <a href="#license">{source.linkLabel}</a>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <div>
            <span className="section-kicker">Two paths, one product</span>
            <h2>Stay on the public site or move into the workspace</h2>
            <p>
              The public toolkit remains useful on its own. When teams are ready to plan
              together, the workspace adds scoped dashboards, action flows and content
              operations.
            </p>
          </div>
          <div className="hero-button-row">
            <button
              className="button primary-button"
              type="button"
              onClick={() => onNavigate("dashboard")}
            >
              Open dashboard
            </button>
            <button
              className="button ghost-button"
              type="button"
              onClick={() => onNavigate("cms")}
            >
              Open CMS
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
