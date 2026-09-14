# screen-keyboard widget

`@tag:widget-screen-keyboard`

Back to [plugins index](../index.md).

## Purpose

A panel button that opens a floating on-screen keyboard with the **Serbian
Cyrillic and Latin** letters. It is for someone who writes Serbian now and then
on a keyboard without Serbian keys and does not want a Serbian input source: a
third layout in the switch cycle breaks the muscle memory of the two already
there. Letters are clicked on the keyboard; digits, punctuation and everything
else keep coming from the physical keyboard, which stays usable the whole time.

Use case: [write Serbian letters](../../../docs/specification/use-cases/write/serbian-letters.md).

## Why not GNOME's own on-screen keyboard

GNOME Shell ships an OSK (`ui/keyboard.js`) and even a Serbian layout for it
(`osk-layouts/rs.json`), but the OSK always shows the layout of the **current
input source**. Getting Serbian out of it means adding the input source — the
thing this widget exists to avoid. So the keyboard is the widget's own; its rows
are copied from `rs.json`, and the Latin rows sit on the same keys.

## Files

- `index.ts` — the panel button, the floating keyboard and `TextSender`.
- [`layouts.ts`](layouts.ts) — gi-free letter rows of both scripts, capitals and
  the `script` option parser.
- [`placement.ts`](placement.ts) — gi-free placement of the keyboard next to the
  button.
- `prefs.ts` — settings page: icon, text, script when first opened.

## Options

- `icon` — button icon, default `input-keyboard-symbolic`.
- `text` — optional button label, default empty.
- `script` — `cyrillic` (default) or `latin`: the script the keyboard shows the
  first time it opens. After that the widget keeps the last script chosen for
  as long as it lives. It is not written back to the options on purpose: a
  changed option is a different widget instance, and the panel would rebuild it.

## Layout

```
 љ њ е р т з у и о п ш  ⌫          q w e r t z u i o p š  ⌫
 а с д ф г х ј к л ч ћ  ↵          a s d f g h j k l č ć  ↵
⇧ ѕ џ ц в б н м ђ ж ⇧            ⇧ y x c v b n m đ ž ⇧
Lat  ,  [ Српски ]  .  hide       Ћир  ,  [ Srpski ]  .  hide
```

- **Shift** is one-shot: it capitalizes the next letter and falls back. Holding
  the physical Shift while clicking a letter gives a capital too.
- The **script key** names the script it switches *to*; the space bar names the
  current one. Keys have fixed widths, so neither a script switch nor Shift
  moves a key from under the pointer.
- **Hide** closes the keyboard, like a second click on the panel button (which
  looks pressed while the keyboard is open).
- The keyboard opens above or below the button, whichever has more room, and
  can be **dragged by the gaps between the keys**; a dragged keyboard reopens
  where it was left.

## How text reaches the application

The keyboard must never take keyboard focus: the application window keeps it,
and the keyboard only injects input. It is chrome (`Main.layoutManager.addChrome`),
and its keys are ordinary `St.Button` clicks — neither a Clutter grab nor stage
key focus is involved. The route is the same as GNOME's OSK
(`KeyboardController.commit`):

- while a client speaking **text-input** has input-method focus
  (`Main.inputMethod.currentFocus`: GTK, Qt and browsers on Wayland), the letter
  is committed whole with `Main.inputMethod.commit()` — independent of the
  active layout, `us` and `ru` alike;
- otherwise (an X11 client) it is sent as key events for the letter's keysym
  from a Clutter virtual keyboard device. That only produces a character whose
  keysym the current keymap can type, so in an X11 application the Serbian
  letters may not arrive.

Backspace, Enter and space are always key events from the virtual device.

**Pitfall — never answer `EVENT_STOP` on the keyboard's own press.** The drag
handler sits on the keyboard, the ancestor of every key. In Shell 50 an
ancestor answering `EVENT_STOP` for a press cancels St.Button's click gesture,
which left every key dead. The press handler always propagates and starts a drag
only when the picked actor is the keyboard itself (the same rule as the break
timer's message).

## Departure from the UX rules

[`desktop.md` rule 1](../../../.claude/rules/ux/desktop.md) says every layer is
dismissed by `Escape`. This keyboard cannot hear `Escape`: taking keyboard focus
to hear it would take it from the text being typed. It closes by the hide key or
by the panel button, both one click.

## Tests

- `tests/screenKeyboard.test.mjs` — both alphabets are complete, the scripts
  share key positions, capitals, the option parser, placement.
- `tests/ui/t-28-screen-keyboard.sh` — end to end in a headless shell: clicks
  type Cyrillic, a capital and Latin into a GTK entry that keeps the focus;
  Backspace and Enter arrive; the keyboard drags and keeps script and place.
