import { type CmsItem, type CmsStatus } from "../../content/cms";
import { cmsStatusFilters, prettyStatusLabel, solutionMetaLine } from "./cmsViewModel";
import { HazardTags } from "./CmsPipeline";

type CmsContentGridProps = {
  items: CmsItem[];
  statusFilter: CmsStatus | "all";
  onStatusFilterChange: (status: CmsStatus | "all") => void;
  onOpenDetail: (itemId: string) => void;
};

export function CmsContentGrid({
  items,
  statusFilter,
  onStatusFilterChange,
  onOpenDetail,
}: CmsContentGridProps) {
  const filteredItems = items.filter((item) => {
    return statusFilter === "all" ? true : item.status === statusFilter;
  });

  return (
    <>
      <div className="type-filter-row">
        {cmsStatusFilters.map((filterStatus) => (
          <button
            className={`filter-chip ${statusFilter === filterStatus ? "active" : ""}`}
            key={filterStatus}
            type="button"
            onClick={() => onStatusFilterChange(filterStatus)}
          >
            {filterStatus === "all" ? "All" : prettyStatusLabel(filterStatus)}
          </button>
        ))}
      </div>
      <div className="chart-repository-grid">
        {filteredItems.map((item) => (
          <SolutionCard item={item} key={item.id} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </>
  );
}

function SolutionCard({
  item,
  onOpenDetail,
}: {
  item: CmsItem;
  onOpenDetail: (itemId: string) => void;
}) {
  const metaLine = solutionMetaLine(item);

  return (
    <article className="chart-repository-card">
      <button
        className="chart-repository-card-main"
        type="button"
        onClick={() => onOpenDetail(item.id)}
      >
        <span
          className="chart-repository-image"
          style={{ background: item.thumbnail }}
        />
        <div className="chart-repository-card-body">
          <strong>{item.title}</strong>
          <p>{item.summary}</p>
          {metaLine ? <small>{metaLine}</small> : null}
          <HazardTags hazards={item.solution.climateHazards} limit={3} />
        </div>
      </button>
    </article>
  );
}
