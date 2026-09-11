// @ts-nocheck
// @tag:prefs-duration
//
// Shared duration row for widget settings: the value written the way it is read
// (`30 s`, `45 min`, `1:30`) and two buttons whose step follows the value, so a
// daily limit of eight hours and a micro break of thirty seconds are edited with
// the same control and neither takes a hundred clicks.
//
// Replaces `Adw.SpinRow` for durations: a spin row has one fixed step, and its
// value is a bare number — which is how a settings page ends up asking somebody
// to enter "480" for eight hours. The stepping and formatting rules themselves
// are gi-free and unit-tested in `duration.ts`.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {formatClock, stepDuration} from './duration.js';
import {definedProps} from './props.js';

function stepButton(iconName, tooltip) {
    const button = new Gtk.Button({
        icon_name: iconName,
        valign: Gtk.Align.CENTER,
        tooltip_text: tooltip,
    });
    button.add_css_class('flat');
    button.add_css_class('circular');
    return button;
}


/**
 * A row editing one duration in seconds.
 *
 * - `range` is `[min, max]` in seconds and is enforced by the buttons.
 * - `step` overrides the adaptive ladder with a fixed one. For a *time of day*
 *   rather than a length: the ladder's half-hour jumps past three hours are
 *   right for "work for 8 hours" and wrong for "stop at 21:45".
 * - `zeroLabel` names the value 0 when it means something other than "none"
 *   (the break timer's warn-ahead: 0 = derive it from the break length).
 * - `onChange(seconds)` fires on every press, so the caller persists as usual.
 */
export function durationRow({title, subtitle, seconds, range, step, zeroLabel, onChange}) {
    let value = Math.min(range[1], Math.max(range[0], Math.round(seconds)));

    // definedProps: an omitted `subtitle` must not reach the initializer —
    // GJS throws on `undefined` there, and the prefs subpage loader swallows
    // the error, so the widget's settings button silently does nothing.
    // See props.ts; this is the same defect the colour rows already hit.
    const row = new Adw.ActionRow(definedProps({title, subtitle}));
    const label = new Gtk.Label({valign: Gtk.Align.CENTER, width_chars: 7});
    label.add_css_class('numeric');
    const minus = stepButton('list-remove-symbolic', 'Less');
    const plus = stepButton('list-add-symbolic', 'More');

    const render = () => {
        label.set_label(
            value === 0 && zeroLabel ? zeroLabel : formatClock(value)
        );
        minus.sensitive = value > range[0];
        plus.sensitive = value < range[1];
    };

    const move = (direction) => {
        const next = step > 0
            ? Math.min(range[1], Math.max(range[0],
                (direction > 0
                    ? Math.floor(value / step) + 1
                    : Math.ceil(value / step) - 1) * step))
            : stepDuration(value, direction, range);
        if (next === value)
            return;
        value = next;
        render();
        onChange(value);
    };

    minus.connect('clicked', () => move(-1));
    plus.connect('clicked', () => move(1));

    render();
    row.add_suffix(minus);
    row.add_suffix(label);
    row.add_suffix(plus);
    return row;
}
