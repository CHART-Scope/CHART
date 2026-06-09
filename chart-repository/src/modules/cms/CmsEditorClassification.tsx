import { type CmsSolutionMetadata } from "../../content/cms";
import {
  type CostValue,
  costOptions,
  hazardOptions,
  solutionTypeOptions,
} from "../../lib/chartRepositoryOptions";
import { type CmsEditorProps } from "./cmsEditorTypes";

type CmsEditorClassificationProps = Pick<
  CmsEditorProps,
  "onToggleSolutionArrayValue" | "onUpdateSolution"
> & {
  solution: CmsSolutionMetadata;
};

export function CmsEditorClassification({
  solution,
  onToggleSolutionArrayValue,
  onUpdateSolution,
}: CmsEditorClassificationProps) {
  return (
    <div className="editor-section">
      <span className="editor-section-label">Classification</span>
      <label className="editor-field">
        Solution types
        <div className="option-chip-grid">
          {solutionTypeOptions.map((option) => (
            <button
              className={`option-chip option-chip--solution ${
                solution.solutionTypes.includes(option.value) ? "active" : ""
              }`}
              key={option.value}
              type="button"
              onClick={() => onToggleSolutionArrayValue("solutionTypes", option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </label>
      <label className="editor-field">
        Climate hazards
        <div className="option-chip-grid">
          {hazardOptions.map((option) => (
            <button
              className={`option-chip option-chip--hazard ${
                solution.climateHazards.includes(option.value) ? "active" : ""
              }`}
              key={option.value}
              type="button"
              onClick={() => onToggleSolutionArrayValue("climateHazards", option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </label>
      <div className="editor-field">
        <span>Cost of implementation</span>
        <div className="cost-selector">
          {costOptions.map((option) => (
            <button
              className={`cost-pill ${
                solution.costOfImplementation === option.value ? "active" : ""
              }`}
              key={option.value}
              type="button"
              onClick={() =>
                onUpdateSolution({
                  costOfImplementation:
                    solution.costOfImplementation === option.value
                      ? undefined
                      : (option.value as CostValue),
                })
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
