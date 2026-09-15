"use client";

import { Chip } from "@/components/Chip";
import { Modal } from "@/components/Modal";
import { embedUrl, hostOf, type LearningResource } from "@/lib/learningClient";

import styles from "./PlayerModal.module.css";

type Props = {
  resource: LearningResource | null;
  onClose: () => void;
};

/**
 * Plays a resource in a modal. Anything with no embed at all — a course page,
 * an article, a PDF — gets an outbound link instead.
 *
 * Where the source sheet never confirmed embed permission we still try:
 * YouTube enforces the uploader's own setting and shows its "Watch on
 * YouTube" panel when embedding is off, so the worst case is a one-click
 * detour rather than a missing video. The caption below says so.
 */
export function PlayerModal({ resource, onClose }: Props) {
  if (!resource) return null;
  const embed = embedUrl(resource);

  return (
    <Modal open onClose={onClose} title={resource.title} size="lg">
      <div className={styles.body}>
        {embed ? (
          <div className={styles.frame}>
            <iframe
              src={embed}
              title={resource.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <a
            className={styles.outbound}
            href={resource.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open on {hostOf(resource.url)} ↗
          </a>
        )}

        <div className={styles.chips}>
          {resource.provider ? <Chip compact>{resource.provider}</Chip> : null}
          {resource.duration_label ? (
            <Chip compact>{resource.duration_label}</Chip>
          ) : null}
          {resource.languages.map((language) => (
            <Chip key={language} compact tone="behaviour">
              {language}
            </Chip>
          ))}
        </div>

        {embed && resource.embed_status !== "embeddable" ? (
          <p className={styles.caveat}>
            Embedding was not confirmed for this one. If it does not start,{" "}
            <a href={resource.url} target="_blank" rel="noreferrer noopener">
              watch it on {hostOf(resource.url)} ↗
            </a>
            .
          </p>
        ) : null}

        {resource.objectives ? (
          <p className={styles.objectives}>{resource.objectives}</p>
        ) : null}

        {resource.audience_summary ? (
          <p className={styles.meta}>
            <span className={styles.metaLabel}>Made for</span>{" "}
            {resource.audience_summary}
          </p>
        ) : null}

        {resource.access_label ? (
          <p className={styles.attribution}>{resource.access_label}</p>
        ) : null}
      </div>
    </Modal>
  );
}
