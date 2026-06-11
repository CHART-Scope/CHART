import type { ChartRoute } from "../routes/types";
import {
  LandingHero,
  LandingNavigation,
  PartnerSection,
  ToolkitSection,
} from "./LandingSections";
import "./LandingPage.css";

type LandingPageProps = {
  onNavigate: (route: ChartRoute) => void;
};

export function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="landing-shell">
      <LandingNavigation onNavigate={onNavigate} />

      <main>
        <LandingHero />
        <ToolkitSection />
        <PartnerSection />
      </main>
    </div>
  );
}
