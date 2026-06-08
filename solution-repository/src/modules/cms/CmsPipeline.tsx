import { type CmsItem } from "../../content/cms";
import { hazardOptions, optionLabel } from "../../lib/solutionRepositoryOptions";
import { cmsStatuses, prettyStatusLabel, solutionMetaLine } from "./cmsViewModel";
import { pipelineModes, type PipelineMode } from "./types";

type CmsPipelineProps = {
  items: CmsItem[];
  mode: PipelineMode;
  onModeChange: (mode: PipelineMode) => void;
  onOpenEditor: (item?: CmsItem) => void;
};

export function CmsPipeline({
  items,
  mode,
  onModeChange,
  onOpenEditor,
}: CmsPipelineProps) {
  return (
    <>
      <div className="pipeline-toolbar">
        <div className="section-switcher">
          {pipelineModes.map((pipelineMode) => (
            <button
              className={`ghost-button ${mode === pipelineMode.key ? "active" : ""}`}
              key={pipelineMode.key}
              type="button"
              onClick={() => onModeChange(pipelineMode.key)}
            >
              {pipelineMode.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "kanban" ? (
        <KanbanView items={items} onOpenEditor={onOpenEditor} />
      ) : mode === "timeline" ? (
        <TimelineView items={items} onOpenEditor={onOpenEditor} />
      ) : (
        <TableView items={items} onOpenEditor={onOpenEditor} />
      )}
    </>
  );
}

function KanbanView({
  items,
  onOpenEditor,
}: Pick<CmsPipelineProps, "items" | "onOpenEditor">) {
  return (
    <div className="kanban-grid">
      {cmsStatuses.map((status) => {
        const statusItems = items.filter((item) => item.status === status);

        return (
          <section className="kanban-column" key={status}>
            <div className="kanban-column-head">
              <div>
                <span className="kanban-title">{prettyStatusLabel(status)}</span>
                <span className="kanban-count">{statusItems.length}</span>
              </div>
              <button
                className="mini-button"
                type="button"
                onClick={() => onOpenEditor(undefined)}
              >
                +
              </button>
            </div>

            <div className="kanban-card-list">
              {statusItems.map((item) => (
                <PipelineCard item={item} key={item.id} onOpenEditor={onOpenEditor} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PipelineCard({
  item,
  onOpenEditor,
}: {
  item: CmsItem;
  onOpenEditor: (item: CmsItem) => void;
}) {
  const metaLine = solutionMetaLine(item);

  return (
    <button className="kanban-card" type="button" onClick={() => onOpenEditor(item)}>
      <strong>{item.title}</strong>
      <p>{item.summary}</p>
      {metaLine ? <span className="solution-meta-line">{metaLine}</span> : null}
      <HazardTags hazards={item.solution.climateHazards} limit={3} />
      <div className="kanban-meta">
        <span>{item.owner}</span>
        <span>{item.updated}</span>
      </div>
    </button>
  );
}

function TimelineView({
  items,
  onOpenEditor,
}: Pick<CmsPipelineProps, "items" | "onOpenEditor">) {
  return (
    <div className="timeline-card">
      <div className="timeline-head">
        <h2>Publishing flow</h2>
      </div>
      <div className="timeline-list">
        {items
          .filter((item) => item.scheduledDate)
          .sort((left, right) =>
            (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? ""),
          )
          .map((item) => (
            <button
              className="timeline-item"
              key={item.id}
              type="button"
              onClick={() => onOpenEditor(item)}
            >
              <span>{item.scheduledDate}</span>
              <strong>{item.title}</strong>
              <small>{prettyStatusLabel(item.status)}</small>
            </button>
          ))}
      </div>
    </div>
  );
}

function TableView({
  items,
  onOpenEditor,
}: Pick<CmsPipelineProps, "items" | "onOpenEditor">) {
  return (
    <div className="content-table">
      <div className="content-table-head">
        <span>Name</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Updated</span>
      </div>
      {items.map((item) => {
        const metaLine = solutionMetaLine(item);

        return (
          <button
            className="content-table-row"
            key={item.id}
            type="button"
            onClick={() => onOpenEditor(item)}
          >
            <div className="content-title-cell">
              <span className="content-thumb" style={{ background: item.thumbnail }} />
              <div>
                <strong>{item.title}</strong>
                <small>{item.summary}</small>
                {metaLine ? <small>{metaLine}</small> : null}
              </div>
            </div>
            <span className={`status-chip ${item.status}`}>
              {prettyStatusLabel(item.status)}
            </span>
            <span>{item.owner}</span>
            <span>{item.updated}</span>
          </button>
        );
      })}
    </div>
  );
}

export function HazardTags({
  hazards,
  limit,
}: {
  hazards: CmsItem["solution"]["climateHazards"];
  limit?: number;
}) {
  const visibleHazards = limit ? hazards.slice(0, limit) : hazards;

  if (visibleHazards.length === 0) {
    return null;
  }

  return (
    <div className="compact-tag-row">
      {visibleHazards.map((hazard) => (
        <span className="meta-tag" key={hazard}>
          {optionLabel(hazard, hazardOptions) ?? hazard}
        </span>
      ))}
    </div>
  );
}
