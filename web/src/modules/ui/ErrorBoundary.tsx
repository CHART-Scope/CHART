"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  fallback?: ReactNode;
  sectionName?: string;
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `ErrorBoundary caught error in ${this.props.sectionName ?? "section"}:`,
      error,
      info,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="error-banner" role="alert">
            <span className="error-banner-message">
              {this.props.sectionName
                ? `Something went wrong loading ${this.props.sectionName}.`
                : "Something went wrong loading this section."}
            </span>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
