"use client";

import type { CSSProperties } from "react";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";

type SolutionRepositoryItemCardProps = {
  item: SolutionRepositoryItem;
  onOpenDetail: (item: SolutionRepositoryItem) => void;
};

type SolutionRepositoryDetailDrawerProps = {
  item: SolutionRepositoryItem;
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
