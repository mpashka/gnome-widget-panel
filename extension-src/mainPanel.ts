// @ts-nocheck
// @tag:main-panel
//
// Controls the GNOME Shell top bar (the "main panel", `Main.layoutManager
// .panelBox`) independently of the floating mini panel. Three modes:
//
//   'visible'  — leave the top bar untouched (the extension never hides it);
//   'hide'     — keep it permanently hidden (including the overview);
//   'autohide' — hide it, but slide it back in when the pointer reaches the top
//                screen edge (a Meta pressure barrier) and while the Activities
//                overview is open.
//
// This is the built-in replacement for the "Hide Top Bar" extension: it
// reimplements that extension's proven core (a `Layout.PressureBarrier` on the
// top monitor edge plus a slide animation on `panelBox.y`) minus the extras we
// do not need (intellihide, keyboard shortcut, desktop-icons integration).
// Enabling Hide Top Bar and a non-'visible' mode here at the same time makes two
// controllers fight over the same actor; the preferences UI warns against it.
//
// The mode string mirrors the `main-panel` GSettings enum
// (see schemas/…gschema.xml). Lifecycle discipline (Shell 50): every barrier,
// pointer watch, signal and timer is released in destroy().

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

const PANELBOX = Main.layoutManager.panelBox;
const ShellActionMode = Shell.ActionMode ?? Shell.KeyBindingMode;
const shellVersion = parseFloat(Config.PACKAGE_VERSION);

// Slide animation duration (ms) and pressure-barrier tuning. Fixed defaults
// chosen to feel like Hide Top Bar's out-of-the-box behaviour; not currently
// user-configurable (the panel only exposes the three-way mode).
const ANIM_TIME_MS = 200;
const PRESSURE_THRESHOLD = 100;
const PRESSURE_TIMEOUT_MS = 1000;

// Valid mode strings, mirroring the `main-panel` GSettings enum nicks.
export const MainPanelMode = {
    VISIBLE: 'visible',
    AUTOHIDE: 'autohide',
    HIDE: 'hide',
};

function normalizeMode(mode) {
    switch (mode) {
        case MainPanelMode.AUTOHIDE:
        case MainPanelMode.HIDE:
            return mode;
        default:
            return MainPanelMode.VISIBLE;
    }
}

export class MainPanelController {
    constructor(mode) {
        // Natural (shown) Y of the top bar; captured while it is visible.
        this._baseY = PANELBOX.y;
        this._mode = MainPanelMode.VISIBLE;
        // Whether we currently own/hide the top bar (mode !== visible).
        this._active = false;
        this._animating = false;
        this._chromeAdjusted = false;

        // Autohide reveal machinery.
        this._pressure = null;
        this._barrier = null;
        this._pointerWatcher = PointerWatcher.getPointerWatcher();
        this._pointerListener = null;
        this._staticBox = new Clutter.ActorBox();
        this._searchEntryBin =
            Main.overview?._overview?._controls?._searchEntryBin ?? null;

        // Signals ([obj, id]) and timers to release in destroy().
        this._signals = [];
        this._hideTimeoutId = 0;
        this._menuBlocker = null;
        this._menuBlockerId = 0;

        this.setMode(mode);
    }

    // True while this controller is the authority over the top bar, i.e. the
    // floating panel must not also poke `panelBox`. Callers gate their own
    // legacy top-bar manipulation on this.
    ownsTopBar() {
        return this._mode !== MainPanelMode.VISIBLE;
    }

    setMode(mode) {
        const next = normalizeMode(mode);
        if (next === this._mode && this._applied)
            return;
        this._mode = next;
        this._applied = true;
        this._apply();
    }

    _apply() {
        if (this._mode === MainPanelMode.VISIBLE) {
            this._deactivate();
            return;
        }
        this._activate();
    }

    // ---- activation / deactivation -------------------------------------

    _activate() {
        // (Re)capture the natural position while the bar is still shown, then
        // stop it from reserving screen space and wire the reveal triggers.
        if (!this._active) {
            this._baseY = PANELBOX.y;
            this._setChromeStruts(false);
            this._connectSignals();
            this._active = true;
        }

        // 'autohide' needs the pressure barrier and overview reveal; 'hide'
        // stays down unconditionally, so tear the barrier down if present.
        if (this._mode === MainPanelMode.AUTOHIDE) {
            this._enablePressureBarrier();
            // If the overview is already open, keep the bar shown there.
            if (Main.overview.visible) {
                this.show(0, 'activate-overview');
                this._updateSearchEntryPadding(true);
                return;
            }
            this._updateSearchEntryPadding(true);
        } else {
            this._disablePressureBarrier();
            this._updateSearchEntryPadding(false);
        }

        this.hide(0, 'activate');
    }

    _deactivate() {
        if (!this._active)
            return;
        this._active = false;
        this._disablePressureBarrier();
        this._disconnectSignals();
        this._clearHideTimeout();
        this._releaseMenuBlocker();
        this._updateSearchEntryPadding(false);
        // Restore the bar and its strut reservation.
        this.show(0, 'deactivate');
        this._setChromeStruts(true);
    }

    // Toggle whether the top bar reserves work-area space. Mirrors Hide Top
    // Bar: re-add the panelBox to the chrome with affectsStruts flipped.
    _setChromeStruts(affectsStruts) {
        if (affectsStruts === this._chromeAffects && this._chromeAdjusted)
            return;
        Main.layoutManager.removeChrome(PANELBOX);
        Main.layoutManager.addChrome(PANELBOX, {
            affectsStruts,
            trackFullscreen: true,
        });
        this._chromeAdjusted = true;
        this._chromeAffects = affectsStruts;
    }

    // ---- show / hide ---------------------------------------------------

    hide(animMs, _trigger) {
        this._clearHideTimeout();
        if (this._animating) {
            PANELBOX.remove_all_transitions();
            this._animating = false;
        }
        const targetY = this._baseY - PANELBOX.height;
        if (animMs <= 0) {
            PANELBOX.y = targetY;
            PANELBOX.hide();
            return;
        }
        this._animating = true;
        PANELBOX.ease({
            y: targetY,
            duration: animMs,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animating = false;
                PANELBOX.hide();
            },
        });
    }

    show(animMs, _trigger) {
        this._clearHideTimeout();
        if (this._animating) {
            PANELBOX.remove_all_transitions();
            this._animating = false;
        }
        PANELBOX.show();
        if (animMs <= 0) {
            PANELBOX.y = this._baseY;
            this._afterShown();
            return;
        }
        this._animating = true;
        PANELBOX.ease({
            y: this._baseY,
            duration: animMs,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._animating = false;
                this._afterShown();
            },
        });
    }

    // After the bar is fully shown (autohide only): if the pointer already left
    // the bar, start hiding; otherwise watch the pointer so we hide on leave.
    _afterShown() {
        if (this._mode !== MainPanelMode.AUTOHIDE || Main.overview.visible)
            return;
        this._updateStaticBox();
        const [x, y] = global.get_pointer();
        if (!this._isHovering(x, y))
            this._handleMenus();
        else if (!this._pointerListener)
            this._pointerListener = this._pointerWatcher.addWatch(
                10,
                this._handlePointer.bind(this)
            );
    }

    _isHovering(x, y) {
        return (
            y >= this._staticBox.y1 &&
            y < this._staticBox.y2 &&
            x >= this._staticBox.x1 &&
            x < this._staticBox.x2
        );
    }

    _handlePointer(x, y) {
        if (!this._animating && !this._isHovering(x, y))
            this._handleMenus();
    }

    // Do not hide while a top-bar menu (e.g. the calendar or quick settings) is
    // open; hide once it closes.
    _handleMenus() {
        if (Main.overview.visible)
            return;
        const blocker = Main.panel.menuManager.activeMenu;
        if (blocker == null) {
            this._stopPointerWatch();
            this.hide(ANIM_TIME_MS, 'pointer-left');
            return;
        }
        this._releaseMenuBlocker();
        this._menuBlocker = blocker;
        this._menuBlockerId = blocker.connect('open-state-changed', (menu, open) => {
            if (!open) {
                this._releaseMenuBlocker();
                this._handleMenus();
            }
        });
    }

    _releaseMenuBlocker() {
        if (this._menuBlocker && this._menuBlockerId) {
            this._menuBlocker.disconnect(this._menuBlockerId);
        }
        this._menuBlocker = null;
        this._menuBlockerId = 0;
    }

    _stopPointerWatch() {
        if (this._pointerListener) {
            this._pointerWatcher._removeWatch(this._pointerListener);
            this._pointerListener = null;
        }
    }

    _clearHideTimeout() {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }
    }

    // ---- pressure barrier ----------------------------------------------

    _enablePressureBarrier() {
        this._disablePressureBarrier();
        this._pressure = new Layout.PressureBarrier(
            PRESSURE_THRESHOLD,
            PRESSURE_TIMEOUT_MS,
            ShellActionMode.NORMAL
        );
        this._pressure.connect('trigger', () => {
            if (Main.layoutManager.primaryMonitor?.inFullscreen)
                return;
            this.show(ANIM_TIME_MS, 'pressure');
        });
        this._barrier = new Meta.Barrier({
            // Shell 46+ uses `backend:`; only the long-dead 45 used `display:`.
            ...(shellVersion < 46
                ? {display: global.display}
                : {backend: global.backend}),
            x1: PANELBOX.x,
            x2: PANELBOX.x + PANELBOX.width,
            y1: this._baseY,
            y2: this._baseY,
            directions: Meta.BarrierDirection.POSITIVE_Y,
        });
        this._pressure.addBarrier(this._barrier);
    }

    _disablePressureBarrier() {
        this._stopPointerWatch();
        if (this._barrier && this._pressure) {
            this._pressure.removeBarrier(this._barrier);
            this._barrier.destroy();
        }
        this._barrier = null;
        this._pressure = null;
    }

    // ---- geometry / overview -------------------------------------------

    _updateStaticBox() {
        this._staticBox.init_rect(
            PANELBOX.x,
            this._baseY,
            PANELBOX.width,
            PANELBOX.height
        );
    }

    // In autohide the bar overlaps the overview search entry (it no longer
    // reserves struts), so pad the entry down by the bar height, matching Hide
    // Top Bar. Cleared in every other case.
    _updateSearchEntryPadding(pad) {
        if (!this._searchEntryBin)
            return;
        if (!pad || !Main.layoutManager.primaryMonitor) {
            this._searchEntryBin.set_style(null);
            return;
        }
        const scale = Main.layoutManager.primaryMonitor.geometry_scale || 1;
        const offset = PANELBOX.height / scale;
        this._searchEntryBin.set_style(`padding-top: ${offset}px;`);
    }

    // ---- signals -------------------------------------------------------

    _connect(obj, name, cb) {
        this._signals.push([obj, obj.connect(name, cb)]);
    }

    _connectSignals() {
        this._connect(Main.overview, 'showing', () => {
            if (this._mode === MainPanelMode.AUTOHIDE)
                this.show(ANIM_TIME_MS, 'overview-showing');
        });
        this._connect(Main.overview, 'hiding', () => {
            this.hide(ANIM_TIME_MS, 'overview-hiding');
        });
        // A pointer leaving the top bar should let it hide again.
        this._connect(Main.panel, 'leave-event', () => {
            if (this._mode === MainPanelMode.AUTOHIDE && !this._animating)
                this._handleMenus();
        });
        // Track geometry changes so the barrier/hover box follow the monitor.
        this._connect(PANELBOX, 'notify::height', () => {
            this._updateStaticBox();
            if (this._mode === MainPanelMode.AUTOHIDE)
                this._updateSearchEntryPadding(true);
        });
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this._baseY = PANELBOX.y;
            this._updateStaticBox();
            if (this._mode === MainPanelMode.AUTOHIDE)
                this._enablePressureBarrier();
        });
    }

    _disconnectSignals() {
        for (const [obj, id] of this._signals) {
            try {
                obj.disconnect(id);
            } catch (e) {
                // object already gone
            }
        }
        this._signals = [];
    }

    // ---- teardown ------------------------------------------------------

    destroy() {
        this._deactivate();
        this._chromeAdjusted = false;
    }
}
