import { landingNavLinks, landingResourceSections } from "../../content/landing";
import { PublicAuthAction } from "../auth/PublicAuthAction";
import type { ChartRoute } from "../routes/types";
import { Button } from "../ui/Button";
import { Navbar } from "../ui/Navbar";
import { DashboardLaptopPreview, ToolkitPreviewCard } from "./LandingPreviewCards";

type LandingNavigationProps = {
  onNavigate: (route: ChartRoute) => void;
};

const partnerLogos = [
  {
    name: "Scope Impact",
    src: "/landing/partner-logos/scope-impact.png",
    width: 762,
    height: 507,
    className: "scope-impact-logo",
  },
  {
    name: "Amref Health Africa",
    src: "/landing/partner-logos/amref-health-africa.png",
    width: 241,
    height: 147,
    className: "wide-logo",
  },
  {
    name: "PATH",
    src: "/landing/partner-logos/path.png",
    width: 135,
    height: 67,
    className: "wordmark-logo",
  },
  {
    name: "Amp Health",
    src: "/landing/partner-logos/amphealth.png",
    width: 321,
    height: 81,
    className: "extra-wide-logo",
  },
  {
    name: "Expert Analytics",
    src: "/landing/partner-logos/expert-analytics.png",
    width: 240,
    height: 106,
    className: "wide-logo",
  },
  {
    name: "GDI",
    src: "/landing/partner-logos/gdi.png",
    width: 108,
    height: 100,
    className: "square-logo",
  },
];

export function LandingNavigation({ onNavigate }: LandingNavigationProps) {
  return (
    <Navbar
      action={<PublicAuthAction />}
      ariaLabel="CHART public sections"
      links={landingNavLinks}
      onBrandClick={() => onNavigate("landing")}
    />
  );
}

export function LandingHero() {
  return (
    <section className="landing-hero">
      <div className="hero-copy-card">
        <h1>CHART</h1>
        <p className="hero-subtitle">Climate x Health Adaptation and Resilience Tool</p>
        <p>
          CHART guides <strong>local governments and health planners</strong> through
          data-driven and participatory steps to strengthen climate resilience in health
          systems.
        </p>
        <div className="hero-button-row">
          <Button href="#contact" variant="ghost">
            Contact us
          </Button>
          <Button href="mailto:hello@scopeimpact.fi?subject=CHART demo request">
            Request a demo
          </Button>
        </div>
      </div>

      <DashboardLaptopPreview />
    </section>
  );
}

export function ToolkitSection() {
  return (
    <section className="toolkit-section" id="toolkit">
      <div className="toolkit-section-head">
        <h2>Explore CHART toolkit</h2>
      </div>

      <div className="toolkit-list">
        {landingResourceSections.map((section) => (
          <article className="toolkit-row" id={section.id} key={section.id}>
            <ToolkitPreviewCard preview={section.preview} />
            <div className="toolkit-copy">
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <Button href={section.href}>{section.ctaLabel}</Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PartnerSection() {
  return (
    <section className="partner-section" id="contact">
      <div className="partner-cta">
        <h2>Start planning collaboratively</h2>
        <p>
          <strong>
            Are you a local government or organization interested in implementing CHART?
          </strong>
          Get in touch to explore how CHART can support your climate and health planning
          efforts.
        </p>
        <div className="hero-button-row">
          <Button href="mailto:hello@scopeimpact.fi" variant="ghost">
            Contact us
          </Button>
          <Button href="mailto:hello@scopeimpact.fi?subject=CHART demo request">
            Request a demo
          </Button>
        </div>
      </div>

      <PartnerLogoBlock />
      <LandingFooter />
    </section>
  );
}

export function PartnerLogoBlock() {
  return (
    <div className="partner-logo-block">
      <h3>Co-created by:</h3>
      <div className="partner-logo-grid">
        {partnerLogos.map((partner) => (
          <figure className={`partner-logo ${partner.className}`} key={partner.name}>
            <img
              src={partner.src}
              alt={partner.name}
              width={partner.width}
              height={partner.height}
              loading="lazy"
            />
          </figure>
        ))}
      </div>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span>CHART is an open-source climate and health planning tool.</span>
      <a href="https://github.com/CHART-Scope/CHART" rel="noreferrer" target="_blank">
        View on GitHub
      </a>
    </footer>
  );
}
