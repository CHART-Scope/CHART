import type { LearningResource, LearningTrack } from "@/lib/learningClient";

import { GLOBAL_SECTION, SECTION_ORDER, sectionCopy } from "./data/sections";

export type ModuleGroup = {
  slug: string;
  title: string;
  subtitle: string;
  items: LearningResource[];
};

export type SectionGroup = {
  id: string;
  label: string;
  kicker: string;
  note: string;
  count: number;
  modules: ModuleGroup[];
};

const UNGROUPED = "__other__";

export function sectionIdFor(label: string): string {
  return `sec-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function matches(resource: LearningResource, needle: string): boolean {
  if (!needle) return true;
  return [
    resource.title,
    resource.provider,
    resource.format_label,
    resource.location_label,
    resource.objectives,
    ...resource.languages,
    ...resource.tags,
    ...resource.health_outcomes,
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/**
 * Fold the flat catalogue into country sections and, inside each, the
 * curricular module a resource belongs to.
 *
 * A resource can carry several tracks but is placed under its first only —
 * showing the same card twice in one section reads as a duplicate, not as
 * helpfulness. Sections with nothing left after a search drop out entirely.
 */
export function groupCatalogue(
  resources: readonly LearningResource[],
  tracks: readonly LearningTrack[],
  query = "",
): SectionGroup[] {
  const needle = query.trim().toLowerCase();
  const order = new Map(tracks.map((track, index) => [track.slug, index]));
  const titles = new Map(tracks.map((track) => [track.slug, track]));

  const bySection = new Map<string, Map<string, LearningResource[]>>();

  for (const resource of resources) {
    if (!matches(resource, needle)) continue;

    const labels =
      resource.countries.length > 0 ? resource.countries : [GLOBAL_SECTION];
    // A resource tagged with two countries genuinely belongs in both.
    for (const label of labels) {
      const section = bySection.get(label) ?? new Map();
      bySection.set(label, section);
      const key = resource.tracks[0] ?? UNGROUPED;
      section.set(key, [...(section.get(key) ?? []), resource]);
    }
  }

  const sections: SectionGroup[] = [];
  for (const [label, moduleMap] of bySection) {
    const modules: ModuleGroup[] = [...moduleMap.entries()]
      .sort(([a], [b]) => {
        // Ungrouped material trails the named modules.
        if (a === UNGROUPED) return 1;
        if (b === UNGROUPED) return -1;
        return (order.get(a) ?? 99) - (order.get(b) ?? 99);
      })
      .map(([slug, items]) => {
        const track = titles.get(slug);
        return {
          slug,
          title: track?.title ?? "More material",
          subtitle: track?.summary ?? "",
          items,
        };
      });

    const copy = sectionCopy(label);
    sections.push({
      id: sectionIdFor(label),
      label,
      kicker: copy.kicker,
      note: copy.note,
      count: modules.reduce((total, module) => total + module.items.length, 0),
      modules,
    });
  }

  // A country with one or two items reads as a stub section rather than a
  // place worth jumping to, so it folds back into Global.
  const MIN_SECTION = 3;
  const global = sections.find((section) => section.label === GLOBAL_SECTION);
  const thin = sections.filter(
    (section) => section.label !== GLOBAL_SECTION && section.count < MIN_SECTION,
  );
  if (global && thin.length > 0) {
    for (const section of thin) {
      for (const module of section.modules) {
        const target = global.modules.find((m) => m.slug === module.slug);
        if (target) target.items.push(...module.items);
        else global.modules.push(module);
      }
      global.count += section.count;
      sections.splice(sections.indexOf(section), 1);
    }
  }

  const rank = (label: string) => {
    const index = SECTION_ORDER.indexOf(label);
    return index === -1 ? SECTION_ORDER.length : index;
  };
  return sections.sort((a, b) => rank(a.label) - rank(b.label) || b.count - a.count);
}
