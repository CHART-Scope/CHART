import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: "A Halal Chinese Restaurant on Caledonian Road",
  description: "Content studio for CHART solution repository records",
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
