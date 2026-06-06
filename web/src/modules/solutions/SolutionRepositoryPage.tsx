"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  listPublicSolutions,
  listSolutionTaxonomies,
  type SolutionRepositoryItem,
  type SolutionRepositoryTaxonomy,
} from "../../lib/solutionRepositoryClient";
import { PublicAuthAction } from "../auth/PublicAuthAction";
import type { ChartRoute } from "../routes/types";

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
          <section className="solution-repository-grid public-repository-grid">
            {filteredItems.map((item) => (
              <PublicSolutionCard
                item={item}
                key={item.id}
                onOpenDetail={setDetailItem}
              />
            ))}
          </section>
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
        <PublicSolutionDrawer item={detailItem} onClose={() => setDetailItem(null)} />
      ) : null}
    </div>
  );
}

function PublicSolutionCard({
  item,
  onOpenDetail,
}: {
  item: SolutionRepositoryItem;
  onOpenDetail: (item: SolutionRepositoryItem) => void;
}) {
  const hazards = taxonomyLabels(item, "hazard").slice(0, 2).join(" · ");
  const image = item.assets.find((asset) => asset.kind === "image")?.storageUrl;

  return (
    <article className="solution-repository-card">
      <button
        className="solution-repository-card-main"
        type="button"
        onClick={() => onOpenDetail(item)}
      >
        <span className="solution-repository-image" style={imageStyle(image)} />
        <div className="solution-repository-card-body">
          <small>{hazards || "Climate-health action"}</small>
          <strong>{item.name}</strong>
          <p>
            {item.summary ?? item.description ?? "Action details are being prepared."}
          </p>
          <span className="solution-meta-line">{solutionMetaLine(item)}</span>
          <TagList labels={taxonomyLabels(item, "hazard").slice(0, 3)} />
        </div>
      </button>
    </article>
  );
}

function PublicSolutionDrawer({
  item,
  onClose,
}: {
  item: SolutionRepositoryItem;
  onClose: () => void;
}) {
  const image = item.assets.find((asset) => asset.kind === "image")?.storageUrl;
  const caseStudies = item.assets.filter((asset) => asset.kind === "case_study");

  return (
    <div className="solution-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        aria-label={`${item.name} details`}
        className="solution-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="solution-drawer-hero" style={imageStyle(image)} />
        <div className="solution-drawer-body">
          <div className="solution-drawer-head">
            <div>
              <h2>{item.name}</h2>
            </div>
            <button className="ghost-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <p>{item.summary ?? item.description}</p>

          <div className="drawer-fact-row">
            <span>Type and cost</span>
            <strong>{solutionMetaLine(item)}</strong>
          </div>

          <section className="drawer-section">
            <span className="panel-eyebrow">Hazards</span>
            <TagList labels={taxonomyLabels(item, "hazard")} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Action types</span>
            <TagList labels={taxonomyLabels(item, "solution_type")} />
          </section>

          <LinkSection links={item.links} />
          <AssetSection assets={caseStudies} />

          <section className="drawer-section">
            <span className="panel-eyebrow">Description</span>
            {(item.description ?? "No description provided.")
              .split("\n\n")
              .map((paragraph, index) => (
                <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
              ))}
          </section>
        </div>
      </aside>
    </div>
  );
}

function LinkSection({ links }: { links: SolutionRepositoryItem["links"] }) {
  if (links.length === 0) {
    return null;
  }

  return (
    <section className="drawer-section">
      <span className="panel-eyebrow">Useful links</span>
      <div className="asset-list compact">
        {links.map((link) => (
          <a
            className="asset-link"
            href={link.url}
            key={link.url}
            rel="noreferrer"
            target="_blank"
          >
            <span>{link.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function AssetSection({ assets }: { assets: SolutionRepositoryItem["assets"] }) {
  if (assets.length === 0) {
    return null;
  }

  return (
    <section className="drawer-section">
      <span className="panel-eyebrow">Case studies</span>
      <div className="asset-list compact">
        {assets.map((asset) => (
          <a
            className="asset-link"
            href={asset.storageUrl ?? "#"}
            key={asset.id}
            rel="noreferrer"
            target="_blank"
          >
            <span>{asset.filename}</span>
            <small>{asset.mimeType ?? "Resource"}</small>
          </a>
        ))}
      </div>
    </section>
  );
}

function TagList({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return <span className="solution-tag muted">Not classified yet</span>;
  }

  return (
    <div className="hazard-tags">
      {labels.map((label) => (
        <span className="solution-tag" key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}

function hasTaxonomy(item: SolutionRepositoryItem, taxonomyId: TaxonomyFilter) {
  return (
    taxonomyId === "all" ||
    item.taxonomies.some((taxonomy) => taxonomy.id === taxonomyId)
  );
}

function taxonomyLabels(item: SolutionRepositoryItem, type: string) {
  return item.taxonomies
    .filter((taxonomy) => taxonomy.type === type)
    .map((taxonomy) => taxonomy.label);
}

function solutionMetaLine(item: SolutionRepositoryItem) {
  const types = taxonomyLabels(item, "solution_type").slice(0, 2).join(", ");
  const cost = formatCost(item.costOfImplementation);

  return [types, cost].filter(Boolean).join(" · ") || "Action details";
}

function formatCost(cost: string | null) {
  if (!cost) {
    return "";
  }

  if (cost === "low") {
    return "Low cost";
  }

  if (cost === "medium") {
    return "Medium cost";
  }

  if (cost === "high") {
    return "High cost";
  }

  return cost.replace(/[_-]+/g, " ");
}

function imageStyle(imageUrl: string | null | undefined): CSSProperties {
  if (!imageUrl) {
    return {
      background:
        "linear-gradient(135deg, rgba(46, 148, 73, 0.16), rgba(14, 165, 165, 0.18))",
    };
  }

  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}
