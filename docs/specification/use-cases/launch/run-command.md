# "One click for a command line I run all day"

`@tag:use-case` `@tag:widget-launch`

Back to [launch](index.md) · [use cases](../index.md).

**Goal.** A command I type several times a day — a terminal running `htop`, a
VPN script, a program with no desktop entry — should be a button.

## Also assumes

A **Launch** widget on the panel with its command set; that is the configure-side
case [`../configure/several-instances.md`](../configure/several-instances.md).

## Steps

1. **Click the button.** The command runs.

**Cost.** One click — the shortest interaction on the panel, which is the whole
point of paying for it once in preferences.

## Variants

- **Several of them.** **Launch** is multi-instance on purpose: add it as many
  times as you have commands, each with its own
  [icon](../steps.md#s10), label and command line
  ([`../configure/several-instances.md`](../configure/several-instances.md)).
- **Nothing happened.** An empty command does nothing by design; and the command
  runs as your session runs it, so check it works in a terminal first.
- **It has a desktop entry after all.** Then the applications menu already finds
  it by name — [`find-application.md`](find-application.md) — and no button is
  needed.
- **I want the flag added permanently to an existing entry** instead of a second
  button: [`edit-application.md`](edit-application.md).

## Result

The command runs; the button does not track it, report it or wait for it. What
it started is a normal process of your session.
