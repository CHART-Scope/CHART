"use client";

import { useRouter } from "next/navigation";

import type { ChartRoute } from "../landing/LandingPage";

export function useChartNavigator() {
  const router = useRouter();

  return (route: ChartRoute) => {
    if (route === "landing") {
      router.push("/");
      return;
    }

    router.push(`/${route}`);
  };
}
