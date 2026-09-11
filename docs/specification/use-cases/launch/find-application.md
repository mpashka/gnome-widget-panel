# "I know its name, not its category"

`@tag:use-case` `@tag:widget-gnome-menu`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** I want *that* program now, and hunting for the category it was filed
under is slower than typing three letters.

## Steps

1. [S3](../steps.md#s3) on the **Applications** widget. The **search box already
   has the keyboard** — nothing to click.
2. **Type.** Matches from *every* category replace the right pane, best first.
3. **`Enter`** launches the top match. Or `↓` into the list and pick.

**Cost.** A click, a few keystrokes and one key — usually the shortest route on
the panel.

## Variants

- **A localised desktop.** An application is found under **either** language: the
  name shown in the menu, the untranslated name from its `.desktop` file, its
  generic name, its keywords, its executable or its id. A Russian desktop finds
  "Settings", an English one finds "Настройки".
- **Wrong search — start again.** `Escape` clears the query first and closes the
  menu on the second press ([S7](../steps.md#s7)); clicking a category also ends
  the search.
- **Search then act.** A result row takes right-click actions like any other:
  [favorites](favorites.md), [editing](edit-application.md), the entry's own
  `.desktop` actions.
- **Nothing matches.** The program may have no desktop entry — for those, a
  [Launch button](run-command.md) runs the command line directly.

## Result

The application starts and the menu closes with the query dropped, so the next
opening starts clean.
