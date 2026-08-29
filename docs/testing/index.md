# Testing

`@tag:ui-testing`

Test cases and the harnesses that run them. Two layers cover the extension:

- **Unit tests** — the **gi-free** pure-logic modules, run with Node's built-in
  runner (`npm test`). Cases are catalogued in
  [`../../tests/index.md`](../../tests/index.md).
- **Headless UI tests** — behaviour that needs a running GNOME Shell (panel
  layout, live-apply settings, clicks), run with `npm run test:ui`. Cases are
  catalogued in [`../../tests/ui/index.md`](../../tests/ui/index.md).

## Files

- [`ui-testing.md`](ui-testing.md) — the headless UI harness: approaches
  considered, architecture (isolated headless shell + test-driver extension),
  the regression suite and the feature-debug stub workflow (`@tag:ui-testing`).

## Where a new test case goes

- Prefer extracting pure logic into a gi-free module and covering it with a unit
  test in [`../../tests/index.md`](../../tests/index.md).
- Shell-only behaviour gets a `t-NN-*.sh` script in
  [`../../tests/ui/index.md`](../../tests/ui/index.md), listed in that index with the
  behaviour it pins down and the issue it regresses.
- A case that cannot be automated (needs a human to judge a visual symptom or
  type a password) is written as numbered manual steps in the task's own
  directory under [`../requests/index.md`](../requests/index.md), not here — those files
  are per-session, while this directory holds the durable catalog.
- A test case belonging to one widget is described next to that widget, in
  `extension-src/plugins/<id>/index.md`.

## Related

- [`../process/bug-fixing-workflow.md`](../process/bug-fixing-workflow.md) — when
  in the bug-fixing sequence a regression test is written.
- [`../process/development.md`](../process/development.md) — running the
  extension in a nested shell while iterating.

Back to the [documentation index](../index.md).
