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

## Directories

- [`ui/`](ui/index.md) — headless GNOME Shell UI test harness, regression tests
  (`t-*.sh`) and the feature-debug stub.

## Adding tests

Prefer extracting pure logic into a gi-free module (like `tooltipTemplate.ts` and
`widgetConfig.ts`) and testing it here, rather than trying to load Shell-only
code. Back to [repository index](../index.md) and [`../AGENTS.md`](../AGENTS.md).
