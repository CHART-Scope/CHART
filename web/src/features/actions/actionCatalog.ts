import { type IconName } from "@/components/Icon";
import { RISK_BANDS } from "@/features/dashboard/SpatialRiskMap";

import {
  actionRecords,
  samplePriorityDistricts,
  sourceRecords,
  type ActionFields,
  type AirtableRecord,
  type SourceFields,
} from "./data/actionsTable";

/**
 * Repository-native hazard label the action taxonomy is keyed on. The
 * dashboard says "Extreme heat"; the solution repository and the Airtable it
 * mirrors say "Increased temperature".
 */
export const heatHazardKey = "Increased temperature";

export const seasons = [
  "Before heat season",
  "During heat season",
  "After heat season",
] as const;
export type Season = (typeof seasons)[number];

export const costLevels = ["Low", "Medium", "High"] as const;
export type CostLevel = (typeof costLevels)[number];

export type StepItem = { lead: string | null; text: string };
export type Stakeholder = { role: string; example: string | null };
export type Reference = { citation: string; url: string };
export type PriorityDistrict = {
  district: string;
  percent: number;
  temperatureC: number;
};

export type Action = {
  id: string;
  title: string;
  icon: IconName;
  department: string;
  actionType: string;
  applicationLevel: string[];
  hazards: string[];
  cost: CostLevel;
  costNotes: string;
  seasons: Season[];
  timeframeNotes: string;
  description: string[];
  stepsHeading: string | null;
  steps: StepItem[];
  stakeholders: Stakeholder[];
  rationale: string[];
  outcomes: string[];
  sources: Reference[];
  caseStudies: Reference[];
  priorityDistricts: PriorityDistrict[];
};

/**
 * Every action for a hazard, in content order. Static today; the Airtable
 * (or solution repository) fetch replaces the two tables it reads and
 * nothing downstream changes.
 */
export function listActions(hazard?: string): Action[] {
  const sources = new Map(sourceRecords.map((record) => [record.id, record.fields]));
  return actionRecords
    .map((record) => toAction(record, sources))
    .filter((action) => !hazard || action.hazards.some((h) => sameLabel(h, hazard)));
}

function toAction(
  { id, fields }: AirtableRecord<ActionFields>,
  sources: Map<string, SourceFields>,
): Action {
  const linked = fields.Sources.flatMap((sourceId) => {
    const source = sources.get(sourceId);
    return source ? [source] : [];
  });
  const references = (kind: SourceFields["Kind"]) =>
    linked
      .filter((source) => source.Kind === kind)
      .map((source) => ({ citation: source.Citation, url: source.URL }));
  return {
    id,
    title: fields.Title,
    icon: fields.Icon,
    department: fields.Department,
    actionType: fields["Action type"],
    applicationLevel: fields["Application level"],
    hazards: fields["Climate hazards"],
    cost: fields["Cost level"],
    costNotes: fields["Cost notes"],
    seasons: seasons.filter((season) => fields.Timeframe.includes(season)),
    timeframeNotes: fields["Timeframe notes"],
    description: paragraphs(fields.Description),
    stepsHeading: fields["Steps heading"] ?? null,
    steps: lines(fields.Steps).map((line) => {
      const [lead, text] = splitLead(line);
      return text === null ? { lead: null, text: line } : { lead, text };
    }),
    stakeholders: lines(fields.Stakeholders).map((line) => {
      const [role, example] = splitLead(line);
      return { role, example };
    }),
    rationale: paragraphs(fields.Rationale),
    outcomes: lines(fields["Expected outcomes"]),
    sources: references("Source"),
    caseStudies: references("Case study"),
    priorityDistricts: samplePriorityDistricts[id] ?? [],
  };
}

/** Colour a district the way the risk map colours it. */
export function districtFill(percent: number) {
  return (RISK_BANDS.find((band) => percent <= band.upper) ?? RISK_BANDS[0]).fill;
}

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function lines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** "Lead — rest" → [lead, rest]; a line without the separator → [line, null]. */
function splitLead(line: string): [string, string | null] {
  const at = line.indexOf(" — ");
  return at < 0 ? [line, null] : [line.slice(0, at), line.slice(at + 3)];
}

function sameLabel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
