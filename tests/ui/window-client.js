// @tag:ui-testing
//
// Test client for the headless UI session: opens one GTK window per title
// argument, all under a single application id, so the shell tracks them as ONE
// application with several windows — what the app-windows widget lists.
//
//   gjs -m tests/ui/window-client.js "Alpha" "Beta"
//
// Spawned from inside the shell process (see t-20-app-windows.sh) so it
// inherits WAYLAND_DISPLAY and connects to the test compositor. It quits by
// itself after LIFETIME_SECONDS: a client that outlived a failed test would
// keep a window on somebody's real session.

import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import system from 'system';

const LIFETIME_SECONDS = 120;

const titles = system.programArgs.length > 0
    ? system.programArgs
    : ['Test window'];

const app = new Gtk.Application({application_id: 'org.gwp.TestWindows'});

app.connect('activate', () => {
    for (const title of titles) {
        new Gtk.ApplicationWindow({
            application: app,
            title,
            default_width: 320,
            default_height: 200,
        }).present();
    }
});

GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, LIFETIME_SECONDS, () => {
    app.quit();
    return GLib.SOURCE_REMOVE;
});

app.run([]);
