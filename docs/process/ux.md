# UX rules — this panel

`@tag:ux`

**The general rules are not here.** They live in
[`.claude/rules/ux/`](../../.claude/rules/ux/) — an installed copy of the
[ux-principles](https://github.com/mpashka/home-incubator) convention. Claude
Code loads them automatically; other agents must read them there. Start with
[`core.md`](../../.claude/rules/ux/core.md) (any interface) and
[`desktop.md`](../../.claude/rules/ux/desktop.md) (pointer, keyboard, windows,
shell), then come back here.

This page holds what is **true of this panel and nowhere else**: the rules that
name its parts, the worked examples with the gestures they cost, and any
deliberate departure from a general rule.

The bar the panel is held to: it exists to save its user gestures — one that
costs more clicks than the thing it replaces has no reason to be installed. So
the question is never "does it work" but **how many steps does it take, counted
from where the user already is.**

## The panel's own use cases

The cases already written down live in
[`../specification/use-cases/`](../specification/use-cases/index.md) — one page
per goal, each with the gestures its main path costs. Read the area your change
touches before designing, and **add or update the case in the same change**: a
step count recorded there is what makes a later regression visible.

## Worked example: the applications menu

The use cases, and what each costs (from "the menu is open"):

| Use case | Design | Steps |
| --- | --- | --- |
| "Start this application" | click the row | 1 |
| "Find an application whose name I know" | the search box already has the keyboard: type, `Enter` | typing + 1 key |
| "Put this one in my favorites" | right-click → *Add to Favorites*; the Favorites category updates at once | 2 |
| "Take it back out" | right-click → *Remove from Favorites* (same item, toggled) | 2 |
| "Its name / icon / command is wrong" | right-click → *Edit Application…*: the system entry is copied into `~/.local/share/applications` and opened in the text editor | 2 |
| "Open a private window / a new document" | right-click → the entry's own `.desktop` actions, at the top | 2 |

What was rejected and why: a preferences page for favorites (the action lives on
the object — the application is already under the pointer), a built-in `.desktop`
editor (a whole form to build and learn where the text editor the user already
knows does it), a confirmation before editing a system entry (the copy makes it
harmless, and it is reversible).

## Worked example: what earns a row in the handle menu

The panel handle's right-click menu is small on purpose, and it is **not** the
place to surface a gesture that has no visible route. A menu row costs every
user who opens the menu a line to read past, forever; so a row is earned in one
of exactly three ways:

| Why it is there | Rows | The test it passes |
| --- | --- | --- |
| **Needs to be fast**, even if it is not frequent | Collapse / Expand | The panel is suddenly in the way — collapse it and move on. Rarely done, but when it is wanted it is wanted *now*, and a trip to preferences is the wrong shape for it. |
| **Convention** | Settings… | Right-click → *Settings* is where every modern interface keeps this. Being where people already look costs one row and saves a search. |
| **Giving the extension a chance** | build header, Release notes, extensions.gnome.org, Report a bug, Suggest a feature | For someone who installed it to "just try it". The version answers "is my problem already fixed in a newer one" before they write the report; the rest turn a shrug into a report, a request or a rating instead of an uninstall. |

**Configuration does not earn a row**, however hidden its current gesture is.
The indicator drawer and the panel orientation are configuration: they are
decided once and then left alone, so their home is the preferences window —
where orientation already lives — and the fix for an undiscoverable gesture is
*a setting*, not a menu item.

Two consequences worth stating:

- **A hidden gesture is not evidence that a menu row is missing.** Ask which of
  the three tests the action passes. If none, it belongs in preferences, and the
  gesture is either kept as a shortcut for whoever learned it, or dropped.
- **The cheap gestures are a scarce resource.** There are only so many things a
  pointer can do to one handle, so they should go to what needs to be fast, not
  to what was implemented first.

## The case behind "inheriting the top bar's duties"

The general rule is in [`desktop.md`](../../.claude/rules/ux/desktop.md); this
is the case that produced it.

This panel offers to hide the GNOME top bar. GNOME shows a **red recording
indicator** there, and clicking it is how people stop a screen recording. With
the bar hidden the only remaining way is `Ctrl+Shift+Alt+R`, which nothing ever
told the user about — while our own Screenshot widget, the thing that *started*
the recording, sat next to it showing a camera icon and doing nothing. The
answer was not documentation: the widget becomes a red stop button while a
recording runs (#33).

## The case behind "a warning is shown only while it stands"

The developer widget
[`version-status`](../../extension-src/plugins/version-status/index.md) says one
thing: the build on disk is newer than the one this Shell is running, so testing
what you see is pointless until you log out and back in. Once the two agree it
has nothing to say, so it takes no panel space at all — the general rule in
`core.md` was written from this.

## The case behind "the layout may not move under the pointer"

Two, and the second is the expensive one:

- The **applications menu** used to ask for a size that followed its selection,
  so switching category moved rows out from under the pointer and the popup
  shook. It now asks for one size, chosen for the widest category.
- The **end-of-day window** stepped aside from an approaching pointer and
  re-armed that step whenever the pointer left. The yield itself moves the window
  out from under the pointer, so `leave` fired immediately and re-armed it: every
  approach was a first approach, the window fled forever, and its buttons could
  never be clicked. It no longer steps aside at all — a question that stands
  until it is answered must not run from the answer. The transient warning keeps
  the once-per-showing yield, which is what that rule permits.

## Departures from the general rules

None recorded. When one is needed, it goes here with its reason — never by
editing the installed copy in `.claude/rules/ux/`, which is a copy of a shared
convention.

## Related

- [`.claude/rules/ux/`](../../.claude/rules/ux/) — the general rules this page
  sharpens.
- [`code-quality.md`](code-quality.md) — the code-side bar for the same changes.
- [Use cases](../specification/use-cases/index.md) — the goals these rules are
  applied to, and the step count each one costs today.
- [Widget specifications](../specification/widgets.md) — what each widget does.

Back to the [process index](index.md).
