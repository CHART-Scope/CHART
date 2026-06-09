import { type SubmissionItem } from "../../content/cms";

type CmsSubmissionsProps = {
  submissions: SubmissionItem[];
};

export function CmsSubmissions({ submissions }: CmsSubmissionsProps) {
  if (submissions.length === 0) {
    return (
      <section className="empty-panel">
        <span className="panel-eyebrow">Submissions</span>
        <h2>No submissions available</h2>
        <p>
          Submitted resources will appear here when they are available to your role.
        </p>
      </section>
    );
  }

  return (
    <div className="submission-grid">
      {submissions.map((submission) => (
        <SubmissionCard key={submission.id} submission={submission} />
      ))}
    </div>
  );
}

function SubmissionCard({ submission }: { submission: SubmissionItem }) {
  return (
    <article className="submission-card">
      <div className="submission-card-head">
        <div>
          <strong>{submission.organization}</strong>
          <span>{submission.origin}</span>
        </div>
        <span className={`status-chip ${submission.state}`}>{submission.state}</span>
      </div>
      <h2>{submission.title}</h2>
      <p>{submission.description}</p>
      <div className="submission-tags">
        {submission.tags.map((tag) => (
          <span className="meta-tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="submission-foot">
        <span>Submission #{submission.id}</span>
        <span>{submission.received}</span>
      </div>
    </article>
  );
}
