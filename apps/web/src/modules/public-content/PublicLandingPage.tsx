import {
  governmentWorkspaceCapabilities,
  resourceSections
} from "./public-resources";

export function PublicLandingPage() {
  return (
    <div className="landing-shell">
      <header className="site-header">
        <a className="site-brand" href="#top" aria-label="CHART home">
          CHART
        </a>

        <nav className="site-nav" aria-label="Primary">
          <a href="#resources">Resources</a>
          <a href="#how-it-works">Flow</a>
          <a href="#government-access">Sign in</a>
        </nav>

        <div className="site-actions">
          <a className="button button-secondary" href="#resources">
            Resources
          </a>
          <a className="button button-primary" href="#government-access">
            Sign in
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow">Climate x health adaptation</span>
            <h1>Public resources first. Shared planning behind login.</h1>
            <p className="hero-text">
              Explore CHART without login. Sign in later for shared planning and
              funding justification.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#resources">
                Browse resources
              </a>
              <a className="button button-secondary" href="#government-access">
                What needs login
              </a>
            </div>
          </div>

          <div className="hero-panel">
            <div className="path-card public-path">
              <div className="path-header">
                <span className="path-badge">No login required</span>
                <h2>Public layer</h2>
              </div>
              <p>Open sections for models, VRA, and solutions.</p>
              <ul className="path-list">
                <li>What CHART is</li>
                <li>Evidence inputs</li>
                <li>Action library</li>
              </ul>
            </div>

            <div className="path-card secure-path">
              <div className="path-header">
                <span className="path-badge path-badge-secure">Login required</span>
                <h2>Government workspace</h2>
              </div>
              <p>Planning tools for shared government work.</p>
              <ul className="path-list">
                {governmentWorkspaceCapabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="summary-strip" id="how-it-works">
          <article>
            <span className="summary-number">01</span>
            <h3>See risk</h3>
            <p>Review the same evidence.</p>
          </article>
          <article>
            <span className="summary-number">02</span>
            <h3>Pick priorities</h3>
            <p>Focus on the right areas.</p>
          </article>
          <article>
            <span className="summary-number">03</span>
            <h3>Make a plan</h3>
            <p>Turn evidence into action.</p>
          </article>
        </section>

        <section className="resources-section" id="resources">
          <div className="section-heading">
            <span className="eyebrow">Public resources</span>
            <h2>Accessible without login</h2>
            <p>Open sections for visitors and partners.</p>
          </div>

          <div className="resource-nav">
            {resourceSections.map((section) => (
              <a key={section.id} className="resource-nav-card" href={`#${section.id}`}>
                <span>{section.eyebrow}</span>
                <strong>{section.title}</strong>
              </a>
            ))}
          </div>

          <div className="resource-sections">
            {resourceSections.map((section) => (
              <article className="resource-section-card" id={section.id} key={section.id}>
                <div className="resource-section-header">
                  <div>
                    <span className="eyebrow">{section.eyebrow}</span>
                    <h3>{section.title}</h3>
                  </div>
                  <span className="access-pill">Public access</span>
                </div>
                <p className="resource-description">{section.description}</p>

                <div className="resource-grid">
                  {section.items.map((item) => (
                    <div className="resource-item-card" key={item.title}>
                      <span className="resource-tag">{item.tag}</span>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="access-section" id="government-access">
          <div className="section-heading">
            <span className="eyebrow">Authenticated area</span>
            <h2>What lives behind login</h2>
            <p>Public resources stay open. Planning stays scoped.</p>
          </div>

          <div className="access-grid">
            <div className="access-card">
              <h3>Public area</h3>
              <ul className="path-list">
                <li>Explain CHART</li>
                <li>Open resources</li>
                <li>Partner entry point</li>
              </ul>
            </div>

            <div className="access-card access-card-highlight">
              <h3>Logged-in area</h3>
              <ul className="path-list">
                <li>Scoped workspace</li>
                <li>Priority review</li>
                <li>Plan and budget case</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
