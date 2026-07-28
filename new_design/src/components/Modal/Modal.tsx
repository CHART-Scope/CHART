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
  children?: ReactNode;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  wide,
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
        className={[styles.card, wide ? styles.wide : ""].filter(Boolean).join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {title && <div className={styles.title}>{title}</div>}
        {description && <p className={styles.desc}>{description}</p>}
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
