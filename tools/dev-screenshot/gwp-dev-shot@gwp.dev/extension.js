// @tag:dev-screenshot
//
// Dev-only screenshot driver for debugging GNOME Widget Panel UI bugs. It runs
// inside gnome-shell, so it can use the internal Shell.Screenshot GObject
// directly — the same one org.gnome.Shell.Screenshot wraps, but WITHOUT the
// sender check that makes external `gdbus`/portal calls fail with AccessDenied
// on GNOME 44+. The CLI (`tools/dev-screenshot/gwp-shot`) drives it over the
// session bus.
//
// SCOPE: this is NOT part of the product. It lives under tools/ (outside the
// packed extension/ tree) and is never shipped in a release. An agent installs
// and enables it for a debug session and removes it afterwards; see
// tools/dev-screenshot/README.md and docs/development.md.
//
// A fresh install can be enabled live (`gnome-extensions enable`) without a
// logout — the relogin tax only applies to reloading an already-cached module.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BUS_NAME = 'org.gwp.DevShot';
const OBJECT_PATH = '/org/gwp/DevShot';

const IFACE = `
<node>
  <interface name="org.gwp.DevShot">
    <method name="Screenshot">
      <arg type="b" direction="in"  name="include_cursor"/>
      <arg type="s" direction="in"  name="path"/>
      <arg type="b" direction="out" name="success"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="ScreenshotArea">
      <arg type="i" direction="in"  name="x"/>
      <arg type="i" direction="in"  name="y"/>
      <arg type="i" direction="in"  name="width"/>
      <arg type="i" direction="in"  name="height"/>
      <arg type="s" direction="in"  name="path"/>
      <arg type="b" direction="out" name="success"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="PanelBounds">
      <arg type="b" direction="out" name="success"/>
      <arg type="s" direction="out" name="result"/>
    </method>
  </interface>
</node>`;

// Open a fresh output stream for the PNG, replacing any existing file.
function openStream(path) {
    return Gio.File.new_for_path(path)
        .replace(null, false, Gio.FileCreateFlags.NONE, null);
}

// The (success, result) reply tuple returned by every async handler.
function reply(success, result) {
    return new GLib.Variant('(bs)', [success, String(result)]);
}

// Depth-first search of the stage for the floating panel actor, identified by
// its GObject class name so this tool stays decoupled from the panel's markup.
function findPanel() {
    const stack = [global.stage];
    while (stack.length) {
        const actor = stack.pop();
        if (!actor)
            continue;
        if (actor.constructor?.name === 'FloatingMiniPanel')
            return actor;
        for (const child of actor.get_children?.() ?? [])
            stack.push(child);
    }
    return null;
}

export default class GwpDevShot extends Extension {
    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, OBJECT_PATH);
        this._nameId = Gio.DBus.session.own_name(
            BUS_NAME, Gio.BusNameOwnerFlags.NONE, null, null);
        console.log(`gwp-dev-shot: exported ${BUS_NAME}${OBJECT_PATH}`);
    }

    disable() {
        if (this._nameId) {
            Gio.DBus.session.unown_name(this._nameId);
            this._nameId = 0;
        }
        if (this._dbus) {
            this._dbus.unexport();
            this._dbus = null;
        }
    }

    // Full-stage capture. GJS async D-Bus convention: <Method>Async(params, inv).
    ScreenshotAsync([includeCursor, path], invocation) {
        try {
            const shooter = new Shell.Screenshot();
            const stream = openStream(path);
            shooter.screenshot(includeCursor, stream, (o, res) => {
                try {
                    shooter.screenshot_finish(res);
                    stream.close(null);
                    invocation.return_value(reply(true, path));
                } catch (error) {
                    invocation.return_value(reply(false, `${error}`));
                }
            });
        } catch (error) {
            invocation.return_value(reply(false, `${error}`));
        }
    }

    // Rectangle capture (physical stage pixels).
    ScreenshotAreaAsync([x, y, width, height, path], invocation) {
        try {
            const shooter = new Shell.Screenshot();
            const stream = openStream(path);
            shooter.screenshot_area(x, y, width, height, stream, (o, res) => {
                try {
                    shooter.screenshot_area_finish(res);
                    stream.close(null);
                    invocation.return_value(reply(true, path));
                } catch (error) {
                    invocation.return_value(reply(false, `${error}`));
                }
            });
        } catch (error) {
            invocation.return_value(reply(false, `${error}`));
        }
    }

    // Transformed on-screen bounds of the widget panel, as JSON {x,y,width,
    // height} — feed straight into ScreenshotArea to grab just the panel.
    PanelBounds() {
        const panel = findPanel();
        if (!panel)
            return [false, 'FloatingMiniPanel actor not found (is the panel enabled?)'];
        const [x, y] = panel.get_transformed_position();
        const [w, h] = panel.get_transformed_size();
        const rect = {
            x: Math.round(x), y: Math.round(y),
            width: Math.round(w), height: Math.round(h),
        };
        return [true, JSON.stringify(rect)];
    }
}
