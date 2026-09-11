# "Its name, icon or command is wrong"

`@tag:use-case` `@tag:widget-gnome-menu`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** An entry in the menu is called something unhelpful, has the generic
icon, or starts the program without the flag I always want — and I want to fix
it where I found it.

## Steps

1. [S3](../steps.md#s3) on **Applications**; find the entry.
2. **Right-click it** ([S6](../steps.md#s6)) → **Edit Application…**.
3. The entry is **copied into your own** `~/.local/share/applications` and opened
   in your text editor. Edit the `Name`, `Icon` or `Exec` line and save.

**Cost.** Two clicks, then the editor you already know.

## Variants

- **It was a system entry — did I just break the package?** No. The system file
  under `/usr/share/applications` is left alone; you are editing a user-local
  copy, which is also what takes precedence for you. Nothing asks you to confirm
  because nothing destructive happens.
- **I already had my own copy.** It is opened as it is — your existing edit is
  never overwritten.
- **The change doesn't show.** Save the file; the menu picks up new and edited
  entries on its own.
- **I only want a different icon on the panel, not in the menu.** That is the
  widget's own [icon setting](../configure/tune-widget.md), not the
  application's entry.
- **There is no editor form here.** Deliberate: a whole form to learn where the
  text editor you already use does the job — see the rejected-designs table in
  [`ux.md`](../../../process/ux.md).

## Result

A user-local `.desktop` file you own, used by the panel's menu and by GNOME
everywhere else. The system copy is untouched, so removing yours restores the
original.
