import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuditRuntime } from "@/lib/audit/AuditRuntime";

import "../styles/tokens.css";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "CHART — Climate & Health Adaptation and Resilience Tool",
  description: "CHART planning workspace for traceable climate and health predictions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuditRuntime />
        {children}
      </body>
    </html>
  );
}
