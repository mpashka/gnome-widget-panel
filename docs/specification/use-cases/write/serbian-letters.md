# "I am writing a message in Serbian, and my keyboard has no Serbian letters"

`@tag:use-case` `@tag:widget-screen-keyboard`

Back to [write](index.md) · [use cases](../index.md).

**Goal.** I am in a messenger with the cursor in the message field. The message
is in Serbian — in Latin (`Vidimo se u četvrtak`) or in Cyrillic
(`Видимо се у четвртак`). My keyboard has `us` and `ru` and no Serbian keys, and
I do not want a Serbian input source: a third layout breaks the habit of the two
I switch between.

**Frequency.** Occasionally — "sometimes", by the user's own account; not
measured.

## Steps

1. **Click the Screen keyboard button.** The keyboard opens next to it, in the
   script used last; the message field keeps the focus.
2. If the script is wrong, **click the bottom-left key** (`Lat` / `Ћир`).
3. **Latin:** type on the physical keyboard as usual and click only `č ć ž š đ`
   on the screen keyboard. **Cyrillic:** click the letters; spaces, digits and
   punctuation can still come from the physical keyboard.
4. **Click the button again** (or the hide key) when done.

**Cost.** 2 clicks to open and close, plus 1 click per Serbian letter the
physical keyboard lacks: in Latin one click for each `č ć ž š đ` — about one
word in three in ordinary text; in Cyrillic one click per letter.

**Before.** No route on the panel: a Serbian input source (the habit cost above
on every layout switch, all day), or copying letters from a web page (a browser
tab, a search, a copy and a paste per letter).

## Variants

- **A capital.** Click `⇧` first — it applies to one letter — or hold the
  physical Shift while clicking.
- **The keyboard covers the text.** Drag it by the gaps between the keys; it
  reopens where it was left.
- **Always the other script first.** *Script when first opened* in the widget's
  [settings](../configure/tune-widget.md).
- **Nothing arrives.** The application is an X11 one: those receive key events
  only for letters the current keymap can type — see the
  [widget page](../../../../extension-src/plugins/screen-keyboard/index.md).

## Result

The letters are in the message; the message field never lost the focus, so the
physical keyboard carries on where the click left off.
