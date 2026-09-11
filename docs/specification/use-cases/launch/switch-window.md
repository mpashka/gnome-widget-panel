# "Which of my six terminals is the right one?"

`@tag:use-case` `@tag:widget-app-windows`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** I have several windows of the *same* program — three IDE projects, six
terminals — and I want the one whose **title** I know. Alt+Esc shows me
thumbnails that all look alike, and the switcher no longer fits on screen.

## Also assumes

The **App windows** widget is on the panel
([add it](../configure/add-widget.md)); it shows the focused application's icon
with its window count.

## Steps

1. [S3](../steps.md#s3) on the **App windows** widget — the menu lists the
   windows of the application currently in focus, **by title**.
2. Click the title you want. It is raised, unminimised and its workspace
   switched to if needed.

**Cost.** Two clicks, and the list you read is text, not pictures.

## Variants

- **Which one am I in?** The window you came from is marked with a **dot**.
- **Why by title and not by recency?** Because the list then stays the same
  between openings, so the window you want ends up where you remember it. For
  switcher-style order, set **order** to *most recently used* — the window you
  came from is then always the first row
  ([`../configure/tune-widget.md`](../configure/tune-widget.md)).
- **A window elsewhere.** A window on another workspace, or minimised, says so
  to the right of its title — and can be turned off entirely with **windows on
  other workspaces**.
- **Too many windows.** **Maximum windows** caps the list and counts the rest as
  "N more"; **menu width** decides how much of a long title you see before it is
  ellipsized.
- **A different application.** Focus one of its windows first — the widget
  follows the focused application, which is why its icon changes.

## Result

You land on the intended window. The widget's icon and count keep showing what
is focused now, so it doubles as an [indicator](../monitor/index.md) of what you
are in.
