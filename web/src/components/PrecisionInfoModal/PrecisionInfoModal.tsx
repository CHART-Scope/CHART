"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import {
  HIGH_CI_RATIO_MAX,
  MODERATE_CI_RATIO_MAX,
  type PrecisionLevel,
} from "@/lib/precision";

import styles from "./PrecisionInfoModal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  activeLevel?: PrecisionLevel;
};

type Row = {
  level: PrecisionLevel;
  title: string;
  threshold: string;
  caption: string;
  body: string;
};

const ROWS: readonly Row[] = [
  {
    level: "high",
    title: "HIGH precision",
    threshold: `CI ratio ≤ ${HIGH_CI_RATIO_MAX}`,
    caption: "No indication of substantial imprecision",
    body: "The confidence interval is relatively narrow, indicating limited uncertainty around the effect estimate.",
  },
  {
    level: "moderate",
    title: "MODERATE precision",
    threshold: `CI ratio > ${HIGH_CI_RATIO_MAX} and ≤ ${MODERATE_CI_RATIO_MAX}`,
    caption: "Potential imprecision",
    body: "The confidence interval is wider, indicating greater uncertainty around the effect estimate.",
  },
  {
    level: "low",
    title: "LOW precision",
    threshold: `CI ratio > ${MODERATE_CI_RATIO_MAX}`,
    caption: "Imprecise / wide confidence interval",
    body: "The confidence interval is very wide, indicating substantial uncertainty. The point estimate should be interpreted with caution.",
  },
];

type Reference = {
  authors: string;
  year: string;
  title: string;
  journal: string;
  doi?: string;
};

const REFERENCES: readonly Reference[] = [
  {
    authors: "Poole C.",
    year: "2001",
    title: "Low P-values or narrow confidence intervals: which are more durable?",
    journal: "Epidemiology. 12(3):291–294.",
    doi: "10.1097/00001648-200105000-00005",
  },
  {
    authors: "Burns CJ, McIntosh LJ, Mink PJ, Jurek AM, Li AA.",
    year: "2013",
    title:
      "Pesticide Exposure and Neurodevelopmental Outcomes: Review of the Epidemiologic and Animal Studies.",
    journal:
      "Journal of Toxicology and Environmental Health, Part B: Critical Reviews. 16(3–4):127–283.",
    doi: "10.1080/10937404.2013.783383",
  },
  {
    authors: "Murad MH, Tomlinson GA, Brignardello-Petersen R, Wang Z, Lin L.",
    year: "2025",
    title:
      "Confidence intervals of the relative risk and odds ratio can predict when the optimal information size in a meta-analysis is not met.",
    journal: "Journal of Clinical Epidemiology. 179:111653.",
  },
  {
    authors: "Guyatt GH, Oxman AD, Kunz R, et al.",
    year: "2011",
    title: "GRADE guidelines 6. Rating the quality of evidence—imprecision.",
    journal: "Journal of Clinical Epidemiology. 64(12):1283–1293.",
    doi: "10.1016/j.jclinepi.2011.01.012",
  },
  {
    authors: "Zeng L, Brignardello-Petersen R, Hultcrantz M, et al.",
    year: "2022",
    title:
      "GRADE Guidance 34: update on rating imprecision using a minimally contextualized approach.",
    journal: "Journal of Clinical Epidemiology. 150:216–224.",
  },
  {
    authors: "Schünemann HJ, Neumann I, Hultcrantz M, et al.",
    year: "2022",
    title:
      "GRADE guidance 35: update on rating imprecision for assessing contextualized certainty of evidence and making decisions.",
    journal: "Journal of Clinical Epidemiology. 150:225–242.",
    doi: "10.1016/j.jclinepi.2022.07.015",
  },
];

function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}

export function PrecisionInfoModal({ open, onClose, activeLevel }: Props) {
  const [litOpen, setLitOpen] = useState(false);
  return (
    <Modal open={open} onClose={onClose} bare size="md">
      <header className={styles.header}>
        <div className={styles.headerBadge} aria-hidden>
          <Icon name="info-circle" />
        </div>
        <h2 className={styles.headerTitle}>How we assess precision</h2>
        <button
          type="button"
          className={styles.headerClose}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <div className={styles.body}>
        <p className={styles.intro}>
          <strong>Precision</strong> tells you how much uncertainty surrounds an effect
          estimate — it&apos;s the width of the 95% confidence interval (CI). Narrower
          CIs mean more precision; wider CIs mean less.
        </p>

        <section className={styles.formulaCard}>
          <span className={styles.eyebrow}>We measure it with the CI ratio</span>
          <p className={styles.formula}>CI ratio = upper CI ÷ lower CI</p>
          <p className={styles.formulaNote}>
            A simple way to capture how wide the interval is, relative to itself. The
            higher the ratio, the less precise the estimate.
          </p>
        </section>

        <span className={styles.eyebrow}>Classification</span>

        <ul className={styles.list} data-has-active={activeLevel || undefined}>
          {ROWS.map((row) => (
            <li
              key={row.level}
              className={styles.row}
              data-level={row.level}
              data-active={row.level === activeLevel || undefined}
              data-dim={activeLevel && row.level !== activeLevel ? "" : undefined}
            >
              <div className={styles.rowHead}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.pill}>{row.threshold}</span>
              </div>
              <p className={styles.rowCaption}>{row.caption}</p>
              <p className={styles.rowBody}>{row.body}</p>
            </li>
          ))}
        </ul>

        <aside className={styles.callout}>
          <span className={styles.calloutIcon} aria-hidden>
            <Icon name="info-circle" />
          </span>
          <p className={styles.calloutText}>
            <strong>Precision ≠ statistical significance.</strong> An estimate can be
            precise but not statistically significant — or significant but still
            imprecise.
          </p>
        </aside>

        <section className={styles.literature}>
          <button
            type="button"
            className={styles.literatureToggle}
            onClick={() => setLitOpen((v) => !v)}
            aria-expanded={litOpen}
          >
            <span className={styles.literatureLabel}>
              <Icon name="book" />
              Supporting literature
            </span>
            <span className={styles.literatureMeta}>
              <span className={styles.literatureCount}>{REFERENCES.length}</span>
              <span
                className={styles.literatureChevron}
                data-open={litOpen || undefined}
                aria-hidden
              >
                <Icon name="chevron-down" />
              </span>
            </span>
          </button>
          {litOpen ? (
            <ol className={styles.refList}>
              {REFERENCES.map((ref, idx) => (
                <li key={idx} className={styles.refItem}>
                  <span className={styles.refIndex}>{idx + 1}.</span>
                  <span className={styles.refBody}>
                    <span className={styles.refAuthors}>{ref.authors}</span> ({ref.year}
                    ). {ref.title} <em>{ref.journal}</em>
                    {ref.doi ? (
                      <>
                        {" "}
                        <a
                          href={doiUrl(ref.doi)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.refLink}
                        >
                          doi.org/{ref.doi}
                        </a>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
