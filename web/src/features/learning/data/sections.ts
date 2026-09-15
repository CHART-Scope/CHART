/**
 * Copy for the section headers. The catalogue knows which country a resource
 * belongs to but not how to introduce it, so the framing lives here — beside
 * the module that renders it, per the frontend module shape in AGENTS.md.
 */

export type SectionCopy = { kicker: string; note: string };

export const GLOBAL_SECTION = "Global";

export const SECTION_COPY: Record<string, SectionCopy> = {
  Global: {
    kicker: "START HERE",
    note: "Shared grounding for everyone in the room",
  },
  India: {
    kicker: "INDIA",
    note: "Extreme heat · Madhya Pradesh, Gujarat, Rajasthan",
  },
  Kenya: {
    kicker: "KENYA",
    note: "Floods, drought and heat · Homa Bay, Kilifi",
  },
};

export function sectionCopy(label: string): SectionCopy {
  return (
    SECTION_COPY[label] ?? { kicker: label.toUpperCase(), note: "" }
  );
}

/** Countries with their own section; everything else falls into Global. */
export const SECTION_ORDER = [GLOBAL_SECTION, "Kenya", "India"];
