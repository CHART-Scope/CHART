import { KpiCard } from "../ui/KpiCard";
import { getKpiMetrics } from "./dashboardMockData";

type DashboardKpiRowProps = {
  geographyId?: string;
};

export function DashboardKpiRow({ geographyId }: DashboardKpiRowProps) {
  const metrics = getKpiMetrics(geographyId);

  return (
    <section className="dashboard-kpi-row">
      {metrics.map((metric) => (
        <KpiCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          detail={metric.detail}
          trend={metric.trend}
          accentColor={metric.accentColor}
        />
      ))}
    </section>
  );
}
