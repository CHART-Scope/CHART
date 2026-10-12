"use client";

import { useRef, useState } from "react";

import styles from "./DashboardPreview.module.css";

const screenshots = [
  {
    id: "dashboard",
    label: "Dashboard",
    alt: "CHART dashboard showing low birth weight risk across Madhya Pradesh, India",
    width: 2586,
    height: 1502,
  },
  {
    id: "health-risks",
    label: "Health risks",
    alt: "CHART health risk and prevention details for Bhopal Division",
    width: 1936,
    height: 1420,
  },
  {
    id: "precision",
    label: "Precision",
    alt: "CHART explanation of how precision is assessed for a health risk estimate",
    width: 2592,
    height: 1504,
  },
];

export function DashboardPreview() {
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = screenshots[selected];

  return (
    <figure className={styles.preview} aria-label="CHART dashboard previews">
      <div className={styles.fan}>
        {screenshots.map((screenshot, index) => (
          <button
            key={screenshot.id}
            type="button"
            className={styles.card}
            data-position={index}
            data-selected={selected === index}
            aria-label={`Enlarge ${screenshot.label.toLowerCase()} screenshot`}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => {
              setSelected(index);
              dialog.current?.showModal();
            }}
          >
            <span className={styles.cardLabel}>
              {screenshot.label}
              <span aria-hidden="true">↗</span>
            </span>
            <img
              src={`/previews/${screenshot.id}.png`}
              alt={screenshot.alt}
              width={screenshot.width}
              height={screenshot.height}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
          </button>
        ))}
      </div>
      <div
        className={styles.controls}
        role="group"
        aria-label="Choose dashboard preview"
      >
        {screenshots.map((screenshot, index) => (
          <button
            key={screenshot.id}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {screenshot.label}
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="dashboard-preview-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.dialogHeader}>
          <h2 id="dashboard-preview-title">{current.label}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close dashboard preview"
          >
            ×
          </button>
        </div>
        <img
          src={`/previews/${current.id}.png`}
          alt={current.alt}
          width={current.width}
          height={current.height}
        />
      </dialog>
    </figure>
  );
}
