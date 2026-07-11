# Tests index

`@tag:mechanism`

Two test layers:

- **Unit tests** (this directory, `*.test.mjs`) — the panel's **gi-free**
  pure-logic modules, run with Node's built-in test runner.
- **UI tests** ([`ui/`](ui/index.md)) — headless GNOME Shell regression tests
  and feature-debug tooling; see [`../docs/ui-testing.md`](../docs/ui-testing.md).

## Running

```bash
npm test          # unit: `npm run build` first, then `node --test tests/*.test.mjs`
npm run test:ui   # UI regression suite (needs a GNOME 50 host; ~2-3 min)
```

Tests import the compiled output from `../extension/` (a build artifact), so the
`pretest` build step is required; `npm test` does it automatically.

## Files

- `tooltipTemplate.test.mjs` — `renderTemplate` from
  [`../extension-src/tooltipTemplate.ts`](../extension-src/tooltipTemplate.ts):
  token substitution, literal Pango-escaping, `\n` handling, unknown/empty tokens.
- `widgetConfig.test.mjs` — `parseWidgetConfig`/`serializeWidgetConfig` from
  [`../extension-src/widgetConfig.ts`](../extension-src/widgetConfig.ts): schema
  validation, `enabled`/`options` normalization, error cases, round-trip.
- `colorUtils.test.mjs` — `hexToRgb`/`toNumber`/`nowSeconds` from
  [`../extension-src/colorUtils.ts`](../extension-src/colorUtils.ts): valid and
  invalid hex colours, numeric coercion/fallback, integer timestamp.
- `version.test.mjs` — `RELEASE_CHANNEL`/`formatVersionLabel` from
  [`../extension-src/version.ts`](../extension-src/version.ts): channel badge
  formatting, stable (empty-channel) case, default channel, empty-version
  fallback (`@tag:versioning`).
- `claudeStatusLine.test.mjs` — `normalizeClaudeStatusLine`/`claudePromptRequest`
  from
  [`../extension-src/plugins/ai-agent-usage/claudeStatusLine.ts`](../extension-src/plugins/ai-agent-usage/claudeStatusLine.ts):
  token/context/rate-limit mapping (including the null-`current_usage` and
  missing-`rate_limits` cases) and `UserPromptSubmit` → request-marker
  extraction (`@tag:widget-ai-agent-usage`, issue #6).
- `props.test.mjs` — `definedProps` from
  [`../extension-src/props.ts`](../extension-src/props.ts): drops `undefined`-valued
  keys from a GObject initializer (regression for the cpu-load-monitor settings
  page failing to open on `tooltip_text: undefined`), keeps `null`/falsy values.

## Directories

- [`ui/`](ui/index.md) — headless GNOME Shell UI test harness, regression tests
  (`t-*.sh`) and the feature-debug stub.

## Adding tests

Prefer extracting pure logic into a gi-free module (like `tooltipTemplate.ts` and
`widgetConfig.ts`) and testing it here, rather than trying to load Shell-only
code. Back to [repository index](../index.md) and [`../AGENTS.md`](../AGENTS.md).
