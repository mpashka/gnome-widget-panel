# Bug-fixing workflow

`@tag:process`

Back to the [documentation index](index.md) and [working rules](../AGENTS.md).

The standard sequence for turning a bug report into a merged fix. It is written
for an AI agent driving the work with **subagents**, but a human follows the same
stages. Each stage has an exit condition; do not start the next stage until the
current one is met. The goal is that a fix is *reproduced before it is written*
and *verified before it is reviewed*, so regressions do not slip back in.

## Roles (subagents)

Delegate independent, read-heavy or adversarial work to subagents so the main
thread keeps the plan and the conclusions, not the file dumps. Pick the cheapest
model that can do each job (see the project memory on model selection).

- **Reproducer** — turns the report + [configuration](bug-report-howto.md) into a
  deterministic repro (a failing UI test, a script, or exact manual steps).
- **Investigator** — read-only root-cause analysis across the relevant
  subsystem; returns the offending file/line and mechanism, not a fix.
- **Fixer** — implements the minimal change (the main thread usually keeps this).
- **Test author** — adds or updates the regression test.
- **Reviewer** — adversarial code review of the diff (see the `/code-review`
  skill); tries to break the fix, not to bless it.

Run independent subagents in parallel; gate dependent stages behind their exit
conditions.

## Branch & merge policy

**One branch per bug, one commit per issue on `main`.**

- Before writing any fix, create a dedicated branch off `main` named
  `fix/issue-<N>-<short-slug>` (e.g. `fix/issue-4-main-menu-sticky`). All work for
  that bug — the fix, its regression test, doc updates — happens on that branch.
- Different bugs never share a branch, so they can be reviewed, validated and
  merged independently and one failing fix never blocks another.
- **Merge only after validation** (stages 4–6 all green: tests pass, verified,
  code review resolved). Merge into `main` with a **squash** so `main` gets
  **exactly one commit per issue**. End the squash message with `Fixes #<N>` so the
  issue closes on merge, then delete the branch.
- If a fix cannot be validated (e.g. it needs a real GPU / lock screen this
  environment can't drive), do **not** squash-merge it silently: keep the branch,
  open a PR, and say explicitly in the report what remains unverified.

## Stages

### 1. Reproduce
Reproduce the bug from the report before touching code. Load the reporter's
configuration into a dev profile ([`development.md`](development.md),
`./dev-run.sh`). Prefer a **failing automated repro**: extend the headless UI
suite ([`ui-testing.md`](ui-testing.md), `npm run test:ui`) or a pure-logic test
([`../tests/index.md`](../tests/index.md)) so the failure is a red test, not a
screenshot.

**Exit:** you can trigger the bug on demand, and (ideally) a test fails because
of it. If you cannot reproduce, go back to the reporter for config/screencast —
do not guess a fix.

### 2. Analyse (root cause)
Find *why* it happens, not just where it shows. Read the relevant `index.md`
chain first (AGENTS.md rule), then the code. Name the mechanism: which actor,
timer, signal, lifecycle hook (`destroy()`, `session-mode`, live-apply) or config
path is wrong. Distinguish the root cause from its symptom (e.g. "graph empty"
may be "hook not delivering", not "renderer broken").

**Exit:** a one-paragraph root-cause statement pointing at the file/line and the
mechanism.

### 3. Fix
Make the **minimal** change that addresses the root cause. Edit TypeScript under
`extension-src/` only — never generated `extension/*.js` (AGENTS.md). Follow the
[code quality rules](code-quality.md): reuse existing helpers, keep naming
consistent with the surrounding code, add contract types for any boundary you
touch. Update the affected `index.md`/`docs` in the same change.

**Exit:** `npm run typecheck` and `npm run build` pass; the change is scoped to
the root cause.

### 4. Regression test (create or update)
Every fix that could regress gets a test that **fails before and passes after**.
Prefer extracting pure logic into a gi-free module and testing it with
`npm test`; use the headless UI suite for layout/interaction behaviour. If an
existing test covered the area, update it rather than duplicating. If the bug is
genuinely untestable (e.g. requires a real GPU/lock-screen), say so explicitly in
the PR and add manual verification steps instead.

**Exit:** `npm test` (and `npm run test:ui` when relevant) is green with the new
test present; the test demonstrably fails when the fix is reverted.

### 5. Verify end-to-end
Drive the real flow, not just the tests: reproduce the original steps in
`./dev-run.sh` and confirm the bug is gone and nothing adjacent broke. Capture a
screenshot/screencast of the fixed state for the PR.

**Exit:** the original repro no longer triggers the bug in a running shell.

### 6. Code review
Run an adversarial review of the diff (`/code-review`, or a Reviewer subagent).
It checks correctness, that the test truly guards the fix, naming/altitude
consistency, lifecycle discipline (timers/signals/servers released in
`destroy()`), and that no generated file was hand-edited. Address findings before
merge.

**Exit:** review findings resolved; diff is minimal, typed at its boundaries,
documented, and tested.

## Close-out
- **Squash-merge the branch into `main`** so `main` has exactly one commit for the
  issue; end the message with `Fixes #N` so it closes on merge; delete the branch
  (see [Branch & merge policy](#branch--merge-policy)).
- Update [`TODO.md`](../TODO.md) if the fix completed/split a tracked contract.
- Add a regression note only if the root cause is subtle enough that a future
  agent would re-introduce it.

## Quality ratchet
The point of stages 4–6 is that **the project does not get harder to change over
time**: each fix leaves behind a test that pins the behaviour and documentation
that explains it, so the next change starts from a known-good, described state.
See [code-quality.md](code-quality.md).
