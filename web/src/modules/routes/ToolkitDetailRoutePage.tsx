"use client";

import type { LandingResourceId } from "../../content/landing";
import { ToolkitDetailPage } from "../landing/ToolkitDetailPage";
import { useChartNavigator } from "./useChartNavigator";

type ToolkitDetailRoutePageProps = {
  resourceId: LandingResourceId;
};

export function ToolkitDetailRoutePage({ resourceId }: ToolkitDetailRoutePageProps) {
  const navigate = useChartNavigator();

  return <ToolkitDetailPage resourceId={resourceId} onNavigate={navigate} />;
}
