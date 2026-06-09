"use client";

import { useState } from "react";

import "./ErrorBanner.css";

type ErrorBannerProps = {
  message: string;
  dismissable?: boolean;
};

export function ErrorBanner({ message, dismissable = true }: ErrorBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-message">{message}</span>
      {dismissable ? (
        <button
          className="error-banner-dismiss"
          type="button"
          aria-label="Dismiss"
          onClick={() => setIsDismissed(true)}
        >
          &#10005;
        </button>
      ) : null}
    </div>
  );
}
