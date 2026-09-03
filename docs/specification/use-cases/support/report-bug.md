# "Something is wrong and I want it fixed"

`@tag:use-case` `@tag:process`

Back to [support](index.md) · [use cases](../index.md).

**Goal.** A widget is blank, clipped, or doing the wrong thing, and I want to
report it without hunting for version numbers or a template.

## Steps

1. [S1](../steps.md#s1) → **Report a bug** (or the same row in the preferences
   **About** group).
2. A GitHub bug form opens in your browser with the **system information already
   filled in** — extension version, GNOME Shell version, distribution, kernel,
   session type — because that is the part nobody wants to collect by hand.
3. Add the two things the form asks for and that make a bug fixable: **your
   configuration** (which widgets, which options) and a **screenshot or short
   screencast** of the symptom. The
   [Screenshot widget](../launch/screenshot.md) is one click away.

**Cost.** Two clicks to a prefilled form; the rest is the description only you
have.

## Variants

- **Search first.** Check the existing issues, **open and closed**, before
  filing. A matching one takes a **comment** — or a reopen if it has come back —
  which keeps one concern in one place and makes demand for it readable. See
  [`bug-report-howto.md`](../../../process/bug-report-howto.md).
- **It is not a defect but a missing feature.** **Suggest a feature** in the same
  menu, or, for a whole widget,
  [`../configure/request-widget.md`](../configure/request-widget.md).
- **The panel is too broken to right-click.** Open preferences from the
  Extensions app instead ([S2](../steps.md#s2)) and use the About group's
  **Report a bug** row.
- **Where is the version?** The **About** group shows it (with an `alpha` badge
  on a pre-release build); it also travels in the form's system field.

## Result

An issue that can be reproduced. The workflow it then goes through — reproduce,
analyse, fix, regression test — is
[`bug-fixing-workflow.md`](../../../process/bug-fixing-workflow.md).
