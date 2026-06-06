import { type CmsItem } from "../../content/cms";
import { solutionMetaLine } from "./cmsViewModel";
import { HazardTags } from "./CmsPipeline";

type SolutionDetailDrawerProps = {
  item: CmsItem;
  onClose: () => void;
  onEdit?: (item: CmsItem) => void;
};

export function SolutionDetailDrawer({
  item,
  onClose,
  onEdit,
}: SolutionDetailDrawerProps) {
  const metaLine = solutionMetaLine(item);

  return (
    <div className="solution-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        aria-label={`${item.title} details`}
        className="solution-drawer"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="solution-drawer-hero" style={{ background: item.thumbnail }} />
        <div className="solution-drawer-body">
          <div className="solution-drawer-head">
            <div>
              <h2>{item.title}</h2>
            </div>
            <button className="ghost-button" type="button" onClick={onClose}>
              Close
            </button>
          </div>

          <p>{item.summary}</p>

          {metaLine ? (
            <div className="drawer-fact-row">
              <span>Type and cost</span>
              <strong>{metaLine}</strong>
            </div>
          ) : null}

          {item.solution.climateHazards.length > 0 ? (
            <section className="drawer-section">
              <span className="panel-eyebrow">Hazards</span>
              <HazardTags hazards={item.solution.climateHazards} />
            </section>
          ) : null}

          <LinkSection links={item.solution.usefulLinks} />
          <AssetSection assets={item.solution.caseStudies} />

          <section className="drawer-section">
            <span className="panel-eyebrow">Description</span>
            {item.body.split("\n\n").map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>
            ))}
          </section>

          {onEdit ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                onClose();
                onEdit(item);
              }}
            >
              Edit this solution
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function LinkSection({ links }: { links: CmsItem["solution"]["usefulLinks"] }) {
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
            <span>{link.label ?? link.url}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function AssetSection({ assets }: { assets: CmsItem["solution"]["caseStudies"] }) {
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
            href={asset.url}
            key={`${asset.filename}-${asset.url}`}
            rel="noreferrer"
            target="_blank"
          >
            <span>{asset.filename ?? "Case study"}</span>
            <small>{asset.type ?? "File"}</small>
          </a>
        ))}
      </div>
    </section>
  );
}
