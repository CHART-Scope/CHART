# Contributing

Thank you for contributing to CHART.

## How to Contribute

- Open an issue or discussion for larger changes before starting work.
- Keep pull requests focused and easy to review.
- Include a clear summary of what changed and why.
- Add or update tests when behavior changes.
- Run relevant checks before requesting review.
- Do not commit secrets, credentials, private keys, or local-only generated
  files.

## Pull Requests

Pull requests should include:

- A short description of the change.
- Any important implementation notes.
- The testing or manual verification performed.
- Screenshots or links when the change affects the UI.

Use the repository pull request template:

```md
## What this adds

-

## Changes

-

## Testing

-
```

## Local Development

Install dependencies:

```bash
make install
```

Run the project locally:

```bash
make run
```

Run broad verification:

```bash
make verify
```

Use the more focused `make` commands when working on a smaller part of the
project.

## Review

Maintainers review pull requests for correctness, clarity, test coverage,
security, and fit with the project direction. Please respond to review comments
with updates or questions so the change can move forward.
