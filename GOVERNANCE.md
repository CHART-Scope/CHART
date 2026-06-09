# CHART Governance

This document describes how CHART maintainers guide project decisions and review
changes.

## Project Stewardship

CHART is maintained by the CHART project maintainers under the CHART-Scope
organization. Maintainers are responsible for keeping the platform useful,
secure, testable, and aligned with climate-health planning needs.

## Decision Areas

- Product direction: user flows, planning priorities, repository content model,
  and public access expectations.
- Technical direction: architecture, app boundaries, dependencies, CI, and
  deployment workflow.
- Data direction: seed data, repository snapshots, public API contracts,
  attribution, and source quality.
- Security direction: authentication, authorization, private data handling, and
  incident response.

## Maintainer Responsibilities

Maintainers should:

- Review pull requests for correctness, maintainability, product fit, and test
  coverage.
- Keep the `web`, `api`, and `chart-repository` boundaries clear.
- Protect public content access and authenticated role/geography flows.
- Avoid adding process that blocks small, useful contributions.
- Document important decisions in repository docs or pull request discussions.
- Escalate security and privacy concerns before merging affected changes.

## Contribution Review

Pull requests should be reviewed before merge. Reviewers should check:

- The change is scoped and understandable.
- Required validation commands have passed.
- User-facing behavior is covered by tests or clear manual verification.
- API changes preserve stable response shapes or document migration needs.
- New dependencies are justified.
- Repository data and media attribution are preserved where relevant.

## Branch Policy

- `dev` is the active integration branch.
- Feature, fix, and documentation branches should be merged into `dev` through
  pull requests.
- GitHub Pages Storybook deployment runs from `dev`.
- Maintainers may use other release branches when needed for production or
  deployment coordination.

## Repository Boundary

The standalone `chart-repository/` service owns editing, media, publishing
workflow, repository auth, and public repository API behavior.

CHART core reads public repository data through the Fastify gateway and public
snapshots or remote APIs. CHART core must not import Payload CMS internals or own
repository CMS tables.

## Decision Process

Most decisions can be made in pull request discussion. Larger decisions should
be written down before implementation when they affect:

- Auth or role/geography behavior.
- Public API contracts.
- Repository data ownership.
- Deployment infrastructure.
- New external services or major dependencies.

If reviewers disagree, maintainers should choose the smallest reversible change
that keeps the product moving while preserving the architecture boundaries.

## Security Issues

Security issues should not be disclosed in public issues or pull requests until
maintainers have had time to assess and respond. Contact project maintainers
privately with reproduction steps, affected areas, and any known impact.
