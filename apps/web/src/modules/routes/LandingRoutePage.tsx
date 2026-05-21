"use client";

import { LandingPage } from "../landing/LandingPage";
import { useChartNavigator } from "./useChartNavigator";

export function LandingRoutePage() {
  const navigate = useChartNavigator();

  return <LandingPage onNavigate={navigate} />;
}
