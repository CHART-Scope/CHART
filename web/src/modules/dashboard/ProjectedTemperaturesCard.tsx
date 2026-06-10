"use client";

import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DataCard } from "../ui/DataCard";
import { getClimateProjections } from "./dashboardMockData";

type ProjectedTemperaturesCardProps = {
  geographyId?: string;
};

export function ProjectedTemperaturesCard({
  geographyId,
}: ProjectedTemperaturesCardProps) {
  const data = getClimateProjections(geographyId);

  return (
    <DataCard eyebrow="Climate trend" title="Projected peak temperatures">
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: "var(--ink-mute)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              domain={[36, 52]}
              tick={{ fontSize: 12, fill: "var(--ink-mute)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${value}\u00B0`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
                fontSize: "0.82rem",
              }}
              formatter={(value: unknown, name: unknown) => [
                `${value}\u00B0C`,
                name === "historical" ? "Historical" : "Projected",
              ]}
              labelFormatter={(label: unknown) => `Year ${label}`}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="line"
              wrapperStyle={{ fontSize: "0.78rem", paddingBottom: "0.5rem" }}
            />
            <Line
              type="monotone"
              dataKey="historical"
              name="Historical"
              stroke="var(--green-dark)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--green-dark)" }}
              connectNulls={false}
              animationDuration={800}
            />
            <Line
              type="monotone"
              dataKey="projected"
              name="Projected"
              stroke="var(--red)"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3, fill: "var(--red)" }}
              connectNulls={false}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DataCard>
  );
}
