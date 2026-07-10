// @ts-nocheck
// @tag:prefs-template
//
// Shared multi-line tooltip-template editor used by widget prefs.ts modules
// (cpu-load-monitor, ai-agent-usage, ai-agent-status, break-timer). Persists
// the template to `current.template` on every change and re-renders the
// caller's sample fragments through the shared renderer, showing an error
// hint if the markup is invalid.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {renderTemplate} from './tooltipTemplate.js';

export function addTemplateEditor(group, current, commit, {hint, sampleFragments, trim = false, defaultTemplate}) {
    const initial = typeof current.template === 'string'
        ? current.template
        : defaultTemplate;

    const frame = new Gtk.Frame({margin_top: 6});
    const scrolled = new Gtk.ScrolledWindow({
        min_content_height: 72,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
    });
    const textView = new Gtk.TextView({
        monospace: true,
        top_margin: 6,
        bottom_margin: 6,
        left_margin: 6,
        right_margin: 6,
        wrap_mode: Gtk.WrapMode.WORD_CHAR,
    });
    const buffer = textView.get_buffer();
    buffer.set_text(initial, -1);
    scrolled.set_child(textView);
    frame.set_child(scrolled);
    group.add(frame);

    const hintLabel = new Gtk.Label({
        label: hint,
        xalign: 0,
        wrap: true,
        margin_top: 4,
    });
    hintLabel.add_css_class('dim-label');
    group.add(hintLabel);

    const preview = new Gtk.Label({
        use_markup: true,
        xalign: 0,
        wrap: true,
        selectable: true,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 8,
        margin_end: 8,
    });
    preview.add_css_class('card');
    group.add(preview);

    const updatePreview = () => {
        const template = typeof current.template === 'string'
            ? current.template
            : defaultTemplate;
        try {
            let markup = renderTemplate(template, sampleFragments);
            if (trim)
                markup = markup.replace(/\n+$/, '');
            Pango.parse_markup(markup, -1, '\0');
            preview.remove_css_class('error');
            preview.set_markup(markup);
        } catch (error) {
            preview.add_css_class('error');
            preview.set_text(`Invalid template: ${error?.message ?? error}`);
        }
    };

    buffer.connect('changed', () => {
        const [start, end] = [buffer.get_start_iter(), buffer.get_end_iter()];
        current.template = buffer.get_text(start, end, false);
        commit();
        updatePreview();
    });
    updatePreview();
}
