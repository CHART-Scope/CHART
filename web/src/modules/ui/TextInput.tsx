import type { InputHTMLAttributes, ReactNode } from "react";

import "./TextInput.css";

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
};

export function TextInput({ className, hint, label, ...inputProps }: TextInputProps) {
  const classes = ["ui-text-input", className ?? ""].filter(Boolean).join(" ");

  return (
    <label className={classes}>
      {label ? <span className="ui-text-input-label">{label}</span> : null}
      <input {...inputProps} />
      {hint ? <small className="ui-text-input-hint">{hint}</small> : null}
    </label>
  );
}
