"use client";

import { DashboardPage } from "../dashboard/DashboardPage";
import { useChartNavigator } from "./useChartNavigator";

export function DashboardRoutePage() {
  const navigate = useChartNavigator();

  return <DashboardPage onNavigate={navigate} />;
}
