import { cmsSections, type CmsSection } from "./types";

type CmsHeaderProps = {
  activeSection: CmsSection;
  onSectionChange: (section: CmsSection) => void;
};

export function CmsHeader({ activeSection, onSectionChange }: CmsHeaderProps) {
  return (
    <section className="page-header-block">
      <div>
        <div className="page-breadcrumb">Repository / Content studio</div>
        <h1 className="page-heading">Managed solution records and pipeline</h1>
        <p className="page-copy">
          Central place for public solution records, editorial workflow, media, and
          publishing state.
        </p>
      </div>

      <div className="section-switcher">
        {cmsSections.map((section) => (
          <button
            className={`ghost-button ${activeSection === section.key ? "active" : ""}`}
            key={section.key}
            type="button"
            onClick={() => onSectionChange(section.key)}
          >
            {section.label}
          </button>
        ))}
      </div>
    </section>
  );
}
