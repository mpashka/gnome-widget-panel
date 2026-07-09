# Tests index

`@tag:mechanism`

Unit tests for the panel's **gi-free** pure-logic modules, run with Node's built
in test runner. Most of the extension is dynamic GJS/GNOME Shell code that needs
a running Shell and is not unit tested here; only modules with no `gi://` import
are covered.

## Running

```bash
npm test          # runs `npm run build` first, then `node --test tests/*.test.mjs`
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

## Adding tests

Prefer extracting pure logic into a gi-free module (like `tooltipTemplate.ts` and
`widgetConfig.ts`) and testing it here, rather than trying to load Shell-only
code. Back to [repository index](../index.md) and [`../AGENTS.md`](../AGENTS.md).
