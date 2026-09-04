# "Open my Downloads folder"

`@tag:use-case` `@tag:widget-favorites`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** I want a folder open in the file manager without minimising anything
or navigating from Home.

## Also assumes

The **Places** widget is on the panel — it is not one of the defaults, so
[add it](../configure/add-widget.md) first.

## Steps

1. [S3](../steps.md#s3) on the **Places** widget. The menu lists **Home**, your
   XDG folders (Documents, Downloads, Pictures…) and your **file-manager
   bookmarks**.
2. Click the entry. It opens in your file manager.

**Cost.** Two clicks from the desktop.

## Variants

- **A folder that isn't listed.** Bookmark it in the file manager — the widget
  shows the same bookmarks, so the list is maintained where you already
  maintain it, not in a second settings page.
- **A folder I open by command** (a mount, a path with a flag): a
  [Launch button](run-command.md).
- **Applications, not folders.** [Favorites](favorites.md) in the applications
  menu.
- **Label the button.** It is icon-only by default; the icon and optional label
  are [tunable](../configure/tune-widget.md) like any button widget's.

## Result

The file manager opens at that location. The widget reflects your bookmarks as
they are, so nothing needs syncing.
