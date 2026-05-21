"use client";

import { CmsPage } from "../cms/CmsPage";
import { useChartNavigator } from "./useChartNavigator";

export function CmsRoutePage() {
  const navigate = useChartNavigator();

  return <CmsPage onNavigate={navigate} />;
}
