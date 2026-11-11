# Design system

CHART's screens share one set of colours, type, sizes and components. The
visual reference is the **00 · Design system** artboard at the top of the
"CHART user flow" design canvas. The values live in code in
`web/src/styles/tokens.css`. The sign-in pages are a separate Keycloak theme
that mirrors them in `infra/keycloak/themes/chart/login/resources/css/chart.css`.

## Rules

- **Use tokens, not literals.** Colours, font sizes, spacing, radii and
  control heights come from `tokens.css`. If a design needs a value that has
  no token, add the token in one place rather than repeating a hex or pixel
  value in a module.
- **Use the shared components.** Buttons are `Button` or `buttonClassName`
  (`web/src/components/Button`), selects are `InlineSelect`, dialogs are
  `Modal`, page titles are `PageHeader` or the page's own title in the type
  below. A feature does not define its own button styles.
- **Type:** Fira Sans for headings, numbers, labels and buttons; Noto Sans for
  reading. Headings are semibold (600).
- **Spacing is a 4px scale:** 4, 8, 12, 16, 24, 32, 48, 64, 88. Pick the step
  by relationship: tight inside a component, wider between components, widest
  between sections. Off-scale values (13, 18, 22, 26, 30) snap to the nearest
  step.
- **Lime only on charcoal.** It is the wordmark, active icons and the call to
  action in dark headers (`Button variant="inverse"`), never on ivory.
- **Status as tint plus text:** a 10–12% tint fill with full-strength text,
  never a solid block of colour.

## Sizes

Every control is a fixed height plus side padding, so changing its text size
never changes its height.

| Component | Height | Type | Padding | Radius | Token / prop |
| --- | --- | --- | --- | --- | --- |
| Button L, a page's main action | 48 | Fira 600 · 16 | 0 24 | 8 | `size="lg"` |
| Button M, headers, dialogs, forms | 40 | Fira 600 · 14 | 0 20 | 8 | default |
| Button S, inside cards and tables | 32 | Fira 600 · 13 | 0 14 | 6 | `size="sm"` |
| Pill select in a sentence | 40 | Noto 500 · 17 | 0 16 | pill | `--control-md` |
| Filter select | 32 | Noto 500 · 14 | 0 12 | pill | `size="sm"` |
| Text input | 44 | Noto 400 · 14 (16 on phones) | 0 12 | 8 | `--control-input` |
| Tag | 28 | Noto 500 · 14 | 0 12 | pill | `--control-tag` |
| Sidebar item | 44 | Fira 500 · 16 | 0 16 | 8 | |
| Header | 64 (app), 68 (public) | | | | |

Button variants: `primary` (nexus), `secondary` (nexus outline on white),
`ghost` (text), `inverse` (lime on charcoal) and `icon`.

## Type scale

| Role | Size | Token |
| --- | --- | --- |
| Landing hero | 64 | `--fs-display-1` |
| Landing section | 34 | `--fs-display-2` |
| Page title | 28 | `--fs-title` |
| Card title | 22 | `--fs-title-card` |
| Subhead | 19 | `--fs-subhead` |
| Lede | 17 / 1.85 | `--fs-lede`, `--lh-lede` |
| Body | 14, 13 | `--fs-body-lg`, `--fs-body` |
| Eyebrow | 12 caps, +0.12em | `--fs-caption` |

## Layout

- Page gutter `--page-gutter`: `clamp(24px, 6vw, 120px)`. Content is at most
  `--content-max` (1592px) wide, and the header, sections and footer share the
  gutter so their left edges line up.
- Landing sections are `--space-22` (88px) apart; workspace sections
  `--space-16` (64px).

## When the sign-in styles change

Change the `?v=` date in `infra/keycloak/themes/chart/login/theme.properties`
(see [sign-in](sign-in.md)), or browsers keep the old stylesheet for 30 days.
