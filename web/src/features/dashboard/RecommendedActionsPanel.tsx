"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/Skeleton";

import { Icon, type IconName } from "@/components/Icon";
import { listRecommendedActions, type RecommendedAction } from "@/lib/planningClient";

import { ActionDetailDrawer } from "./ActionDetailDrawer";
import styles from "./RecommendedActionsPanel.module.css";

type ToneKey =
  | "behaviour"
  | "environment"
  | "policy"
  | "energy"
  | "infrastructure"
  | "products"
  | "service"
  | "wash"
  | "neutral";

type CategoryStyle = {
  toneClass: string;
  icon: IconName;
};

// Both the fallback list and live repository items flow through this map
// so the two states are visually indistinguishable.
const CATEGORY_STYLES: Record<ToneKey, CategoryStyle> = {
  behaviour: { toneClass: styles.tBehaviour, icon: "users" },
  environment: { toneClass: styles.tEnvironment, icon: "leaf" },
  policy: { toneClass: styles.tPolicy, icon: "policy" },
  energy: { toneClass: styles.tPolicy, icon: "bolt" },
  infrastructure: { toneClass: styles.tEnvironment, icon: "building" },
  products: { toneClass: styles.tBehaviour, icon: "settings" },
  service: { toneClass: styles.tBehaviour, icon: "heart-handshake" },
  wash: { toneClass: styles.tEnvironment, icon: "droplet" },
  neutral: { toneClass: styles.tNeutral, icon: "dots" },
};

const FALLBACK_ITEMS: readonly RecommendedAction[] = [
  {
    slug: "act-to-adapt",
    title: "Act to Adapt – Child Centered Climate Change Adaptation",
    description:
      "A community-led planning toolkit that helps frontline workers translate district-level climate risks into concrete, child-centred adaptation actions. Focuses on maternal, newborn, and child health touchpoints.",
    categories: ["Behaviour change"],
    hazards: ["Increased temperature", "Floods", "Drought"],
    cost: "medium",
    links: [{ url: "https://example.org/act-to-adapt", label: "act-to-adapt guide" }],
    caseStudies: [],
  },
  {
    slug: "dav-storytelling",
    title:
      "Behaviour change campaign for pregnant women: Digital Audio-Visual (DAV) storytelling",
    description:
      "Short, locally produced audio-visual stories delivered via community health workers and SMS/WhatsApp channels. Focuses on hydration, heat avoidance, and antenatal check-in adherence during the third trimester.",
    categories: ["Behaviour change"],
    hazards: ["Increased temperature"],
    cost: "low",
    links: [],
    caseStudies: [],
  },
  {
    slug: "water-based-cooling",
    title: "Cooling options: Water based cooling",
    description:
      "Evaporative cooling pads, community water sprays, and passive cooling retrofits for anganwadi centres and primary health clinics. Chosen for low ongoing operating cost in high-humidity settings.",
    categories: ["Environment"],
    hazards: ["Increased temperature"],
    cost: "medium",
    links: [],
    caseStudies: [],
  },
  {
    slug: "heat-responsive-codes",
    title: "Heat responsive building codes",
    description:
      "Municipal code amendments requiring reflective roofing, cross-ventilation, and shaded waiting areas for public health infrastructure. Best paired with an enforcement window during monsoon planning.",
    categories: ["Policy"],
    hazards: ["Increased temperature"],
    cost: "high",
    links: [],
    caseStudies: [],
  },
  {
    slug: "heatwave-early-warning",
    title: "Community engagement and education: Heatwave Early Warning Systems",
    description:
      "IMD-linked SMS alerts routed through ANMs and ASHA workers, with a decision tree for antenatal check-in scheduling on high-risk days.",
    categories: ["Behaviour change"],
    hazards: ["Increased temperature"],
    cost: "low",
    links: [],
    caseStudies: [],
  },
  {
    slug: "heat-health-awareness",
    title: "Community engagement and education: Heat health awareness",
    description:
      "Household visits and community meetings covering danger signs during pregnancy, cooling techniques, and when to seek care.",
    categories: ["Behaviour change"],
    hazards: ["Increased temperature"],
    cost: "low",
    links: [],
    caseStudies: [],
  },
  {
    slug: "cool-public-places",
    title: "Urban planning: Cool public places",
    description:
      "Shaded public plazas, urban tree canopy expansion, and accessible cooling stations near markets and public transit stops.",
    categories: ["Environment"],
    hazards: ["Increased temperature"],
    cost: "high",
    links: [],
    caseStudies: [],
  },
];

type Props = {
  /**
   * Repository hazard label to filter on (e.g. "Increased temperature").
   * Matched against the backend hazard taxonomy AND used to filter the
   * fallback list client-side so both data sources stay coherent.
   */
  hazard?: string;
  /** Display label shown in the "showing actions for …" chip. */
  hazardLabel?: string;
};

export function RecommendedActionsPanel({ hazard, hazardLabel }: Props = {}) {
  const filteredFallback = useMemo(
    () =>
      hazard
        ? FALLBACK_ITEMS.filter((item) => hazardMatches(item.hazards, hazard))
        : FALLBACK_ITEMS,
    [hazard],
  );
  const [items, setItems] = useState<readonly RecommendedAction[]>(filteredFallback);
  const [usingFallback, setUsingFallback] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // Only true while the repository call is in flight AND there is nothing
  // bundled to show. The seeded fallback normally renders immediately, so
  // swapping it for placeholder bars would replace real content with less.
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setItems(filteredFallback);
    setUsingFallback(true);
  }, [filteredFallback]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRecommendedActions({ limit: 7, hazard })
      .then((rows) => {
        if (cancelled || rows.length === 0) return;
        setItems(rows);
        setUsingFallback(false);
      })
      .catch(() => {
        // Repository unavailable -> the fallback stays; nothing to log.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hazard]);

  const selected = useMemo(
    () => items.find((item) => item.slug === selectedSlug) ?? null,
    [items, selectedSlug],
  );

  const closeDrawer = useCallback(() => setSelectedSlug(null), []);
  const renderPill = useCallback(
    (label: string) => <CategoryPill key={label} label={label} />,
    [],
  );

  return (
    <>
      <section
        className={styles.panel}
        aria-labelledby="recommended-actions-heading"
        data-source={usingFallback ? "fallback" : "repository"}
      >
        <header className={styles.header}>
          <p className={styles.eyebrow} id="recommended-actions-heading">
            Recommended actions
          </p>
          {hazardLabel ? (
            <span className={styles.filterChip} title={`Filtered by ${hazardLabel}`}>
              <Icon name="sun" size={12} />
              For {hazardLabel.toLowerCase()}
            </span>
          ) : null}
        </header>
        {loading && items.length === 0 ? (
          <ul className={styles.list} aria-busy="true" aria-label="Loading actions">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className={styles.skeletonItem}>
                <Skeleton width="70%" height="1rem" />
                <Skeleton width="45%" height="0.75rem" radius="full" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => setSelectedSlug(item.slug)}
                  aria-label={`Open ${item.title}`}
                >
                  <div className={styles.itemBody}>
                    <p className={styles.title}>{item.title}</p>
                    <div className={styles.pillRow}>
                      {(item.categories.length > 0
                        ? item.categories
                        : ["Recommended"]
                      ).map(renderPill)}
                    </div>
                  </div>
                  <Icon name="arrow-right" size={16} className={styles.itemChevron} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={styles.seeAll}>
          See all recommended actions
        </button>
      </section>
      <ActionDetailDrawer
        action={selected}
        onClose={closeDrawer}
        renderPill={renderPill}
      />
    </>
  );
}

function CategoryPill({ label }: { label: string }) {
  const tone = toneForCategory(label);
  const style = CATEGORY_STYLES[tone];
  return (
    <span className={`${styles.pill} ${style.toneClass}`}>
      <Icon name={style.icon} size={12} />
      {label}
    </span>
  );
}

function hazardMatches(hazards: readonly string[], target: string): boolean {
  const needle = target.trim().toLowerCase();
  return hazards.some((hazard) => hazard.trim().toLowerCase() === needle);
}

function toneForCategory(label: string): ToneKey {
  const key = label.trim().toLowerCase();
  if (key.startsWith("behaviour") || key.startsWith("behavior")) return "behaviour";
  if (key === "environment") return "environment";
  if (key === "policy") return "policy";
  if (key === "energy") return "energy";
  if (key === "infrastructure") return "infrastructure";
  if (key.startsWith("products")) return "products";
  if (key.startsWith("service")) return "service";
  if (key === "wash") return "wash";
  return "neutral";
}
