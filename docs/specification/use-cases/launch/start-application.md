# "Start this application"

`@tag:use-case` `@tag:widget-gnome-menu`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** I want to launch a program, and I would rather browse to it than type
its name.

## Steps

1. [S3](../steps.md#s3) on the **Applications** widget — the two-column menu
   opens: search box above categories on the left, that category's applications
   on the right.
2. **Hover a category** — the right pane previews its applications; no click
   needed to look.
3. **Click the application.** It starts and the menu closes.

**Cost.** Two clicks and a hover, from the desktop.

## Variants

- **I know the name.** Do not browse — the keyboard is already in the search
  box: [`find-application.md`](find-application.md).
- **It has its own actions** — a private window, a new document. Right-click the
  row ([S6](../steps.md#s6)); the entry's own `.desktop` actions are at the top
  of the menu that appears.
- **I use it constantly.** Put it in [Favorites](favorites.md), which is a
  category in the same menu.
- **The details are wrong** — name, icon, command:
  [`edit-application.md`](edit-application.md).
- **I would rather use GNOME's own picker.** [`open-overview.md`](open-overview.md)
  opens the Overview or the application grid from a panel button.
- **I just installed it.** It appears on its own; the menu notices new and
  edited entries without being reopened.

## Result

The application starts and the menu closes. Nothing about the menu is
remembered between openings on purpose — it always opens in the same state, so
the route to an application is the same every time.
