"use client";

import { useEffect, useMemo, useState } from "react";

import {
  listPublicSolutions,
  listSolutionTaxonomies,
  type SolutionRepositoryItem,
  type SolutionRepositoryTaxonomy,
} from "../../lib/solutionRepositoryClient";
import { PublicAuthAction } from "../auth/PublicAuthAction";
import type { ChartRoute } from "../routes/types";
import {
  SolutionRepositoryDetailDrawer,
  SolutionRepositoryGrid,
} from "./SolutionRepositoryComponents";

type SolutionRepositoryPageProps = {
  onNavigate: (route: ChartRoute) => void;
};

type TaxonomyFilter = "all" | string;

export function SolutionRepositoryPage({ onNavigate }: SolutionRepositoryPageProps) {
  const [items, setItems] = useState<SolutionRepositoryItem[]>([]);
  const [taxonomies, setTaxonomies] = useState<SolutionRepositoryTaxonomy[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<TaxonomyFilter>("all");
  const [selectedType, setSelectedType] = useState<TaxonomyFilter>("all");
  const [detailItem, setDetailItem] = useState<SolutionRepositoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hazardOptions = useMemo(
    () => taxonomies.filter((taxonomy) => taxonomy.type === "hazard"),
    [taxonomies],
  );
  const solutionTypeOptions = useMemo(
    () => taxonomies.filter((taxonomy) => taxonomy.type === "solution_type"),
    [taxonomies],
  );
  const filteredItems = items.filter((item) => {
    return hasTaxonomy(item, selectedHazard) && hasTaxonomy(item, selectedType);
  });

  useEffect(() => {
    async function loadRepository() {
      try {
        const [solutionResponse, taxonomyResponse] = await Promise.all([
          listPublicSolutions({ limit: "100" }),
          listSolutionTaxonomies(),
        ]);

        setItems(solutionResponse.items);
        setTaxonomies(taxonomyResponse);
      } catch {
        setError("The public action repository could not be loaded.");
      }
    }

    void loadRepository();
  }, []);

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
          <a className="landing-link" href="/">
            What CHART does
          </a>
          <a className="landing-link" href="/onboarding">
            Setup
          </a>
          <a className="landing-link" href="/solutions">
            Action repository
          </a>
        </nav>
        <PublicAuthAction />
      </header>

      <main className="public-repository-main">
        <section className="public-repository-hero">
          <span className="section-kicker">Public action repository</span>
          <h1>Climate-health adaptation actions</h1>
          <p>
            Browse practical actions that can support climate and health planning. These
            records are public so teams can explore options before signing in.
          </p>
        </section>

        <section className="repository-filter-panel">
          <label>
            Hazard
            <select
              value={selectedHazard}
              onChange={(event) => setSelectedHazard(event.target.value)}
            >
              <option value="all">All hazards</option>
              {hazardOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Action type
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
            >
              <option value="all">All action types</option>
              {solutionTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span>
            {filteredItems.length} of {items.length} public actions
          </span>
        </section>

        {error ? (
          <section className="empty-panel">
            <h2>Repository unavailable</h2>
            <p>{error}</p>
          </section>
        ) : filteredItems.length > 0 ? (
          <SolutionRepositoryGrid items={filteredItems} onOpenDetail={setDetailItem} />
        ) : (
          <section className="empty-panel">
            <h2>
              {items.length === 0
                ? "No public actions have been prepared yet"
                : "No public actions match this filter"}
            </h2>
            <p>
              {items.length === 0
                ? "Complete CHART onboarding to prepare the initial action repository."
                : "Try another hazard or action type."}
            </p>
          </section>
        )}
      </main>

      {detailItem ? (
        <SolutionRepositoryDetailDrawer
          item={detailItem}
          onClose={() => setDetailItem(null)}
        />
      ) : null}
    </div>
  );
}

function hasTaxonomy(item: SolutionRepositoryItem, taxonomyId: TaxonomyFilter) {
  return (
    taxonomyId === "all" ||
    item.taxonomies.some((taxonomy) => taxonomy.id === taxonomyId)
  );
}
