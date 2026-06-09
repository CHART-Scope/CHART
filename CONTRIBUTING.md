# Contributing to CHART

CHART is a monorepo for the climate-health planning platform. Contributions
should keep the web app, Fastify API, and CHART repository service clearly
separated.

## Repository Structure

- `web/`: Next web app for the public site, onboarding, dashboards, map UI, and
  public CHART repository views.
- `api/`: Fastify API for auth, role/geography context, workspaces, and public
  CHART repository reads.
- `chart-repository/`: standalone Payload CMS and public repository API for
  published CHART repository data.
- `data/`: ignored local seed/import outputs. Do not rely on files here for
  deployed code.
- `docs/`: ignored local planning notes.

The root package is a workspace controller. It is not a Next app.

## Branches and Pull Requests

- Use `dev` as the integration branch.
- Open pull requests against `dev` unless maintainers ask for a different base.
- Keep pull requests focused on one change set.
- Include a short summary, the important changes, and the testing performed.
- Do not commit generated local outputs from `data/` or local planning notes
  from `docs/`.
- Do not mix unrelated refactors with feature or bug-fix work.

## Local Setup

Install dependencies and run the full local setup:

```bash
make install
make all
```

Start the local app:

```bash
make run
```

Open `http://127.0.0.1:3100`.

## Validation

Run checks that match the area you changed.

For frontend changes:

```bash
make web-typecheck
make web-build
```

For Storybook changes:

```bash
make web-storybook-build
```

For backend changes:

```bash
make api-test
make api-build
```

For broad repo changes:

```bash
make format-check
```

Use `make verify` before merging broad changes that touch more than one app.

## Code Guidelines

- Keep app boundaries clear. Do not import from `chart-repository/` into `api/`
  or `web/`.
- Keep route handlers thin. Put backend behavior in service functions.
- Keep UI components focused and use simple props/state first.
- Prefer named exports over default exports.
- Prefer small, testable files over large multi-purpose files.
- Add dependencies only when there is a clear need.
- Keep public content and CHART repository views accessible without login.
- Do not make CHART core depend on Payload CMS internals.

## Data and Assets

- Treat `data/` as local, ignored workspace output.
- If an image or asset must appear in Storybook or GitHub Pages, place it in a
  tracked web asset path.
- Keep attribution and license metadata with imported seed or repository data
  when it is available.

## Security and Privacy

- Do not commit secrets, tokens, credentials, private keys, or personal data.
- Keep auth, role, and geography behavior explicit in tests when changing those
  flows.
- Report suspected security issues privately to project maintainers rather than
  opening a public issue.
