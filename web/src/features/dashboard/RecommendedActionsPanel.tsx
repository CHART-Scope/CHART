"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import {
  ActionPanel,
  heatHazardKey,
  listActions,
  statusLabels,
  useActionProgress,
} from "@/features/actions";

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

type Props = {
  /** Page geography; the "See all" page is scoped to it. */
  geographyId: string;
  /** Area actually shown (a division, or the page geography). Status and
   * assignments are recorded against it. */
  placeId: string;
  placeName: string;
  outcome: string;
  outcomeLabel: string;
  hazardLabel: string;
  healthDomainLabel: string;
};

/**
 * The dashboard's short list of recommended actions. Opens the same detail
 * panel as the full actions page, and "See all" goes there.
 */
export function RecommendedActionsPanel({
  geographyId,
  placeId,
  placeName,
  outcome,
  outcomeLabel,
  hazardLabel,
  healthDomainLabel,
}: Props) {
  const actions = useMemo(() => listActions(heatHazardKey), []);
  const progress = useActionProgress(placeId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closePanel = useCallback(() => setSelectedId(null), []);

  const query = new URLSearchParams({ outcome });
  if (placeId !== geographyId) query.set("admin_unit", placeId);
  const seeAllHref = `/dashboard/${encodeURIComponent(geographyId)}/actions?${query}`;

  return (
    <>
      <section className={styles.panel} aria-labelledby="recommended-actions-heading">
        <header className={styles.header}>
          <p className={styles.eyebrow} id="recommended-actions-heading">
            Recommended actions
          </p>
          <span className={styles.filterChip} title={`Filtered by ${hazardLabel}`}>
            <Icon name="sun" size={12} />
            For {hazardLabel.toLowerCase()}
          </span>
        </header>
        <ul className={styles.list}>
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                className={styles.item}
                onClick={() => setSelectedId(action.id)}
                aria-label={`Open ${action.title}`}
              >
                <div className={styles.itemBody}>
                  <p className={styles.title}>{action.title}</p>
                  <div className={styles.pillRow}>
                    <CategoryPill label={action.actionType} />
                    <span className={`${styles.pill} ${styles.tNeutral}`}>
                      {action.department} department
                    </span>
                    <span className={styles.status}>
                      {statusLabels[progress.statusOf(action.id)]}
                    </span>
                  </div>
                </div>
                <Icon name="arrow-right" size={16} className={styles.itemChevron} />
              </button>
            </li>
          ))}
        </ul>
        <Link href={seeAllHref} className={styles.seeAll}>
          See all recommended actions
        </Link>
      </section>
      <ActionPanel
        action={actions.find((action) => action.id === selectedId) ?? null}
        contextLabel={`${hazardLabel} · ${healthDomainLabel} · ${placeName}`}
        hazardLabel={hazardLabel}
        outcomeLabel={outcomeLabel.toLowerCase()}
        progress={progress}
        onClose={closePanel}
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

function toneForCategory(label: string): ToneKey {
  const key = label.trim().toLowerCase();
  if (key.startsWith("behaviour") || key.startsWith("behavior")) return "behaviour";
  if (key === "environment") return "environment";
  if (key === "policy" || key === "regulatory") return "policy";
  if (key === "energy") return "energy";
  if (key === "infrastructure") return "infrastructure";
  if (key.startsWith("products")) return "products";
  if (key.startsWith("service")) return "service";
  if (key === "wash") return "wash";
  return "neutral";
}
