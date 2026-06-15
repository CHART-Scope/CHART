"use client";

import type { CSSProperties } from "react";

import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TagList } from "../ui/Tag";

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

export function SolutionRepositoryItemCard({
  item,
  onOpenDetail,
}: SolutionRepositoryItemCardProps) {
  const hazards = taxonomyLabels(item, "hazard").slice(0, 2).join(" · ");
  const image = item.assets.find((asset) => asset.kind === "image")?.storageUrl;

  return (
    <Card as="article" className="solution-repository-card" interactive>
      <button
        className="solution-repository-card-main"
        type="button"
        onClick={() => onOpenDetail(item)}
      >
        <span className="solution-repository-image" style={imageStyle(image)} />
        <div className="solution-repository-card-body">
          <small>{hazards || "Climate-health solution"}</small>
          <strong>{item.name}</strong>
          <p>
            {item.summary ?? item.description ?? "Solution details are being prepared."}
          </p>
          <div className="solution-meta-row">
            <span className="solution-meta-line">{solutionTypeLine(item)}</span>
            <CostIndicator cost={item.costOfImplementation} />
          </div>
          <TagList labels={taxonomyLabels(item, "hazard").slice(0, 3)} />
        </div>
      </button>
    </Card>
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
            <Button compact variant="ghost" onClick={onClose}>
              &#10005; Close
            </Button>
          </div>

          <p>{item.summary ?? item.description}</p>

          <div className="drawer-fact-row">
            <span>Solution type and cost</span>
            <div className="drawer-cost-row">
              <strong>{solutionTypeLine(item)}</strong>
              <CostIndicator cost={item.costOfImplementation} />
            </div>
          </div>

          <section className="drawer-section">
            <span className="panel-eyebrow">Hazards</span>
            <TagList labels={taxonomyLabels(item, "hazard")} />
          </section>

          <section className="drawer-section">
            <span className="panel-eyebrow">Solution types</span>
            <TagList labels={taxonomyLabels(item, "solution_type")} />
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

  const pdfLinks = links.filter((link) => /\.pdf($|\?)/i.test(link.url));
  const otherLinks = links.filter((link) => !/\.pdf($|\?)/i.test(link.url));

  return (
    <section className="drawer-section">
      <span className="panel-eyebrow">Useful links</span>
      {pdfLinks.length > 0 ? (
        <div className="drawer-asset-grid">
          {pdfLinks.map((link) => (
            <a
              className="drawer-asset-card"
              href={link.url}
              key={link.url}
              rel="noreferrer"
              target="_blank"
            >
              <span className="drawer-asset-embed-wrap">
                <embed
                  className="drawer-asset-embed"
                  src={link.url}
                  type="application/pdf"
                />
                <span className="drawer-asset-embed-overlay" />
              </span>
              <span className="drawer-asset-info">
                <span className="drawer-asset-name">{link.label}</span>
                <small>PDF &#183; opens in new tab</small>
              </span>
            </a>
          ))}
        </div>
      ) : null}
      {otherLinks.length > 0 ? (
        <div className="drawer-link-list">
          {otherLinks.map((link) => (
            <a
              className="drawer-link-card"
              href={link.url}
              key={link.url}
              rel="noreferrer"
              target="_blank"
            >
              <span className="drawer-link-icon" aria-hidden="true">
                &#8599;
              </span>
              <span className="drawer-link-text">
                <span className="drawer-link-label">{link.label}</span>
                <span className="drawer-link-url">{link.url}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
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
      <div className="drawer-asset-grid">
        {assets.map((asset) => {
          const isPdf =
            asset.mimeType?.includes("pdf") || asset.filename.endsWith(".pdf");
          const isImage =
            asset.mimeType?.startsWith("image/") ||
            /\.(jpg|jpeg|png|webp|gif)$/i.test(asset.filename);
          const url = asset.storageUrl ?? "#";

          return (
            <a
              className="drawer-asset-card"
              href={url}
              key={asset.id}
              rel="noreferrer"
              target="_blank"
            >
              {isPdf && asset.storageUrl ? (
                <span className="drawer-asset-embed-wrap">
                  <embed
                    className="drawer-asset-embed"
                    src={asset.storageUrl}
                    type="application/pdf"
                  />
                  <span className="drawer-asset-embed-overlay" />
                </span>
              ) : isImage && asset.storageUrl ? (
                <span className="drawer-asset-preview">
                  <img
                    className="drawer-asset-img"
                    src={asset.storageUrl}
                    alt={asset.filename}
                    loading="lazy"
                  />
                </span>
              ) : (
                <span className="drawer-asset-preview drawer-asset-preview-file">
                  <span className="drawer-asset-filetype">
                    {(asset.mimeType?.split("/").pop() ?? "FILE")
                      .toUpperCase()
                      .slice(0, 4)}
                  </span>
                </span>
              )}
              <span className="drawer-asset-info">
                <span className="drawer-asset-name">{asset.filename}</span>
                <small>
                  {isPdf ? "PDF document" : (asset.mimeType ?? "Resource")} &#183; opens
                  in new tab
                </small>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function taxonomyLabels(item: SolutionRepositoryItem, type: string) {
  return item.taxonomies
    .filter((taxonomy) => taxonomy.type === type)
    .map((taxonomy) => taxonomy.label);
}

function solutionTypeLine(item: SolutionRepositoryItem) {
  return (
    taxonomyLabels(item, "solution_type").slice(0, 2).join(", ") || "Solution details"
  );
}

const costLevels: Record<string, { filled: number; label: string }> = {
  low: { filled: 1, label: "Low" },
  medium: { filled: 2, label: "Medium" },
  high: { filled: 3, label: "High" },
};

function CostIndicator({ cost }: { cost: string | null }) {
  if (!cost) {
    return null;
  }

  const level = costLevels[cost];

  if (!level) {
    return <span className="cost-indicator-label">{cost.replace(/[_-]+/g, " ")}</span>;
  }

  return (
    <span className="cost-indicator">
      {[1, 2, 3].map((n) => (
        <span
          className={`cost-pip${n <= level.filled ? " cost-pip-filled" : ""}`}
          key={n}
        >
          $
        </span>
      ))}
      <span className="cost-indicator-label">{level.label}</span>
    </span>
  );
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
