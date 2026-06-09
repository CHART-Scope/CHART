import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: "CHART repository administration",
  description: "Content studio for CHART repository records",
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
