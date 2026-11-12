# Action repository

The action repository is the set of reviewed actions CHART recommends: what
to do about a climate-health risk, who does it, when, at what cost, and the
evidence behind it. It appears on the dashboard (**Recommended actions**),
on its own page (**See all recommended actions**) and in Explore (**Act on
it**); a saved plan opens it on the plan's season.

## How planners see them

- **Dashboard:** actions sit in three columns, before, during and after the
  heat season, from each action's **Season** field. An action tagged with
  several seasons appears in each column. Each card shows its first
  department and its status.
- **See all recommended actions** has two views, switched beside the title
  and kept in the URL (`view=gantt`):
  - **List:** one card per action. Filters cover department, intervention
    type, cost, timeframe (`season=`) and status.
  - **Gantt chart:** the same actions on the place's 12-month planning
    cycle. Its before, during and after months come from the place's
    [heat-season calendar](#heat-season-calendars); the cycle starts at the
    first preparation month and each card spans its first to last season.
    If the calendar cannot load, the cycle falls back to India's official
    season. A line marks today, and the footnote links to the settings.

## Heat-season calendars

Settings → **Heat seasons** (administrators) sets, for every place, which
calendar months are before (preparation), during (response) and after
(review) the heat season, or outside the cycle. Pick a phase, click months to
paint them and **Save**; the preview shows the strip the Gantt chart will
draw from this month on.

- Stored in `heat_season_setting` (migration 033) as twelve letters from
  January: `b`, `d`, `a` or `o`. Read from the first preparation month they
  must run before, during, after, then off, with at least one during month.
- A place without its own calendar inherits its nearest ancestor's (a
  district its state's), and a country without one uses its official season
  from `chart/climate/heat_seasons.json` with the four months before it as
  preparation and the rest as review. **Use <parent>** drops a place's own
  calendar so it inherits again.
- `GET /heat-seasons` and `GET /heat-seasons/{geography_id}` are open to
  dashboard readers for places in their scope; `PUT` and `DELETE` are for
  `chart_admin` and write a `heat_season_changed` audit event.

## How actions get from curators to the app

```
Airtable base                 GitHub Action               Public S3 bucket            CHART API
"CHART actions"  ──────────▶  publish-actions.yml  ────▶  chart-actions-   ──────▶  GET /actions
(editing, review)  Published  (holds the token)           repository/v1/            (cache, fallback)
                   rows only                              actions.json, images/
```

1. **Curators edit in Airtable.** A row reaches the app only when its
   **Status** is **Published**. Draft and Declined rows never leave Airtable.
2. **The publisher copies Published rows to a public file.** It runs hourly,
   on demand, or when Airtable asks it to (below). It writes only the
   allowed fields to the feed.
3. **The app reads that public file.** It needs no Airtable account or key.
   Anyone who runs CHART gets the same actions, and can point it at their
   own file instead.

The public feed:
<https://chart-actions-repository.s3.eu-north-1.amazonaws.com/v1/actions.json>

## What curators need to know

- **Publish:** set **Status** to **Published**. The app shows the change
  within about an hour, or at once if someone runs the workflow (below).
  Allow up to 5 minutes more for the API's cache.
- **Unpublish:** set **Status** to **Draft** or **Declined**. The action
  disappears at the next publish.
- **Country:**
  - Rows in **Generic actions** apply everywhere.
  - Rows in **India-only actions** and **Kenya-only actions** apply only
    there.
  - On a generic row, the **India - …** and **Kenya - …** columns replace the
    generic description, rationale, cost reasoning, departments and
    stakeholders for places in that country.
- **Writing text:** use plain text.
  - A blank line starts a new paragraph.
  - Lines starting with `•`, `-` or `1.` become a list.
  - In **References** and **Case studies**, put one per line as
    `Citation: https://…`.
- **Timing:** **Year-round** counts for before, during and after the heat
  season.
- **Images:** attach them to **Image**. They are copied to S3, because
  Airtable's own links expire after a few hours.
- **Never published:** **Contact email**, **Submitted by**, **Organisation**,
  **Note to reviewers** and **Other stakeholders (free text)**. They stay in
  Airtable.

The publisher refuses to publish a feed with no actions, so unpublishing
every row by mistake does not empty the app.

## Running the publisher

### From GitHub (normal)

**Actions → Publish actions → Run workflow** publishes immediately. The same
workflow runs every hour. If nothing changed since the live feed, it uploads
nothing. Each run keeps the feed it built as a downloadable artifact.

It needs, once (see [one-time setup](#one-time-setup)):

| Where | Name | What |
| --- | --- | --- |
| Repository secret | `AIRTABLE_TOKEN` | Airtable personal access token: scope `data.records:read`, access to the actions base only |
| Repository variable | `AWS_ACTIONS_PUBLISH_ROLE_ARN` | IAM role the workflow assumes to write `s3://chart-actions-repository/v1/*` |

### From a laptop

```bash
export AIRTABLE_TOKEN=...      # read-only token, never committed
make actions-publish           # needs AWS credentials that can write the bucket
make actions-snapshot          # refresh the copy bundled with the API, then commit it
```

`make actions-snapshot` writes `core/chart/actions/actions.json`. The API
uses that copy when the public feed cannot be read. Refresh it when the
published actions change meaningfully.

## How the app reads the feed

The API (`core/chart/actions/feed.py`) reads `CHART_ACTIONS_URL`:

| `CHART_ACTIONS_URL` | Effect |
| --- | --- |
| unset | The CHART public feed above |
| a URL | Your own feed, in the format below |
| empty | Only the bundled copy, no network |

- The feed is cached for `CHART_ACTIONS_CACHE_SECONDS` (default 300).
- If the feed cannot be read, or fails validation, the API keeps serving the
  last good copy. Before any good read, it serves the bundled copy. Either
  way it retries after the cache period.
- `GET /actions` reports which copy it served (`source`: `feed` or
  `bundled`) and the feed's `published_at`.

`GET /actions?geography=<id>` returns the actions for that place's country,
in that country's wording. Without a geography it returns every action with
the generic wording. The endpoint is public, like the feed. An unknown
geography gets `404 GEOGRAPHY_NOT_FOUND`.

## Feed format (schema version 1)

`core/chart/actions/schemas.py` is the authoritative definition. A feed
containing any field not listed below fails validation and is not served.

```json
{
  "schema_version": 1,
  "published_at": "2026-11-06T10:00:00+00:00",
  "source": "CHART actions (Airtable)",
  "actions": [
    {
      "id": "reczqjV8AXlBqBXD7",
      "title": "Provide pregnancy-specific heat health counselling to pregnant women",
      "summary": "…",
      "description": "Plain text; blank lines and •/1. lists as above",
      "countries": [],
      "hazards": ["Extreme heat"],
      "health_outcomes": ["Low birth weight", "Preterm birth"],
      "target_populations": ["Pregnant women"],
      "action_types": ["Behaviour change and communication"],
      "levels": ["Community"],
      "seasons": ["before", "during"],
      "departments": ["Health"],
      "stakeholders": ["Community health worker"],
      "cost_level": "Low",
      "cost_reasoning": "…",
      "rationale": "…",
      "expected_outcomes": "One outcome per line",
      "decision_trigger": "…",
      "trigger_sources": ["Met service heat alert"],
      "references": [{"citation": "WHO India, Beat the heat", "url": "https://…"}],
      "case_studies": [],
      "images": [{"url": "https://…/images/att123.png", "filename": "kit.png"}],
      "by_country": {
        "KE": {"stakeholders": ["CHP", "CHA"], "departments": ["Ministry of Health; county health departments"]}
      }
    }
  ]
}
```

- `countries`: ISO 3166-1 alpha-2 codes; empty means every country.
- `seasons`: `before`, `during` and/or `after` the heat season.
- `cost_level`: one of `No additional cost`, `Low`, `Medium`, `High`,
  `Variable`, or `null` when not yet assessed.
- `by_country`: may set `description`, `rationale`, `cost_reasoning`,
  `departments` and `stakeholders`.
- **Self-hosting:** to run CHART with your own actions, produce a file in
  this format (from any tool) and set `CHART_ACTIONS_URL`. To reuse the
  publisher with your own Airtable base, copy the base's structure and set
  `AIRTABLE_BASE_ID`.

## What is stored where on S3

Bucket `chart-actions-repository` (`eu-north-1`). It holds only the action
repository, so its public read never exposes anything else. The publisher's
`--bucket`, `--region` and `--prefix` options change where it writes.

| Key | Written | Purpose |
| --- | --- | --- |
| `v1/actions.json` | Last, on each change | The live feed (`Cache-Control: max-age=300`) |
| `v1/archive/<published_at>.json` | Before the live file | Every version published, for audit or rollback |
| `v1/images/<attachment id>.<ext>` | First | Copies of Airtable images |

`v1` is the feed's schema version. A future, incompatible format would be
published beside it under `v2/`, so existing installs keep working.

**Rolling back:** copy an archive file over `v1/actions.json`.

## One-time setup

Replace `<ACCOUNT_ID>` below with the AWS account number (top right of the
AWS console). Every step can be done in the console or with the AWS CLI.

### 1. Create the bucket

```bash
aws s3api create-bucket --bucket chart-actions-repository --region eu-north-1 \
  --create-bucket-configuration LocationConstraint=eu-north-1
```

In the console: **S3 → Create bucket**, name `chart-actions-repository`,
region **Europe (Stockholm) eu-north-1**, keep **ACLs disabled**, defaults
for the rest.

### 2. Let anyone read it

The feed is public by design. Allow a bucket policy to grant public reads:

```bash
aws s3api put-public-access-block --bucket chart-actions-repository \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
```

In the console: **Permissions → Block public access → Edit**. Untick the two
"bucket policies" options and keep the two "ACLs" options ticked.

Then add the bucket policy. It allows reading and listing, and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadActionRepository",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::chart-actions-repository/*"
    },
    {
      "Sid": "PublicListActionRepository",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::chart-actions-repository"
    }
  ]
}
```

```bash
aws s3api put-bucket-policy --bucket chart-actions-repository --policy file://bucket-policy.json
```

Listing lets people browse the archive. Leave out the second statement if
you would rather not allow it.

Optionally turn on **Bucket Versioning** (Properties → Bucket Versioning).
It keeps every overwritten `actions.json` even if the archive copy is
deleted.

### 3. Let GitHub sign in to AWS without stored keys

Skip this if the account already has the GitHub provider (**IAM → Identity
providers** lists `token.actions.githubusercontent.com`).

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

In the console: **IAM → Identity providers → Add provider → OpenID
Connect**, URL `https://token.actions.githubusercontent.com`, audience
`sts.amazonaws.com`.

### 4. Create the role the workflow uses

Trust policy: only workflows in this repository may assume the role.
Save it as `trust.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
      "StringLike": {"token.actions.githubusercontent.com:sub": "repo:CHART-Scope/CHART:*"}
    }
  }]
}
```

Permissions: write files under `v1/` in this bucket only. Save it as
`publish.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::chart-actions-repository/v1/*"
  }]
}
```

```bash
aws iam create-role --role-name chart-actions-publisher \
  --assume-role-policy-document file://trust.json
aws iam put-role-policy --role-name chart-actions-publisher \
  --policy-name publish-action-repository --policy-document file://publish.json
aws iam get-role --role-name chart-actions-publisher --query Role.Arn --output text
```

In the console: **IAM → Roles → Create role → Web identity**, provider
`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. Then
add the permission policy above as an inline policy, and edit the trust
policy to match `trust.json`.

### 5. Configure GitHub

```bash
gh secret set AIRTABLE_TOKEN --repo CHART-Scope/CHART          # paste the token when asked
gh variable set AWS_ACTIONS_PUBLISH_ROLE_ARN --repo CHART-Scope/CHART \
  --body arn:aws:iam::<ACCOUNT_ID>:role/chart-actions-publisher
```

### 6. Publish and check

```bash
gh workflow run publish-actions.yml --repo CHART-Scope/CHART
gh run watch --repo CHART-Scope/CHART      # pick the Publish actions run
curl -s https://chart-actions-repository.s3.eu-north-1.amazonaws.com/v1/actions.json | head -c 300
```

The deployed app picks the feed up within 5 minutes, with no redeploy. It
reads this URL by default.

### Optional: publish the moment a row is published

In Airtable, add an automation:

- **Trigger:** "When record matches conditions", Status is Published, on
  each of the three tables.
- **Action:** "Run script". The script `POST`s to
  `https://api.github.com/repos/CHART-Scope/CHART/dispatches` with body
  `{"event_type": "publish-actions"}`.
- **Credentials:** a GitHub fine-grained token with **Contents: read and
  write** on this repository only, stored as an Airtable automation secret.

Without the automation, the hourly run picks changes up.
