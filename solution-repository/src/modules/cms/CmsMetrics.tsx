import { type CmsItem } from "../../content/cms";

type CmsMetricsProps = {
  items: CmsItem[];
};

export function CmsMetrics({ items }: CmsMetricsProps) {
  const draftCount = countItemsByStatus(items, "draft");
  const reviewCount = countItemsByStatus(items, "review");
  const scheduledCount = countItemsByStatus(items, "scheduled");
  const publishedCount = countItemsByStatus(items, "published");

  return (
    <section className="metric-grid cms-metric-grid">
      <article className="metric-card">
        <span className="metric-card-label">Drafts</span>
        <strong className="metric-card-value">{draftCount}</strong>
        <span className="metric-card-detail">Needs assignment or next edit</span>
      </article>
      <article className="metric-card alert">
        <span className="metric-card-label">In review</span>
        <strong className="metric-card-value">{reviewCount}</strong>
        <span className="metric-card-detail">Most active editorial queue</span>
      </article>
      <article className="metric-card">
        <span className="metric-card-label">Scheduled</span>
        <strong className="metric-card-value">{scheduledCount}</strong>
        <span className="metric-card-detail">Ready for a publish window</span>
      </article>
      <article className="metric-card">
        <span className="metric-card-label">Published</span>
        <strong className="metric-card-value">{publishedCount}</strong>
        <span className="metric-card-detail">Stable public resources</span>
      </article>
    </section>
  );
}

function countItemsByStatus(items: CmsItem[], status: CmsItem["status"]) {
  return items.filter((item) => item.status === status).length;
}
