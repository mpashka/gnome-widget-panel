#!/usr/bin/env -S gjs -m
// @tag:ui-testing @tag:mechanism
//
// Builds every widget's settings UI and clicks through it, the way a user
// pressing each gear button would. It exists because that button failing is
// invisible: `prefs.ts`'s `_openWidgetPreferences` catches the error, logs it
// and returns, so a broken settings page looks exactly like a dead button.
//
// Two such regressions have shipped, both the same defect — a GObject
// initializer handed `undefined` for an optional property (`tooltip_text` in
// `colorButton`, `subtitle` in `durationRow`). Neither is visible to `tsc`
// (these files are `// @ts-nocheck`) and neither is reachable from the gi-free
// unit tests, so this runner is the only place that can catch the class.
//
// Run: tests/prefs/run.sh (needs a display; the UI suite's headless shell
// provides one in CI).

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';

const ROOT = GLib.getenv('GWP_PREFS_TEST_ROOT') ?? '.';


// Depth-first walk of a GTK widget tree.
function* descendants(widget) {
    let child = widget?.get_first_child?.() ?? null;
    while (child) {
        yield child;
        yield* descendants(child);
        child = child.get_next_sibling();
    }
}


// A control whose whole job is to open a modal chooser (the colour rows'
// Gtk.ColorDialogButton). Pressing it really does map a dialog, which is not
// what this test is about, and the dialog's pending cancellable then aborts
// GTK at finalize. Their construction is still covered: they are built with
// the page.
function opensAModalChooser(widget) {
    for (let w = widget; w; w = w.get_parent()) {
        const name = w.constructor?.$gtype?.name ?? '';
        if (name.endsWith('DialogButton'))
            return true;
    }
    return false;
}


// Every control a user could press on this page. Rows are included because an
// Adw.ActionRow with an activatable widget acts on activation, not on a click.
function pressables(page) {
    const out = [];
    for (const w of descendants(page)) {
        if (opensAModalChooser(w))
            continue;
        if (w instanceof Gtk.Button && w.sensitive && !(w instanceof Gtk.ToggleButton))
            out.push({widget: w, signal: 'clicked'});
        else if (w instanceof Adw.ActionRow && w.activatable)
            out.push({widget: w, signal: 'activated'});
    }
    return out;
}


function describe(control) {
    const w = control.widget;
    return w.title || w.label || w.icon_name || w.get_tooltip_text?.() || w.constructor.$gtype.name;
}


// One widget: build its page, then press everything on it, then do the same on
// every subpage that pressing opened. Depth is bounded because a subpage can
// open a subpage (break-timer: widget page -> per-timer page).
function checkWidget(descriptor, module, failures) {
    const pending = [];
    const shim = {
        add: page => pending.push({page, title: descriptor.label, depth: 0}),
        push_subpage: navPage => pending.push({
            page: navPage,
            title: `${descriptor.label} / ${navPage.title ?? 'subpage'}`,
            depth: 1,
        }),
        pop_subpage: () => {},
    };

    try {
        module.fillWidgetPreferences({
            window: shim,
            options: {},
            save: () => {},
        });
    } catch (error) {
        failures.push(`${descriptor.id}: building the settings page threw: ${error}`);
        return 0;
    }

    let pressed = 0;
    const MAX_DEPTH = 3;
    while (pending.length > 0) {
        const {page, title, depth} = pending.shift();
        if (depth > MAX_DEPTH)
            continue;
        for (const control of pressables(page)) {
            const before = pending.length;
            try {
                control.widget.emit(control.signal);
                pressed++;
            } catch (error) {
                failures.push(`${descriptor.id}: "${describe(control)}" on ${title} threw: ${error}`);
                continue;
            }
            // Anything the press pushed is itself a page to press through.
            for (let i = before; i < pending.length; i++)
                pending[i].depth = depth + 1;
        }
    }
    return pressed;
}


async function main() {
    Gtk.init();
    Adw.init();

    const registryPath = `file://${GLib.canonicalize_filename(
        `${ROOT}/extension/plugins/registry.js`, null)}`;
    const {PLUGIN_DESCRIPTORS} = await import(registryPath);

    const withPrefs = PLUGIN_DESCRIPTORS.filter(d => d.hasPreferences);
    if (withPrefs.length === 0) {
        printerr('no widget declares hasPreferences — the registry did not load');
        return 1;
    }

    const failures = [];
    let checked = 0;
    for (const descriptor of withPrefs) {
        if (typeof descriptor.loadPreferences !== 'function') {
            failures.push(`${descriptor.id}: hasPreferences is set but loadPreferences is missing`);
            continue;
        }
        let module;
        try {
            module = await descriptor.loadPreferences();
        } catch (error) {
            failures.push(`${descriptor.id}: its prefs module failed to load: ${error}`);
            continue;
        }
        if (typeof module.fillWidgetPreferences !== 'function') {
            failures.push(`${descriptor.id}: its prefs module exports no fillWidgetPreferences`);
            continue;
        }
        const pressed = checkWidget(descriptor, module, failures);
        checked++;
        print(`  ${descriptor.id}: settings page built, ${pressed} control(s) pressed`);
    }

    print(`\n${checked}/${withPrefs.length} widget settings pages checked`);
    if (failures.length > 0) {
        printerr(`\n${failures.length} failure(s):`);
        for (const failure of failures)
            printerr(`  - ${failure}`);
        return 1;
    }
    print('all widget settings pages open and survive being clicked through');
    return 0;
}


imports.system.exit(await main());
