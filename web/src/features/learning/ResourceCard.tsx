"use client";

import {
  hostOf,
  isPlayable,
  thumbnailUrl,
  type LearningResource,
} from "@/lib/learningClient";

import styles from "./ResourceCard.module.css";

type Props = {
  resource: LearningResource;
  /** Stagger index; cards fade in one after another rather than all at once. */
  index?: number;
  onOpen?: (resource: LearningResource) => void;
};

/** "English · Nov 2023 · Open access" — whatever of that we actually know. */
function metaLine(resource: LearningResource): string {
  const parts: string[] = [];
  if (resource.languages.length > 0) parts.push(resource.languages.join(" & "));
  if (resource.published_on) {
    const date = new Date(resource.published_on);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString("en-GB", { month: "short", year: "numeric" }));
    }
  }
  if (resource.embed_status === "embeddable") parts.push("Open access");
  return parts.join(" · ");
}

export function ResourceCard({ resource, index = 0, onOpen }: Props) {
  const thumbnail = thumbnailUrl(resource);
  const playable = isPlayable(resource);
  const meta = metaLine(resource);

  return (
    <article
      className={styles.card}
      style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
      data-kind={resource.kind}
    >
      <button
        type="button"
        className={styles.media}
        onClick={() => onOpen?.(resource)}
        aria-label={playable ? `Play ${resource.title}` : `Open ${resource.title}`}
      >
        {thumbnail ? (
          <img
            className={styles.thumb}
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className={styles.kindWatermark} aria-hidden="true">
            {resource.kind}
          </span>
        )}

        {/* A play triangle on something that cannot play is a small lie. */}
        <span className={styles.playRing} aria-hidden="true">
          {playable ? (
            <span className={styles.playTriangle} />
          ) : (
            <span className={styles.openGlyph}>↗</span>
          )}
        </span>

        {resource.duration_label ? (
          <span className={styles.duration}>{resource.duration_label}</span>
        ) : null}
      </button>

      <div className={styles.body}>
        {resource.format_label ? (
          <p className={styles.format}>{resource.format_label}</p>
        ) : null}
        <h3 className={styles.title}>{resource.title}</h3>
        {resource.provider ? (
          <p className={styles.source}>{resource.provider}</p>
        ) : null}

        <span className={styles.spacer} />

        <div className={styles.footer}>
          <span className={styles.meta}>{meta}</span>
          <a
            className={styles.sourceLink}
            href={resource.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(event) => event.stopPropagation()}
          >
            {playable ? "Source" : hostOf(resource.url)} ↗
          </a>
        </div>
      </div>
    </article>
  );
}
