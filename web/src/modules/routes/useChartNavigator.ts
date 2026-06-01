"use client";

import { useRouter } from "next/navigation";

import { startKeycloakSignIn } from "../auth/authClient";
import type { ChartRoute } from "../landing/LandingPage";

export function useChartNavigator() {
  const router = useRouter();

  return (route: ChartRoute) => {
    if (route === "landing") {
      router.push("/");
      return;
    }

    if (route === "auth") {
      void startKeycloakSignIn();
      return;
    }

    router.push(`/${route}`);
  };
}
