import { useLayoutEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IconSprite } from "@/components/Icon";
import { HeatLbwLinkPanel } from "./HeatLbwLinkPanel";

const meta = {
  title: "Dashboard/MonthlyRiskFlow",
  component: HeatLbwLinkPanel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof HeatLbwLinkPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Deterministic lifecycle fixtures: no worker, credentials, or network required. */
function Flow({
  failFirst = false,
  zero = false,
}: {
  failFirst?: boolean;
  zero?: boolean;
}) {
  const [month, setMonth] = useState("2026-04");
  const [completed, setCompleted] = useState(0);
  useLayoutEffect(() => {
    const original = globalThis.fetch;
    let submissions = 0;
    let polls = 0;
    let ready = zero;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/risk/flow-test/monthly")) {
        return json({
          admin_unit_id: 1,
          admin_unit_code: "flow-test",
          months: {
            "2026-04": {
              temperature: {
                tmax_monthly_mean_c: 32,
                unit: "C",
                source_name: "Test fixture",
                climate_run_id: 1,
                data_label: "reanalysis",
              },
              // Climate/impact data alone must not suppress a missing prediction.
              health_impacts: [{ attributable_fraction_milli: 200 }],
              prediction: ready
                ? {
                    request_id: 42,
                    attributable_fraction_milli: zero ? 0 : 200,
                    odds_ratio: zero ? 1 : 1.25,
                    reference_temperature_c: 28,
                    reference_kind: null,
                    ci95_low: 1.1,
                    ci95_high: 1.5,
                    on_training_support: true,
                    warning: null,
                    model_version: "fixture",
                    input_statistic: "tmax_monthly_mean",
                    fraction_method: "attributable_fraction",
                    attributable_fraction_policy: "positive_excess_only",
                  }
                : null,
            },
          },
        });
      }
      if (url.endsWith("/climate/predict")) {
        submissions += 1;
        return json({ request_id: 42, status: "queued" });
      }
      if (url.endsWith("/prediction-requests/42")) {
        if (failFirst && submissions === 1)
          return json({
            request_id: 42,
            status: "failed",
            stage: "failed",
            error_code: "LBW_SERVICE_UNAVAILABLE",
          });
        polls += 1;
        ready = (failFirst && submissions > 1) || polls >= 2;
        return json({
          request_id: 42,
          status: ready ? "completed" : "running",
          stage: ready ? "completed" : polls === 1 ? "queued" : "preparing_climate",
        });
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  }, [failFirst, zero]);

  return (
    <div style={{ maxWidth: 800 }}>
      <IconSprite />
      <p role="status">Completed result notifications: {completed}</p>
      <HeatLbwLinkPanel
        placeLabel="Test area"
        geographyId="flow-test"
        accessToken="fixture"
        month={month}
        onMonthChange={setMonth}
        canPrepare
        onPredictionReady={() => setCompleted(1)}
      />
    </div>
  );
}

export const MissingPredictionCompletes: Story = {
  args: { placeLabel: "Test area" },
  render: () => <Flow />,
};
export const FailedRequestCanRetry: Story = {
  args: { placeLabel: "Test area" },
  render: () => <Flow failFirst />,
};

export const NoAttributableCases: Story = {
  args: { placeLabel: "Test area" },
  render: () => <Flow zero />,
};
