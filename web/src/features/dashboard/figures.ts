import { type IconName } from "@/components/Icon";

/**
 * The pictograms the dashboard draws for an outcome, in one place so the icon
 * array and the "Understanding risk & prevention" panel always agree.
 *
 * The icon array counts newborns for both outcomes (one cell per birth or per
 * child death). The exposed population is pregnant women for low birth weight
 * and young children for under-five mortality.
 */
export function iconArrayFigure(_outcome: string): IconName {
  return "newborn";
}

export function exposedPopulationFigure(outcome: string): IconName {
  return outcome === "lbw" ? "pregnant-woman" : "child";
}
