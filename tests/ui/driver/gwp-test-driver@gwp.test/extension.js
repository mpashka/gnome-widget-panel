// @tag:ui-testing
//
// Test-only driver extension for the UI test harness (see ../../lib.sh and
// ../../../../docs/ui-testing.md). It exports org.gwp.TestDriver with a single
// Eval(script) -> (success, json) method on the session bus, replacing
// org.gnome.Shell.Eval, which GNOME Shell 50 no longer offers (the
// --unsafe-mode switch was removed).
//
// SECURITY: this is deliberately an arbitrary-code-execution endpoint. It is
// only ever enabled inside the throwaway, fully isolated test session that
// tests/ui/lib.sh creates (own dbus-run-session bus, own XDG_DATA_HOME
// extensions dir, own dconf profile). Never install or enable it in a real
// session.
//
// The eval runs inside this module's scope, so scripts can use the imports
// below (Main, Clutter, St, Shell, Meta, Gio, GLib) directly. If the evaluated
// expression returns a Promise/thenable, the driver awaits it and returns the
// resolved value, so async shell APIs (e.g. screenshots) work in one call.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const BUS_NAME = 'org.gwp.TestDriver';
const OBJECT_PATH = '/org/gwp/TestDriver';

const DRIVER_IFACE = `
<node>
  <interface name="org.gwp.TestDriver">
    <method name="Eval">
      <arg type="s" direction="in" name="script"/>
      <arg type="b" direction="out" name="success"/>
      <arg type="s" direction="out" name="result"/>
    </method>
  </interface>
</node>`;

// Referenced so the imports are demonstrably used (and kept for eval scope).
const _EVAL_SCOPE = {Clutter, Gio, GLib, Meta, Shell, St, Main};

export default class GwpTestDriver extends Extension {
    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(DRIVER_IFACE, this);
        this._dbus.export(Gio.DBus.session, OBJECT_PATH);
        this._nameId = Gio.DBus.session.own_name(
            BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            null,
            null
        );
        console.log(`gwp-test-driver: exported ${BUS_NAME}${OBJECT_PATH}`);
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

    // Async D-Bus handler (GJS convention: <Method>Async(params, invocation)).
    //
    // The result payload (JSON on success, the error text on failure) is
    // base64-encoded. Rationale: the harness reads the reply through
    // `gdbus call`, whose GVariant printing escapes strings (and switches
    // between quoting styles when the payload contains apostrophes), which is
    // not reliably reversible with shell tools. Base64 output contains no
    // quotes or backslashes, so the bash side can strip the constant wrapper
    // and `base64 -d` the rest.
    EvalAsync(params, invocation) {
        const [script] = params;
        const reply = (ok, text) => invocation.return_value(
            new GLib.Variant('(bs)', [
                ok,
                GLib.base64_encode(new TextEncoder().encode(text)),
            ])
        );
        Promise.resolve()
            .then(() => eval(script)) // thenable results are awaited by .then
            .then((value) => {
                let json = '';
                try {
                    json = JSON.stringify(value) ?? '';
                } catch (e) {
                    json = `<unserializable: ${e}>`;
                }
                reply(true, json);
            })
            .catch((error) => reply(false, `${error}`));
    }
}
