"use client";

import { useEffect, useRef } from "react";

import { Icon, type IconName } from "@/components/Icon";
import type { RecommendedAction } from "@/lib/planningClient";

import styles from "./ActionDetailDrawer.module.css";

type Props = {
  action: RecommendedAction | null;
  onClose: () => void;
  renderPill: (label: string) => React.ReactElement;
};

const COST_STEPS = ["low", "medium", "high"] as const;

/**
 * Right-side detail drawer. Renders when ``action`` is non-null and
 * animates in via a CSS transition on the ``[data-open]`` attribute — the
 * parent controls state; the drawer just reflects it. Body scroll is
 * locked while open so the underlying dashboard does not shift.
 */
export function ActionDetailDrawer({ action, onClose, renderPill }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!action) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [action, onClose]);

  const open = action !== null;

  return (
    <div className={styles.root} data-open={open || undefined} aria-hidden={!open}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        tabIndex={-1}
        aria-label="Close details"
      />
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-detail-title"
      >
        {action ? (
          <>
            <header className={styles.header}>
              <p className={styles.eyebrow}>Recommended action</p>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.close}
                onClick={onClose}
                aria-label="Close details"
              >
                ×
              </button>
            </header>

            <div className={styles.pillRow}>
              {action.categories.map((label) => renderPill(label))}
            </div>

            <h2 id="action-detail-title" className={styles.title}>
              {action.title}
            </h2>

            {action.cost ? <CostMeter cost={action.cost} /> : null}

            {action.description ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>What it involves</p>
                <div className={styles.description}>
                  {formatDescription(action.description)}
                </div>
              </section>
            ) : null}

            {action.hazards.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Addresses</p>
                <ul className={styles.chipGrid}>
                  {action.hazards.map((hazard) => (
                    <li key={hazard} className={styles.chip}>
                      {hazard}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {action.links.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Useful links</p>
                <ul className={styles.linkList}>
                  {action.links.map((link) => (
                    <li key={link.url}>
                      <a
                        className={styles.link}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className={styles.linkHost}>{link.label}</span>
                        <Icon name="arrow-right" size={14} />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {action.caseStudies.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Case studies</p>
                <ul className={styles.assetList}>
                  {action.caseStudies.map((asset) => (
                    <li key={asset.filename} className={styles.asset}>
                      <Icon
                        name={iconForType(asset.type)}
                        size={20}
                        className={styles.assetIcon}
                      />
                      <div>
                        <p className={styles.assetName}>{asset.filename}</p>
                        <p className={styles.assetMeta}>{formatFileSize(asset.size)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </aside>
    </div>
  );
}

function CostMeter({ cost }: { cost: "low" | "medium" | "high" }) {
  const activeIndex = COST_STEPS.indexOf(cost);
  return (
    <section className={styles.section}>
      <p className={styles.sectionLabel}>Cost of implementation</p>
      <div className={styles.costMeter}>
        <div className={styles.costTrack}>
          {COST_STEPS.map((step, index) => (
            <span
              key={step}
              className={styles.costDot}
              data-active={index <= activeIndex || undefined}
              data-current={index === activeIndex || undefined}
              aria-hidden
            />
          ))}
        </div>
        <span className={styles.costDollars} aria-hidden>
          {COST_STEPS.map((step, index) => (
            <span
              key={step}
              className={styles.costDollar}
              data-active={index <= activeIndex || undefined}
            >
              $
            </span>
          ))}
        </span>
        <span className={styles.costLabel}>{titleCase(cost)}</span>
      </div>
    </section>
  );
}

function formatDescription(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph, index) => {
    const bulletLines = paragraph
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const isBulletBlock = bulletLines.every((line) => line.startsWith("- "));
    if (isBulletBlock) {
      return (
        <ul key={index} className={styles.bulletList}>
          {bulletLines.map((line, bulletIndex) => (
            <li key={bulletIndex}>{line.replace(/^- /, "")}</li>
          ))}
        </ul>
      );
    }
    return <p key={index}>{paragraph}</p>;
  });
}

function iconForType(type: string | undefined): IconName {
  if (!type) return "book";
  if (type.includes("pdf")) return "book";
  if (type.startsWith("image/")) return "sun";
  return "book";
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "Attachment";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
