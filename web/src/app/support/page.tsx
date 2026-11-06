import type { Metadata } from "next";

import { SupportPage } from "@/features/support/SupportPage";

export const metadata: Metadata = {
  title: "Bring CHART to your area · CHART",
  description:
    "CHART covers Kenya and Madhya Pradesh today. Share health data, climate or modelling work, or partner and fund to bring it to a new place.",
};

export default function Support({
  searchParams,
}: {
  searchParams: Promise<{ near?: string }>;
}) {
  return <SupportPage searchParams={searchParams} />;
}
