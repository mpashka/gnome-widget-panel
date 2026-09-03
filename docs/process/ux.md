# UX rules

`@tag:ux`

What every widget and menu in this panel is held to. The panel exists to save
its user gestures — a panel that costs more clicks than the thing it replaces
has no reason to be installed. So the bar is not "does it work" but **how many
steps does it take, counted from where the user already is.**

Read this before designing an interaction; the per-widget pages describe what
was built, this page says why it has that shape.

## Design from the use case, not from the feature

Write the use case down first, in the user's words and with the state they are
already in: *"I have the applications menu open and I want this one in my
favorites."* The design is then whatever serves that sentence in the fewest
gestures. A feature list ("we need favorites management") produces a settings
page; a use case produces a right-click item on the row the user is looking at.

The ones already written down live in
[`../specification/use-cases/`](../specification/use-cases/index.md) — one page
per goal, each with the gestures its main path costs. Read the area your change
touches before designing, and **add or update the case in the same change**: a
use case nobody wrote down is a feature list waiting to happen, and a step count
recorded there is what makes a regression in this page's rules visible.

## The rules

1. **Count the steps.** Every interaction has a step count from the state the
   user is already in — pointer moves, clicks, keystrokes, dialogs. The design
   with the smaller count wins unless it costs clarity. Two clicks with no
   dialog beat one click that opens a window.
2. **The action lives on the object.** Acting on a thing starts by pointing at
   that thing — a right-click on the row, not a settings page listing rows. The
   object is already under the pointer; a settings page has to be found, opened
   and searched.
3. **No dialogs for reversible actions, no confirmations for cheap ones.**
   Adding a favorite is one click and is undone by one click; asking "are you
   sure" doubles a free action.
4. **One item that toggles beats two items that don't.** The row is either a
   favorite or it is not — show the one action that applies now
   ("Add to Favorites" / "Remove from Favorites"), not both, greyed.
5. **Never dead-end on a precondition.** If an action needs something prepared
   first — a system `.desktop` file copied into the user's own directory before
   it can be edited — the action does the preparation itself. Telling the user
   what to do first is one more step *and* a research task.
6. **Never destroy what you touch.** The same rule read the other way: work on a
   user-local copy, leave the system's file alone, and never overwrite an edit
   the user already made.
7. **Show the result where the user is looking.** State changed by an action is
   visible immediately in the menu that caused it; the user should not have to
   reopen anything to see whether it worked.
8. **Escape backs out one level.** Each layer — a context menu, a search query,
   the popup itself — is dismissed in that order by repeated `Escape`, never
   more than the layer the user is in.
9. **The primary path has a keyboard route.** Opening a menu puts the keyboard
   where typing is useful; `Enter` takes the obvious action, arrows move,
   `Escape` backs out. A mouse-only feature is unusable to half its users, and
   the keyboard route is usually the fewest steps of all.
10. **An update must not lose the user's place.** Rebuilding a menu because the
    world changed keeps the selected category, the typed query and the scroll
    position. Losing them turns one action into three.
11. **The layout may not move under the pointer.** A popup that resizes with its
    own content pushes rows out from under the pointer and shakes; give it one
    fixed size. See [the gnome-menu
    widget](../../extension-src/plugins/gnome-menu/index.md) for the case that
    taught this.
12. **Failure is quiet and local.** A broken entry is skipped and logged, never
    turned into a notification or a crashed widget; the rest of the menu stays
    usable.

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

What was rejected and why: a preferences page for favorites (rule 2 — the
application is already under the pointer), a built-in `.desktop` editor
(rule 1 — a whole form to build and learn where the text editor the user already
knows does it), a confirmation before editing a system entry (rules 3 and 5 —
the copy makes it harmless).

## Related

- [`code-quality.md`](code-quality.md) — the code-side bar for the same changes.
- [Use cases](../specification/use-cases/index.md) — the goals these rules are
  applied to, and the step count each one costs today.
- [Widget specifications](../specification/widgets.md) — what each widget does.
- [`../../extension-src/plugins/gnome-menu/index.md`](../../extension-src/plugins/gnome-menu/index.md)
  — the menu these rules were first written against.

Back to the [process index](index.md).
