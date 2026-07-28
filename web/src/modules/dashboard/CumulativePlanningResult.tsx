import type { LbwPrediction } from "../../lib/predictionClient";

export function CumulativePlanningResult({
  prediction,
}: {
  prediction: LbwPrediction | null;
}) {
  if (!prediction) return null;

  const difference = Math.round(Math.abs(prediction.odds_ratio - 1) * 100);
  const direction = prediction.odds_ratio >= 1 ? "higher" : "lower";
  const crossesOne = prediction.ci95_low <= 1 && prediction.ci95_high >= 1;
  const signalTitle = crossesOne
    ? "Possible change, but uncertain"
    : prediction.odds_ratio > 1
      ? "Higher-odds signal"
      : prediction.odds_ratio < 1
        ? "Lower-odds signal"
        : "No change from the reference";

  return (
    <section
      className="cumulative-planning-result"
      aria-label="Cumulative planning result"
    >
      <div className="cumulative-result-heading">
        <div>
          <span>Planning result</span>
          <strong>Is there a low-birth-weight concern?</strong>
        </div>
        <small>One cumulative result for the selected three-month period.</small>
      </div>

      <div className="cumulative-result-layout">
        <div className="cumulative-result-signal">
          <span>{signalTitle}</span>
          <strong>{difference}%</strong>
          <small>{direction} odds than the model&apos;s reference temperature</small>
        </div>

        <div className="cumulative-result-details">
          <dl>
            <div>
              <dt>Odds ratio</dt>
              <dd>{prediction.odds_ratio.toFixed(2)}×</dd>
            </div>
            <div>
              <dt>95% confidence interval</dt>
              <dd>
                {prediction.ci95_low.toFixed(2)}–{prediction.ci95_high.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Reference temperature</dt>
              <dd>{prediction.reference_temperature_c.toFixed(1)}°C</dd>
            </div>
          </dl>
          <p data-uncertain={crossesOne}>
            {crossesOne
              ? "The interval includes 1, so the model does not show a clear increase or decrease."
              : `The full interval stays ${prediction.odds_ratio >= 1 ? "above" : "below"} 1, so the direction is clear in this model result.`}
          </p>
        </div>
      </div>

      <div className="cumulative-result-guide">
        <strong>Quick guide</strong>
        <span>1.00× = same odds as the reference</span>
        <span>1.10× = 10% higher odds</span>
        <span>0.90× = 10% lower odds</span>
        <small>
          This is a population-level association, not an individual diagnosis or a count
          of affected births.
        </small>
      </div>

      {prediction.warning ? (
        <p className="cumulative-result-warning">{prediction.warning}</p>
      ) : null}
    </section>
  );
}
