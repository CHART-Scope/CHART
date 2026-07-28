import type { InputHTMLAttributes } from "react";

import styles from "./TextInput.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function TextInput({ label, id, className, ...rest }: Props) {
  return (
    <div className={styles.wrap}>
      {label && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className={[styles.input, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      />
    </div>
  );
}
