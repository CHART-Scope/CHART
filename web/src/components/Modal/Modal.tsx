"use client";

import { useEffect, type ReactNode } from "react";

import styles from "./Modal.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Explicit card width preset — overrides `wide`. */
  size?: "sm" | "md" | "lg";
  /**
   * Strip the default chrome (padding, built-in close button, title/description
   * block). Use when the caller wants to render an edge-to-edge custom header
   * or a fully bespoke layout inside the card.
   */
  bare?: boolean;
  children?: ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  wide,
  size,
  bare,
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={[
          styles.card,
          size ? styles[`size_${size}`] : wide ? styles.wide : "",
          bare ? styles.bare : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {!bare && (
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        )}
        {!bare && title && <div className={styles.title}>{title}</div>}
        {!bare && description && <p className={styles.desc}>{description}</p>}
        {children}
        {!bare && footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
