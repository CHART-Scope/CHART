"use client";

import type { CSSProperties } from "react";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";

type SolutionRepositoryItemCardProps = {
  item: SolutionRepositoryItem;
  onOpenDetail: (item: SolutionRepositoryItem) => void;
};

type SolutionRepositoryGridProps = {
  items: SolutionRepositoryItem[];
  onOpenDetail: (item: SolutionRepositoryItem) => void;
};

type SolutionRepositoryDetailDrawerProps = {
  item: SolutionRepositoryItem;
  onClose: () => void;
};

export type HealthOutcomeRepositoryItem = {
  id: string;
  name: string;
  summary: string;
  description: string;
  affectedGroups: string[];
  indicators: { label: string; value: string }[];
  relatedHazards: string[];
  solutions: SolutionRepositoryItem[];
  imageUrl?: string | null;
};

export type HazardRepositoryItem = {
  id: string;
  name: string;
  summary: string;
  description: string;
  severity: string;
  trend: string;
  regionsAtRisk: string[];
  priorityGroups: string[];
  healthOutcomes: HealthOutcomeRepositoryItem[];
  solutions: SolutionRepositoryItem[];
  imageUrl?: string | null;
};

type HealthOutcomeRepositoryCardProps = {
  item: HealthOutcomeRepositoryItem;
  onOpenDetail: (item: HealthOutcomeRepositoryItem) => void;
};

type HealthOutcomeRepositoryGridProps = {
  items: HealthOutcomeRepositoryItem[];
  onOpenDetail: (item: HealthOutcomeRepositoryItem) => void;
};

type HealthOutcomeRepositoryDrawerProps = {
  item: HealthOutcomeRepositoryItem;
  onClose: () => void;
};

type HazardRepositoryCardProps = {
  item: HazardRepositoryItem;
  onOpenDetail: (item: HazardRepositoryItem) => void;
};

type HazardRepositoryGridProps = {
  items: HazardRepositoryItem[];
  onOpenDetail: (item: HazardRepositoryItem) => void;
};

type HazardRepositoryDrawerProps = {
  item: HazardRepositoryItem;
  onClose: () => void;
};

export function SolutionRepositoryItemCard({
  item,
  onOpenDetail,
}: SolutionRepositoryItemCardProps) {
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
          <SolutionRepositoryTagList
            labels={taxonomyLabels(item, "hazard").slice(0, 3)}
          />
        </div>
      </button>
    </article>
  );
}

export function SolutionRepositoryGrid({
  items,
  onOpenDetail,
}: SolutionRepositoryGridProps) {
  return (
    <section className="solution-repository-grid public-repository-grid">
      {items.map((item) => (
        <SolutionRepositoryItemCard
          item={item}
          key={item.id}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </section>
  );
}

export function SolutionRepositoryDetailDrawer({
  item,
  onClose,
}: SolutionRepositoryDetailDrawerProps) {
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
            <SolutionRepositoryTagList labels={taxonomyLabels(item, "hazard")} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Action types</span>
            <SolutionRepositoryTagList labels={taxonomyLabels(item, "solution_type")} />
          </section>

          <SolutionLinkSection links={item.links} />
          <SolutionAssetSection assets={caseStudies} />

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

export function SolutionCard(props: SolutionRepositoryItemCardProps) {
  return <SolutionRepositoryItemCard {...props} />;
}

export function SolutionGrid(props: SolutionRepositoryGridProps) {
  return <SolutionRepositoryGrid {...props} />;
}

export function SolutionDrawer(props: SolutionRepositoryDetailDrawerProps) {
  return <SolutionRepositoryDetailDrawer {...props} />;
}

export function HealthOutcomeRepositoryCard({
  item,
  onOpenDetail,
}: HealthOutcomeRepositoryCardProps) {
  return (
    <article className="solution-repository-card">
      <button
        className="solution-repository-card-main"
        type="button"
        onClick={() => onOpenDetail(item)}
      >
        <span className="solution-repository-image" style={imageStyle(item.imageUrl)} />
        <div className="solution-repository-card-body">
          <small>{item.relatedHazards.slice(0, 2).join(" · ")}</small>
          <strong>{item.name}</strong>
          <p>{item.summary}</p>
          <span className="solution-meta-line">
            {item.solutions.length} linked solutions
          </span>
          <SolutionRepositoryTagList labels={item.affectedGroups.slice(0, 3)} />
        </div>
      </button>
    </article>
  );
}

export function HealthOutcomeRepositoryGrid({
  items,
  onOpenDetail,
}: HealthOutcomeRepositoryGridProps) {
  return (
    <section className="solution-repository-grid public-repository-grid">
      {items.map((item) => (
        <HealthOutcomeRepositoryCard
          item={item}
          key={item.id}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </section>
  );
}

export function HealthOutcomeRepositoryDrawer({
  item,
  onClose,
}: HealthOutcomeRepositoryDrawerProps) {
  return (
    <div className="solution-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        aria-label={`${item.name} details`}
        className="solution-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="solution-drawer-hero" style={imageStyle(item.imageUrl)} />
        <div className="solution-drawer-body">
          <div className="solution-drawer-head">
            <div>
              <h2>{item.name}</h2>
            </div>
            <button className="ghost-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <p>{item.description}</p>

          <section className="drawer-section">
            <span className="panel-eyebrow">Related hazards</span>
            <SolutionRepositoryTagList labels={item.relatedHazards} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Affected groups</span>
            <SolutionRepositoryTagList labels={item.affectedGroups} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Planning indicators</span>
            <div className="asset-list compact">
              {item.indicators.map((indicator) => (
                <span className="asset-link" key={indicator.label}>
                  <span>{indicator.label}</span>
                  <small>{indicator.value}</small>
                </span>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Linked solutions</span>
            <div className="asset-list compact">
              {item.solutions.map((solution) => (
                <span className="asset-link" key={solution.id}>
                  <span>{solution.name}</span>
                  <small>{solutionMetaLine(solution)}</small>
                </span>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function HealthOutcomeCard(props: HealthOutcomeRepositoryCardProps) {
  return <HealthOutcomeRepositoryCard {...props} />;
}

export function HealthOutcomeGrid(props: HealthOutcomeRepositoryGridProps) {
  return <HealthOutcomeRepositoryGrid {...props} />;
}

export function HealthOutcomeDrawer(props: HealthOutcomeRepositoryDrawerProps) {
  return <HealthOutcomeRepositoryDrawer {...props} />;
}

export function HazardRepositoryCard({
  item,
  onOpenDetail,
}: HazardRepositoryCardProps) {
  return (
    <article className="solution-repository-card">
      <button
        className="solution-repository-card-main"
        type="button"
        onClick={() => onOpenDetail(item)}
      >
        <span className="solution-repository-image" style={imageStyle(item.imageUrl)} />
        <div className="solution-repository-card-body">
          <small>{item.regionsAtRisk.slice(0, 2).join(" · ")}</small>
          <strong>{item.name}</strong>
          <p>{item.summary}</p>
          <span className="solution-meta-line">
            {item.severity} risk · {item.trend}
          </span>
          <SolutionRepositoryTagList
            labels={item.healthOutcomes.map((outcome) => outcome.name).slice(0, 3)}
          />
        </div>
      </button>
    </article>
  );
}

export function HazardRepositoryGrid({
  items,
  onOpenDetail,
}: HazardRepositoryGridProps) {
  return (
    <section className="solution-repository-grid public-repository-grid">
      {items.map((item) => (
        <HazardRepositoryCard item={item} key={item.id} onOpenDetail={onOpenDetail} />
      ))}
    </section>
  );
}

export function HazardRepositoryDrawer({ item, onClose }: HazardRepositoryDrawerProps) {
  return (
    <div className="solution-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        aria-label={`${item.name} details`}
        className="solution-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="solution-drawer-hero" style={imageStyle(item.imageUrl)} />
        <div className="solution-drawer-body">
          <div className="solution-drawer-head">
            <div>
              <h2>{item.name}</h2>
            </div>
            <button className="ghost-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <p>{item.description}</p>

          <div className="drawer-fact-row">
            <span>Risk and trend</span>
            <strong>
              {item.severity} risk · {item.trend}
            </strong>
          </div>

          <section className="drawer-section">
            <span className="panel-eyebrow">Regions at risk</span>
            <SolutionRepositoryTagList labels={item.regionsAtRisk} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Priority groups</span>
            <SolutionRepositoryTagList labels={item.priorityGroups} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Health outcomes</span>
            <div className="asset-list compact">
              {item.healthOutcomes.map((outcome) => (
                <span className="asset-link" key={outcome.id}>
                  <span>{outcome.name}</span>
                  <small>{outcome.summary}</small>
                </span>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Linked solutions</span>
            <div className="asset-list compact">
              {item.solutions.map((solution) => (
                <span className="asset-link" key={solution.id}>
                  <span>{solution.name}</span>
                  <small>{solutionMetaLine(solution)}</small>
                </span>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function HazardCard(props: HazardRepositoryCardProps) {
  return <HazardRepositoryCard {...props} />;
}

export function HazardGrid(props: HazardRepositoryGridProps) {
  return <HazardRepositoryGrid {...props} />;
}

export function HazardDrawer(props: HazardRepositoryDrawerProps) {
  return <HazardRepositoryDrawer {...props} />;
}

export function SolutionLinkSection({
  links,
}: {
  links: SolutionRepositoryItem["links"];
}) {
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

export function SolutionAssetSection({
  assets,
}: {
  assets: SolutionRepositoryItem["assets"];
}) {
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

export function SolutionRepositoryTagList({ labels }: { labels: string[] }) {
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

export function taxonomyLabels(item: SolutionRepositoryItem, type: string) {
  return item.taxonomies
    .filter((taxonomy) => taxonomy.type === type)
    .map((taxonomy) => taxonomy.label);
}

export function solutionMetaLine(item: SolutionRepositoryItem) {
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
