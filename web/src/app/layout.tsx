import type { Metadata } from "next";

import "leaflet/dist/leaflet.css";

import "./styles.css";

export const metadata: Metadata = {
  title: "CHART",
  description: "Climate x Health Adaptation and Resilience Tool",
};

export default function RootLayout({ children }: { children?: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
