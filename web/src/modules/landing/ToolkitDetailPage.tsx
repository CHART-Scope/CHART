import {
  getLandingResourceSection,
  type LandingResourceId,
} from "../../content/landing";
import type { ChartRoute } from "../routes/types";
import { Button } from "../ui/Button";
import { DataCard } from "../ui/DataCard";
import { ToolkitPreviewCard } from "./LandingPreviewCards";
import { LandingFooter, LandingNavigation } from "./LandingSections";
import "./LandingPage.css";

type ToolkitDetailPageProps = {
  resourceId: LandingResourceId;
  onNavigate: (route: ChartRoute) => void;
};

export function ToolkitDetailPage({ resourceId, onNavigate }: ToolkitDetailPageProps) {
  const resource = getLandingResourceSection(resourceId);
  const showSupportSection = resource.id === "solutions";

  return (
    <div className="landing-shell">
      <LandingNavigation onNavigate={onNavigate} />

      <main className="toolkit-detail-main">
        <section className="toolkit-detail-hero">
          <div className="toolkit-detail-copy">
            <span className="section-kicker">{resource.detail.eyebrow}</span>
            <h1>{resource.title}</h1>
            <p>{resource.detail.lead}</p>
            <div className="toolkit-detail-actions">
              <Button href={resource.detail.nextHref}>
                {resource.detail.nextLabel}
              </Button>
              <Button href="/" variant="ghost">
                Back to landing
              </Button>
            </div>
          </div>

          <ToolkitPreviewCard preview={resource.preview} compact />
        </section>

        {showSupportSection ? (
          <section
            className="toolkit-detail-section"
            aria-labelledby={`${resource.id}-detail-title`}
          >
            <ToolkitDetailSectionHeader
              className="toolkit-detail-section-head"
              description="These component-level cards explain what the page is responsible for before the user moves to the next step in the public flow."
              id={`${resource.id}-detail-title`}
              kicker="What this page supports"
              title={resource.detail.eyebrow}
            />

            <div className="toolkit-detail-grid">
              {resource.detail.highlights.map((item) => (
                <DataCard
                  className="landing-data-card toolkit-detail-card"
                  key={item.title}
                  title={item.title}
                  titleLevel={3}
                >
                  <p>{item.description}</p>
                </DataCard>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <LandingFooter />
    </div>
  );
}

function ToolkitDetailSectionHeader({
  className,
  description,
  id,
  kicker,
  title,
}: {
  className?: string;
  description: string;
  id: string;
  kicker: string;
  title: string;
}) {
  return (
    <div className={className}>
      <span className="section-kicker">{kicker}</span>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
