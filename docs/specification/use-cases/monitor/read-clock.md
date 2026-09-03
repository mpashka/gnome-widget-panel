# "What time is it — and what is next?"

`@tag:use-case` `@tag:widget-clock`

Back to [monitor](index.md) · [use cases](../index.md).

**Goal.** I want the time where I am looking, and the calendar and notifications
one click away — the two things the GNOME top bar was giving me.

## Steps

1. **Glance at the Clock widget** — it is text, in whatever format you set
   (`%H:%M` by default), and it also mirrors GNOME's notifications indicator.
2. [S3](../steps.md#s3) on it — GNOME's own calendar and notification popup
   opens. Clicking again closes it.

**Cost.** Zero clicks for the time, one for the calendar.

## Variants

- **A different format.** The **format** setting is a strftime string —
  `%a %d %b %H:%M` for a date, `%H:%M:%S` for seconds
  ([`../configure/tune-widget.md`](../configure/tune-widget.md)).
- **Make part of it stand out.** The same field accepts a small markup subset —
  `<b>`, `<i>`, `<u>`, `<small>`, `<big>` and
  `<span foreground="#ff8800">…</span>`; for example
  `<b>%H:%M</b><small>:%S</small>` keeps the seconds quiet. The settings page
  previews the result live and reports invalid markup; if broken markup reaches
  the panel anyway, the time is shown unstyled rather than disappearing.
- **A vertical panel.** The time reads bottom→top or top→bottom depending on
  which vertical mode you chose
  ([`../setup/orientation.md`](../setup/orientation.md)).
- **I have unread notifications.** The clock shows GNOME's notification
  indicator, and the click opens the list — the same popup as the top bar's.

## Result

Nothing changes. The format [applies live](../steps.md#r1) as you type it in
preferences, so you can see the result before you accept it.
