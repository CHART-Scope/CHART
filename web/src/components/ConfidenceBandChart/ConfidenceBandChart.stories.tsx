import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ConfidenceBandChart } from ".";

const meta: Meta<typeof ConfidenceBandChart> = {
  title: "Composites/ConfidenceBandChart",
  component: ConfidenceBandChart,
};
export default meta;
type Story = StoryObj<typeof ConfidenceBandChart>;

const months = [
  "2026-10",
  "2027-01",
  "2027-07",
  "2028-01",
  "2028-07",
  "2029-01",
];

const shortTermSeries = {
  id: "af-milli",
  label: "Predicted heat-attributable LBW cases",
  color: "#7a1a4a",
  points: months.map((month, index) => ({
    x: `${month}-01`,
    y: 90 + index * 12,
    low: 90 + index * 12 - 20 - index * 6,
    high: 90 + index * 12 + 20 + index * 8,
  })),
};

export const ShortTerm: Story = {
  render: () => (
    <ConfidenceBandChart
      title="Predicted heat attributable LBW cases"
      series={[shortTermSeries]}
      yFormat={(value) => `${Math.round(value / 10)}%`}
      ariaLabel="Short-term LBW forecast"
    />
  ),
};

export const LongTermThreeScenarios: Story = {
  render: () => {
    const years = ["2031", "2036", "2041", "2046", "2051"];
    const build = (base: number, slope: number, color: string, label: string, id: string) => ({
      id,
      label,
      color,
      showBand: false,
      points: years.map((year, index) => ({
        x: `${year}-07-01`,
        y: base + slope * index,
      })),
    });
    return (
      <ConfidenceBandChart
        title="Predicted heat attributable LBW cases"
        series={[
          build(140, 12, "#4b8b3b", "Very low emissions (RCP 2.6)", "rcp26"),
          build(150, 30, "#3a6bc0", "Low emissions (RCP 4.5)", "rcp45"),
          build(160, 42, "#c04747", "High emissions (RCP 6.0)", "rcp60"),
        ]}
        yFormat={(value) => `${Math.round(value / 10)}%`}
        ariaLabel="Long-term LBW forecast, three RCP scenarios"
      />
    );
  },
};

export const Loading: Story = {
  render: () => (
    <ConfidenceBandChart
      title="Predicted heat attributable LBW cases"
      series={[]}
      loading
      ariaLabel="Loading forecast"
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <ConfidenceBandChart
      title="Predicted heat attributable LBW cases"
      series={[]}
      ariaLabel="No forecast yet"
    />
  ),
};
