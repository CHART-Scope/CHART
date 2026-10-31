import type { Metadata } from "next";

import { ExploreApp } from "@/features/explore/ExploreApp";

export const metadata: Metadata = {
  title: "Explore · CHART",
  description:
    "Explore how heat affects low birth weight and under-five deaths, place by place, month by month and into the future.",
};

export default function ExplorePage() {
  return <ExploreApp />;
}
