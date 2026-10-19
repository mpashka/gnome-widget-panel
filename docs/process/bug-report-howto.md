# How to file a bug report

`@tag:process`

Back to the [documentation index](../index.md) and [working rules](../../AGENTS.md).

A bug is only fixable if a maintainer (or an AI agent) can **reproduce** it. Two
attachments do most of that work; a report without them usually stalls on
round-trips. This page is the rule for both humans and agents filing issues in
this repository.

## First: search the existing issues

Before opening a bug report or a feature request, review the existing GitHub
issues — **open and closed**. If one matches, **comment** on it instead of filing
a duplicate; **reopen** a closed one when it recurs or is worth reconsidering.
One concern in one issue is what lets demand be judged and the backlog
prioritised.

Searching means reading, not glancing at titles — a request is a duplicate when
it shares the **need**, however differently it is worded. Dump every issue once
and search the bodies:

```bash
gh issue list --state all --limit 100 --json number,title,body > /tmp/issues.json
# then grep that file for the concept, not just the words you would have used
```

(`gh search issues --state all` is rejected by the CLI — it takes only
`open`/`closed`, which is how duplicates get filed.)

When one matches, **comment with what your version adds** — the new case, the
wider model, the constraint the original missed — and say it arrived as a
separate ask and was merged here. File a new issue only when the *need* differs,
and then **link the neighbours both ways** ("complementary to #N, not a
substitute"). Every feature request states the **use case and its frequency**,
and what the operation costs in gestures today versus after; see
[`ux.md`](ux.md) and the [use-case tree](../specification/use-cases/index.md).

## The rule: every bug report includes configuration + a screenshot/screencast

1. **Configuration is mandatory.** Layout and per-widget behaviour depend
   entirely on the widget list, its order, per-widget `options` and the panel
   settings. Attach them. Copy-paste:

   ```bash
   SCHEMA=org.gnome.shell.extensions.floating-mini-panel
   DIR=~/.local/share/gnome-shell/extensions/gnome-widget-panel@mpashka.github.com/schemas
   gsettings --schemadir "$DIR" get "$SCHEMA" widgets      # widget list + options
   for k in orientation main-panel aligned content-padding state; do
     printf '%s = ' "$k"; gsettings --schemadir "$DIR" get "$SCHEMA" "$k"; done
   ```

   Redact anything secret-looking before pasting (the AI collector's
   endpoint token is generated per session and is not in this key).

2. **A screenshot or screencast is mandatory when the bug is visible.**
   - **Screenshot** for a static wrong state (missing icon, wrong size, wrong
     colour). GNOME: `PrtSc`, or `gnome-screenshot -f bug.png`.
   - **Screencast** for anything animated, timing-related, or triggered by an
     interaction (hover, click, drag, menu, lock/unlock, flicker/reload). A
     recording shows the sequence a still cannot. GNOME: `Ctrl+Shift+Alt+R`
     starts and stops a recording (saved to `~/Videos/Screencasts/`).
   - Drag the file into the GitHub issue body to attach it. A bare URL does not
     pre-attach media.

3. **Reproduction steps, actual vs. expected.** Numbered steps from a known
   state, what happened, what you expected instead.

4. **Environment.** GNOME Shell version, session type (Wayland/X11), OS/kernel,
   extension version. The About page prefills this into the issue form.

## Template

The GitHub form ([`.github/ISSUE_TEMPLATE/bug_report.yml`](../../.github/ISSUE_TEMPLATE/bug_report.yml))
already has these sections and prompts for them. When filing from the CLI or as
an agent, mirror the same sections and leave an explicit
`_TODO: attach screenshot/screencast_` placeholder if you cannot capture the
media yourself, so the reporter knows what is still needed.

## For AI agents filing issues

- Read the affected widget's `index.md` first and name the suspected area/file
  in the report — it shortcuts the analysis phase of the
  [bug-fixing workflow](bug-fixing-workflow.md).
- Always fill the **Configuration** section from the live `gsettings` values
  (redact secrets). Never invent a configuration.
- If you cannot capture a screenshot (e.g. Wayland blocks programmatic capture
  and no capable tool is installed), say so and leave the placeholder rather than
  omitting the section — do not silently drop it.
- Use English, matching the repository language rule in [`../../AGENTS.md`](../../AGENTS.md).
