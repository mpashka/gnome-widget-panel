// @tag:ui-testing @tag:widget-screen-keyboard
//
// Test client for the headless UI session: one GTK window with a focused text
// entry that writes its whole text to OUTPUT_FILE on every change, so a test can
// read back what reached the application.
//
//   gjs -m tests/ui/text-entry-client.js /tmp/out.txt
//
// Spawned from inside the shell (see t-28-screen-keyboard.sh) so it connects to
// the test compositor, and quits by itself after LIFETIME_SECONDS for the same
// reason as window-client.js.

import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import system from 'system';

const LIFETIME_SECONDS = 120;
const [outputFile] = system.programArgs;

const app = new Gtk.Application({application_id: 'org.gwp.TestTextEntry'});

app.connect('activate', () => {
    const entry = new Gtk.Entry();
    entry.connect('changed', () => GLib.file_set_contents(outputFile, entry.get_text()));
    entry.connect('activate', () => GLib.file_set_contents(`${outputFile}.activated`, entry.get_text()));
    const window = new Gtk.ApplicationWindow({
        application: app,
        title: 'Text entry',
        default_width: 360,
        default_height: 80,
        child: entry,
    });
    window.present();
    entry.grab_focus();
});

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LIFETIME_SECONDS, () => {
    app.quit();
    return GLib.SOURCE_REMOVE;
});

app.run([]);
