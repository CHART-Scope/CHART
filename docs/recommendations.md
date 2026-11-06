# Recommendations and AI

A saved plan's actions page ranks the [action repository](actions.md) for
that plan and shows a short insight beside the ranking. Both are produced by
the Python API (`chart.recommendations`) from the published heat actions for
the plan's country; the browser only renders the answer.

## What is configurable

An administrator chooses, under **Settings → Recommendations**:

| Setting | Options |
| --- | --- |
| Ranker | **Rules** (default) or a **self-hosted classifier** |
| Insight provider | **Template** (default, no AI), **Amazon Bedrock**, **Anthropic**, **OpenAI or compatible server** |
| Model | Picked from the provider's own model list, or typed when the provider cannot list |

Credentials and endpoints are set on the API server only and never stored in
the database or sent to the browser. An option the environment does not
enable is shown disabled with the variable to set.

| Variable | Enables |
| --- | --- |
| `AWS_REGION` + instance role | Amazon Bedrock (Converse API). Needs the `chart[bedrock]` extra, which the core image installs, and IAM permission for `bedrock:InvokeModel`, `bedrock:ListFoundationModels` and `bedrock:ListInferenceProfiles`. |
| `ANTHROPIC_API_KEY` | Anthropic Messages API. |
| `OPENAI_API_KEY` | OpenAI. |
| `OPENAI_BASE_URL` | Any OpenAI-compatible server instead of OpenAI, e.g. a small model served by vLLM or Ollama on the sandbox VM (`http://<vm>:11434/v1` for Ollama). A key is optional. |
| `CHART_INSIGHT_MODELS` | Comma-separated model IDs offered when a provider cannot list its models. |
| `CHART_RECOMMENDER_URL` | The self-hosted classifier (contract below). |

On the sandbox these are read from `.env.prod` by `infra/aws/docker-compose.yml`.

## How it behaves

- **Candidates**: the published actions tagged *Extreme heat* for the plan's
  country (generic actions plus that country's own), in its wording.
- **Rules ranking** (always available). Each action scores:

  | Matches | Score |
  | --- | --- |
  | Plan's timing (before, during or after the heat season) | 4 |
  | Plan's outcome (*Low birth weight* for `lbw`, *Under-5 mortality* for `under_5_mortality`) | 3 |
  | Cost *Low* or *No additional cost* | 2 |
  | Cost *Medium* | 1 |

  The cost scores apply only when heat risk is not clearly raised. Ties keep
  feed order, and each ranked action carries its reasons. The repository is
  small and there is no record yet of what planners chose, so CHART uses
  these explicit rules rather than a trained model.
- **Classifier**: replaces only the order. The rule reasons are still shown.
  If the classifier errors or times out, the rules order is returned with a
  note saying so.
- **Insight**: the template unless a provider and model are chosen. The model
  receives only the plan's figure, risk reading, timing and the ranked
  actions, and is told to use nothing else. Any provider failure returns the
  template with a note. A generated insight is stored on the plan and reused
  until the provider, model or ranking changes, so page views do not call the
  model again.
- The figures and the ranking never depend on the insight.

Every settings change writes a `recommendation_settings_changed` audit event
with the values before and after.

## Classifier contract

A classifier is any HTTP service, for example a small scikit-learn or
gradient-boosted model behind FastAPI on the sandbox VM. CHART calls:

```
POST {CHART_RECOMMENDER_URL}/rank
{
  "plan": {"outcome": "lbw", "country_code": "KE", "risk_level": "possible",
           "timing": "before", "percent": 4.2, "ratio": {...} | null},
  "candidates": [{"id": "rec...", "title": "...", "seasons": ["before", "during"],
                  "cost_level": "Low", "health_outcomes": ["Low birth weight"],
                  "target_populations": ["Pregnant women"],
                  "action_types": ["..."], "departments": ["Health"]}]
}
→ 200 {"model": "recommender-v1", "scores": {"<candidate id>": 0.82, ...}}
```

Higher scores rank first; candidates without a score rank last. The returned
`model` is shown on the page as provenance.

## Towards a trained or fine-tuned model

The rules ranking is the baseline any classifier must beat. To curate
training data, record for each saved plan which recommended actions planners
open, assign and complete (action progress is held in the browser today and
would first need to be stored by the API). Those labels, with the plan
features above, train a classifier served behind the contract. The same data,
with reviewed example insights, can fine-tune a small language model served
through `OPENAI_BASE_URL`; no CHART code changes are needed to switch to it.
