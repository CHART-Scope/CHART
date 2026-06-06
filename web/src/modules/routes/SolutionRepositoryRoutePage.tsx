"use client";

import { SolutionRepositoryPage } from "../solutions/SolutionRepositoryPage";
import { useChartNavigator } from "./useChartNavigator";

export function SolutionRepositoryRoutePage() {
  const navigate = useChartNavigator();

  return <SolutionRepositoryPage onNavigate={navigate} />;
}
