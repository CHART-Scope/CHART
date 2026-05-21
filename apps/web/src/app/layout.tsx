import type { Metadata } from "next";

import "leaflet/dist/leaflet.css";

import { ChartContentProvider } from "./ChartContentProvider";
import "./styles.css";

export const metadata: Metadata = {
  title: "CHART",
  description: "Climate Health Adaptation Resource Toolkit",
};

export default function RootLayout({ children }: { children?: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ChartContentProvider>{children}</ChartContentProvider>
      </body>
    </html>
  );
}
