// @ts-nocheck
// @tag:mechanism @tag:ui
/*
 * Floating-Mini-Panel for GNOME Shell 46+
 *
 * Copyright 2024, 2025 Gerhard Himmel
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
// Issue #10
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {migrateLegacyConfigIfNeeded} from './configStore.js';
import * as ControlButton from './controlButton.js';
import * as MainPanel from './mainPanel.js';
import * as PluginManager from './pluginManager.js';
import * as Utils from './utils.js';
import {parseWidgetConfig} from './widgetConfig.js';

// Persistent variable until restart of GNOME Shell
// Needed when this is enabled during runtime.
let startupComplete = null;

const LAYOUTMANAGER = Main.layoutManager;
const PANEL = Main.panel;
const PANELBOX = LAYOUTMANAGER.panelBox;
const OVERVIEW = Main.overview;
const DISPLAY = global.display;
const QUICKSETTINGS = PANEL.statusArea['quickSettings'];

const shellVersion = parseFloat(Config.PACKAGE_VERSION);

// Panel-Hiding Extensions
const DTP_UUID = 'dash-to-panel@jderose9.github.com';
const HTB_UUID = 'hidetopbar@mathieu.bidon.ca';

const State = {
    OFF: 0,
    ON: 1,
    AUTO: 2,
};

const Alignment = {
    NONE: 0,
    TOP: 1,
    BOTTOM: 2,
    LEFT: 4,
    RIGHT: 8,
    CENTER: 16,
};

const FloatingMiniPanel = GObject.registerClass(
    class FloatingMiniPanel extends St.BoxLayout {
        constructor(sets, extensionPath, extension) {
            super({
                name: 'FloatingMiniPanel',
                style_class: 'button',
                reactive: true,
                can_focus: true,
                visible: false,
            });

            // Issue #10
            this._enaUnredirectFunc = null;

            this._sets = sets;
            this._extensionPath = extensionPath;
            this._extension = extension;
            this._state = this._sets.get_int('state');

            this.set_position(
                this._sets.get_int('pos-x'),
                this._sets.get_int('pos-y')
            );

            // Content padding (px) around the widgets' working body. Read before
            // orientation/relocate so _adjustBorder applies it. Guarded so a
            // stale/mismatched schema (missing this newer key) cannot throw out
            // of the constructor and disable the whole extension.
            this._contentPadding = this._getSettingInt('content-padding', 0);

            // START CODE VERTICAL
            this.orientStr = (shellVersion > 47) ? 'orientation' : 'vertical';
            this._setOrientation(this._orientationState().vertical);
            // END CODE VERTICAL

            // Live-apply panel-level preferences (see the "Panel" page in
            // prefs.ts). The settings window writes these keys; react without a
            // full Shell reload. Handlers are disconnected in destroy().
            this._alignedChangedId = this._sets.connect(
                'changed::aligned',
                () => this._relocate(false)
            );
            // One setting drives orientation: `orientation` ∈ {horizontal, left,
            // right}. `horizontal` lays out horizontally; `left`/`right` make a
            // vertical strip and rotate the graphs that way.
            this._orientationChangedId = this._sets.connect(
                'changed::orientation',
                () => {
                    this._setOrientation(this._orientationState().vertical);
                    this._applyPanelLayoutToPlugins();
                    this._relocate(false);
                }
            );
            this._contentPaddingChangedId = this._sets.connect(
                'changed::content-padding',
                () => {
                    this._contentPadding = this._getSettingInt('content-padding', 0);
                    this._relocate(false);
                }
            );

            this._panelHidingExts = [];

            // Main panel (GNOME top bar) behaviour -----------------------------
            // A dedicated controller owns the top bar for the non-'visible'
            // modes ('autohide' slides it in on a top-edge pressure barrier,
            // 'hide' keeps it down). While it owns the bar, the legacy
            // Permanent-mode top-bar hiding further down is suppressed (see
            // `_topBarManagedExternally`) so two controllers never fight over
            // `panelBox`. Guarded so a stale schema without the key cannot throw
            // out of the constructor and disable the whole extension.
            this._mainPanel = new MainPanel.MainPanelController(
                this._getMainPanelMode()
            );
            this._mainPanelChangedId = this._sets.connect(
                'changed::main-panel',
                () => this._mainPanel.setMode(this._getMainPanelMode())
            );

            // Control Button --------------------------------------------------
            this._ctlBtn = new ControlButton.ControlButton(this);
            this.add_child(this._ctlBtn);

            // Configured plugins ----------------------------------------------
            // `createConfiguredPlugins` returns an ARRAY of {id, actor} in
            // config order so a widget id may appear multiple times.
            this._plugins = PluginManager.createConfiguredPlugins(
                this,
                extensionPath,
                this._sets
            );
            for (const {actor} of this._plugins)
                this.add_child(actor);
            this._indsDrawer =
                this._plugins.find(p => p.id === 'app-notifications')?.actor ??
                null;

            // Apply orientation/rotation to layout-aware widgets (the graphs and
            // clock) NOW, when the plugins are built — NOT gated on `notify::mapped`
            // (which fired unreliably, so widgets never rotated in a vertical
            // panel). The graphs only swap size (no theme access); the clock's
            // TimeDrawer guards its size query on `get_stage()` and re-sizes on its
            // own map, so this is safe before the panel is on the stage.
            this._applyPanelLayoutToPlugins();

            // Live-reload widgets when the `widgets` GSettings key changes ----
            // Editing the config (via the settings UI or gsettings/dconf) must
            // apply per-widget settings and add/remove/reorder/enable changes
            // without a full GNOME Shell reload. A short debounce coalesces
            // bursts of writes (e.g. a spin button being held).
            this._reloadTimeoutId = null;
            this._widgetsChangedId = this._sets.connect(
                'changed::widgets',
                () => this._scheduleReloadPlugins()
            );

            // Apply the saved alignment on startup ----------------------------
            // The constructor above only restored the raw pos-x / pos-y. The
            // stored `aligned` value (edge snapping / centering) used to be
            // applied only on drag or on live preference changes, so a Position
            // preset chosen in preferences was ignored after a reload and the
            // panel stayed where it last was. Relocate now that the orientation
            // (orientStr) and the child actors are set, so the panel has a real
            // size and CENTER / edge snapping use the correct axis and geometry.
            // When `aligned === Alignment.NONE` this leaves the restored
            // floating position untouched (no alignment bits fire). Guarded so a
            // geometry failure here can never throw out of enable() and disable
            // the whole extension.
            // Defer to the first map: calling _relocate() during construction,
            // before the actor is on the stage, sets `this.style` and reads the
            // theme node, which floods St with "get_theme_node ... not in the
            // stage" warnings. Apply the saved alignment once mapped instead.
            this._initRelocateId = this.connect('notify::mapped', () => {
                if (!this.mapped)
                    return;
                this.disconnect(this._initRelocateId);
                this._initRelocateId = 0;
                // Apply orientation/rotation to layout-aware widgets now that the
                // actor is on the stage (the clock queries its label size, which
                // needs the theme node), then relocate.
                this._applyPanelLayoutToPlugins();
                try {
                    this._relocate(false);
                } catch (e) {
                    logError(e, 'FloatingMiniPanel: initial _relocate failed');
                }
            });

            // QuickSettings Toggle --------------------------------------------
            this._fmpQuickToggle = new QuickSettings.QuickMenuToggle({
                icon_name: 'view-restore-symbolic',
                title: 'Mini Panel',
                menu_enabled: true,
                toggleMode: true,
            });
            this._fmpQuickToggle.menu.setHeader(
                'view-restore-symbolic',
                'Mini Panel',
                null
            );
            this._autoItem = new PopupMenu.PopupImageMenuItem(
                'Automatic',
                null
            );
            this._fmpQuickToggle.menu.addMenuItem(this._autoItem);
            this._permItem = new PopupMenu.PopupImageMenuItem(
                'Permanent',
                null
            );
            this._fmpQuickToggle.menu.addMenuItem(this._permItem);

            // Initialize menu
            if (this._state === State.AUTO) {
                this._fmpQuickToggle.subtitle = this._autoItem.label.text;
                this._permItem.setOrnament(PopupMenu.Ornament.NONE);
                this._autoItem.setOrnament(PopupMenu.Ornament.CHECK);
            } else {
                this._fmpQuickToggle.subtitle = this._permItem.label.text;
                this._permItem.setOrnament(PopupMenu.Ornament.CHECK);
                this._autoItem.setOrnament(PopupMenu.Ornament.NONE);
            }

            // Initialize Toggle
            this._fmpQuickToggle.checked = this._state;

            // Menu item clicked
            this._fmpQuickToggle.menu.connect('activate', (obj, menuItem) => {
                if (this._fmpQuickToggle.subtitle !== menuItem.label.text) {
                    QUICKSETTINGS.menu.close();
                    this._autoItem.setOrnament(PopupMenu.Ornament.NONE);
                    this._permItem.setOrnament(PopupMenu.Ornament.NONE);
                    switch (menuItem) {
                        case this._autoItem:
                            if (this.visible) this._hideFloatingMiniPanel();
                            this._preparePermanentMode(false);
                            this._state = State.AUTO;
                            if (Utils.panelBoxHidden()) {
                                this._showFloatingMiniPanel();
                            }
                            break;
                        case this._permItem:
                            this._state = State.ON;
                            this._preparePermanentMode(true);
                            if (!OVERVIEW.visible)
                                this._showFloatingMiniPanel();
                            break;
                        default:
                    }
                    this._sets.set_int('state', this._state);
                    menuItem.setOrnament(PopupMenu.Ornament.CHECK);
                    this._fmpQuickToggle.subtitle = menuItem.label.text;
                    this._fmpQuickToggle.checked = true;
                    if (this.visible || PANELBOX.visible)
                        QUICKSETTINGS.menu.open();
                }
                return Clutter.Event_STOP;
            });

            // Toggle clicked
            this._fmpQuickToggle.connect('clicked', () => {
                QUICKSETTINGS.menu.close();
                if (this._state !== State.OFF) {
                    this._hideFloatingMiniPanel();
                    this._preparePermanentMode(false);
                    this._state = State.OFF;
                    this._sets.set_int('state', this._state);
                } else {
                    if (this._autoItem._ornament === PopupMenu.Ornament.CHECK) {
                        this._state = State.AUTO;
                        this._preparePermanentMode(false);
                        if (!PANELBOX.visible && !OVERVIEW.visible)
                            this._showFloatingMiniPanel();
                    } else {
                        this._state = State.ON;
                        this._preparePermanentMode(true);
                        this._showFloatingMiniPanel();
                    }
                    this._sets.set_int('state', this._state);
                }
                if (this.visible || PANELBOX.visible) QUICKSETTINGS.menu.open();
                return Clutter.Event_STOP;
            });

            this._fmpQuickIndicator = new QuickSettings.SystemIndicator();
            this._fmpQuickIndicator.quickSettingsItems.push(
                this._fmpQuickToggle
            );
            QUICKSETTINGS.addExternalIndicator(this._fmpQuickIndicator);

            // FloatingMiniPanel Controlling -----------------------------------

            // Auto Mode controlling
            this._pvConId = PANELBOX.connect('notify::visible', () => {
                if (this._state === State.AUTO) {
                    if (!PANELBOX.visible) {
                        if (this._correctPanelBoxVisibleState) {
                            this._correctPanelBoxVisibleState = false;
                        } else {
                            if (!this.visible) {
                                this._showFloatingMiniPanel();
                            }
                        }
                    } else {
                        // Timeout and testing needed because transitions are
                        // used by 'HideTopPanel' and 'DashToPanel' and
                        // PanelBox.visible signal by itself is not sufficiant
                        // to decide if the PanelBox is really shown or not!
                        if (this._timeoutId1) {
                            GLib.Source.remove(this._timeoutId1);
                            this._timeoutId1 = null;
                        }
                        // A timeout of 50ms seams ok, but has to be verified.
                        this._timeoutId1 = GLib.timeout_add(
                            GLib.PRIORITY_DEFAULT,
                            50,
                            () => {
                                // Test 'HideTopPanel' / 'DashToPanel' show PanelBox
                                let priMonGeo = Utils.priMonitorGeometry();
                                if (
                                    (PANELBOX.y >
                                        priMonGeo.y - PANELBOX.height &&
                                        Math.abs(PANELBOX.translation_y) <
                                            PANELBOX.height &&
                                        Math.abs(PANELBOX.translation_x) <
                                            PANELBOX.width) ||
                                    OVERVIEW.visible
                                ) {
                                    if (this._correctPanelBoxVisibleState) {
                                        this._correctPanelBoxVisibleState = false;
                                    }
                                    this._hideFloatingMiniPanel();
                                } else {
                                    // Correct unwanted PanelBox visible signal!
                                    PANELBOX.visible = false;
                                    this._correctPanelBoxVisibleState = true;
                                }
                                this._timeoutId1 = null;
                                return GLib.SOURCE_REMOVE;
                            }
                        );
                    }
                }
                return Clutter.Event_PROPAGATE;
            });

            this.connect_object(
                'notify::width',
                () => {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        if (this.visible) this._relocate(false);
                        return GLib.SOURCE_REMOVE;
                    });
                    return Clutter.Event_STOP;
                },
                // START CODE VERTICAL
                'notify::height',
                () => {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        if (this.visible) this._relocate(false);
                        return GLib.SOURCE_REMOVE;
                    });
                    return Clutter.Event_STOP;
                },
                // END CODE VERTICAL
                this
            );

            this._wcConId = DISPLAY.connect('workareas-changed', () => {
                this._relocate(false);
                // Bug: Main Panel becomes visible and so we have to
                // hide it by showing this again in Permanent Mode!
                if (this._state === State.ON && !OVERVIEW.visible) {
                    this._showFloatingMiniPanel();
                }
                return Clutter.Event_PROPAGATE;
            });

            this._ovConId1 = OVERVIEW.connect('showing', () => {
                if (this._state === State.ON) {
                    this._hideFloatingMiniPanel();
                }
                return Clutter.Event_PROPAGATE;
            });

            this._ovConId2 = OVERVIEW.connect('hiding', () => {
                if (this._state === State.ON) {
                    this._showFloatingMiniPanel();
                }
                return Clutter.Event_PROPAGATE;
            });

            // Set this to Auto Mode and disable Permanent Mode if the
            // panel-hiding extension 'Dash-To-Panel' or 'Hide-Top-Bar'
            // is enabled to make sure no problems occur!
            // Check during runtime
            this._meConId = Main.extensionManager.connect(
                'extension-state-changed',
                (obj, ext) => {
                    if (
                        startupComplete &&
                        (ext.metadata.uuid === DTP_UUID ||
                            ext.metadata.uuid === HTB_UUID)
                    ) {
                        if (ext.enabled) {
                            if (
                                this._panelHidingExts.indexOf(
                                    ext.metadata.uuid
                                ) < 0
                            ) {
                                this._disablePermanentMode(ext.metadata.uuid);
                            }
                        } else {
                            if (
                                this._panelHidingExts.indexOf(
                                    ext.metadata.uuid
                                ) >= 0
                            ) {
                                this._panelHidingExts.splice(
                                    this._panelHidingExts.indexOf(
                                        ext.metadata.uuid
                                    ),
                                    1
                                );
                                if (this._panelHidingExts.length === 0) {
                                    if (this.visible)
                                        this._hideFloatingMiniPanel();
                                    this._permItem.reactive = true;
                                    Main.notify(
                                        'Floating Mini Panel allowing Permanent Mode again,',
                                        'because no panel-hiding extension is active!'
                                    );
                                }
                            }
                        }
                    }
                    return Clutter.Event_PROPAGATE;
                }
            );

            // Complete startup
            LAYOUTMANAGER.addTopChrome(this, {trackFullscreen: false});

            // Issue #10
            // Absolutely necessary code! If 'unredirect' is not disabled, this
            // will become unvisible if any app is maximized / in fullscreen.
            if (this._enaUnredirectFunc === null) {
                if (shellVersion > 47) {
                    this._enaUnredirectFunc = global.compositor.enable_unredirect;
                    global.compositor.enable_unredirect = function () {};
                    global.compositor.disable_unredirect();
                } else {
	                this._enaUnredirectFunc = Meta.enable_unredirect_for_display;
	                Meta.enable_unredirect_for_display = function(display) {};
	                Meta.disable_unredirect_for_display(global.display);
	            }
            }

            // The Shell may have finished starting up BEFORE this extension was
            // enabled: a runtime enable (installing/enabling from the Extensions
            // app) or simply losing the startup race in a fast session. Then the
            // 'startup-complete' signal has already fired and the handler below
            // would never run, leaving `startupComplete` false and the panel
            // invisible forever. Treat startup as complete in that case.
            if (!startupComplete && LAYOUTMANAGER._startingUp === false)
                startupComplete = true;

            // If this is in 'permanent mode' and disabled/enabled during
            // runtime (not accross sessions!) or screen is unlocked.
            if (startupComplete && this._state === State.ON) {
                this._checkPanelHidingExts();
                if (this._permItem.reactive) {
                    this._preparePermanentMode(true);
                    this._showFloatingMiniPanel();
                }
            }
            // If this is in 'auto mode' and disabled/enabled during runtime
            // (not accross sessions!) or screen is unlocked.
            if (startupComplete && this._state === State.AUTO) {
                this._checkPanelHidingExts();
                if (Utils.panelBoxHidden()) this._showFloatingMiniPanel();
            }

            // If this is in 'permanent mode' and already enabled,
            // wait for GNOME Shell to finish startup
            this._lsConId = LAYOUTMANAGER.connect('startup-complete', () => {
                // START CODE PANEL-HIDING EXTENSIONS
                // Set this to Auto Mode and disable Permanent Mode if the
                // panel-hiding extension 'Dash-To-Panel' or 'Hide-Top-Bar'
                // is enabled to make sure no problems occur!
                // Check at startup
                this._checkPanelHidingExts();

                if (this._state === State.ON) {
                    this._preparePermanentMode(true);
                    if (!OVERVIEW.visible) this._showFloatingMiniPanel();
                }
                startupComplete = true;

                // Remove connection, we don't need it anymore
                // in the running session.
                LAYOUTMANAGER.disconnect(this._lsConId);
                this._lsConId = null;

                return Clutter.Event_PROPAGATE;
            });

            // Recognize Suspend
            this._loginManager = LoginManager.getLoginManager();
            this._lpConId = this._loginManager.connect(
                'prepare-for-sleep',
                (obj, state) => {
                    if (this._state === State.ON && state) {
                        this._hideFloatingMiniPanel();
                    }
                    if (this._state === State.ON && !state) {
                        this._showFloatingMiniPanel();
                    }
                    return Clutter.Event_PROPAGATE;
                }
            );
        }

        // FloatingMiniPanel Procedures ----------------------------------------

        // Prepare the system for permanent mode and vice versa
        // It would work without, but then we would have a lot of
        // allocation errors!
        // It has to be done before Overview is toggled, to take effect.
        // Therefore it can't be done in the show / hide functions.
        _preparePermanentMode(on) {
            // The main-panel controller owns the top bar in autohide/hide mode;
            // do not also track/untrack its chrome or pad the overview search
            // entry here, or the two would fight over `panelBox`.
            if (this._topBarManagedExternally())
                return;
            if (on) {
                LAYOUTMANAGER.untrackChrome(PANELBOX);
                OVERVIEW._overview._controls._searchEntryBin.set_style(
                    `padding-top: ${PANELBOX.height}px;`
                );
            } else {
                if (LAYOUTMANAGER._findActor(PANELBOX) === -1) {
                    LAYOUTMANAGER.trackChrome(PANELBOX, {
                        affectsStruts: true,
                        trackFullscreen: true,
                    });
                    OVERVIEW._overview._controls._searchEntryBin.set_style(
                        null
                    );
                }
            }
        }

        // Check Panel-Hiding extensions
        _checkPanelHidingExts() {
            if (Main.extensionManager._extensionOrder.indexOf(DTP_UUID) >= 0) {
                let disabled = global.settings.get_strv('disabled-extensions');
                if (disabled.indexOf(DTP_UUID) < 0) {
                    this._disablePermanentMode(DTP_UUID);
                }
            }
            if (Main.extensionManager._extensionOrder.indexOf(HTB_UUID) >= 0) {
                let disabled = global.settings.get_strv('disabled-extensions');
                if (disabled.indexOf(HTB_UUID) < 0) {
                    this._disablePermanentMode(HTB_UUID);
                }
            }
        }

        _disablePermanentMode(phext) {
            if (this._panelHidingExts.indexOf(phext) < 0) {
                this._panelHidingExts.push(phext);
                if (this._permItem.reactive) {
                    if (this._state === State.ON) {
                        this._hideFloatingMiniPanel();
                        this._preparePermanentMode(false);
                        this._state = State.AUTO;
                        this._sets.set_int('state', this._state);
                        this._fmpQuickToggle.subtitle =
                            this._autoItem.label.text;
                        this._autoItem.setOrnament(PopupMenu.Ornament.CHECK);
                        this._permItem.setOrnament(PopupMenu.Ornament.NONE);
                        this._permItem.reactive = false;
                        Main.notify(
                            'Floating Mini Panel switched into Auto Mode,',
                            'because ' + phext + ' is active!'
                        );
                    } else {
                        this._permItem.reactive = false;
                        Main.notify(
                            'Floating Mini Panel disabed Permanent Mode,',
                            'because ' + phext + ' is active!'
                        );
                    }
                }
            }
        }

        openPreferences() {
            this._extension.openPreferences();
        }

        // (Re)arm a single ~300 ms timer so a burst of `widgets` key writes
        // triggers one reload. The pending timer is removed before re-arming
        // and in destroy().
        _scheduleReloadPlugins() {
            if (this._reloadTimeoutId) {
                GLib.Source.remove(this._reloadTimeoutId);
                this._reloadTimeoutId = null;
            }
            this._reloadTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                300,
                () => {
                    this._reloadTimeoutId = null;
                    this._reloadPlugins();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        // Rebuild the configured plugin actors from the (possibly changed)
        // `widgets` GSettings key. Destroy the OLD actors FIRST, then build the
        // new ones. Fixed-port plugins (ai-agent-usage / ai-agent-status) bind a
        // Soup.Server on construction; building the replacements before the old
        // instances released their ports made the rebind race and fail on every
        // settings change, leaving the surviving widget with a dead server. This
        // "destroy old, then build new" order is safe because the pre-validation
        // below already guarantees a broken/half-edited config bails out before
        // anything is torn down — that guarantee, not "build new before destroy
        // old", is what protects the working panel from an invalid config now.
        // The control button and every non-plugin child stay in place: they were
        // added first and are untouched here, so re-adding the new plugin actors
        // in array (config) order preserves "control button, then plugins in
        // order". Never throws out of the timeout callback.
        _reloadPlugins() {
            // A broken/half-edited `widgets` value must keep the CURRENT
            // widgets (loadWidgetConfig would gracefully fall back to the
            // default set, which is right at startup but wrong for a live
            // edit), so validate the raw key first.
            try {
                const raw = this._sets.get_string('widgets');
                if (raw)
                    parseWidgetConfig(raw);
            } catch (e) {
                logError(
                    e,
                    'widget-panel: invalid widgets config, keeping current widgets'
                );
                return;
            }

            // Validation passed: it is now safe to tear down the current plugin
            // actors — releasing any fixed ports/signals/cookies they hold —
            // before building the replacements that may need those same
            // resources (e.g. rebinding the same Soup.Server port).
            for (const {actor} of this._plugins)
                actor.destroy();
            this._plugins = [];

            try {
                this._plugins = PluginManager.createConfiguredPlugins(
                    this,
                    this._extensionPath,
                    this._sets
                );
            } catch (e) {
                logError(
                    e,
                    'widget-panel: failed to build reloaded widgets, panel continues with control button only'
                );
                this._plugins = [];
            }

            for (const {actor} of this._plugins)
                this.add_child(actor);
            this._indsDrawer =
                this._plugins.find(p => p.id === 'app-notifications')
                    ?.actor ?? null;
            this._applyPanelLayoutToPlugins();

            // Widget set changed, so the panel size likely changed; keep the
            // saved alignment applied. Guarded so it can never throw here.
            try {
                this._relocate(false);
            } catch (e) {
                logError(
                    e,
                    'widget-panel: relocate after reload failed'
                );
            }
        }

        // START CODE VERTICAL
        // Apply the panel orientation (horizontal/vertical) to the layout and
        // style pseudo-classes. Used at startup and when the `vertical` setting
        // changes live. Does not touch positioning; callers relocate as needed.
        //
        // Verified correct for Shell 50: on shell > 47 the St.BoxLayout is
        // flipped via `this.orientation = Clutter.Orientation.VERTICAL` (the
        // `vertical` boolean is the pre-48 fallback), and the `:vertical` /
        // `:horizontal` pseudo-classes it toggles are both defined in
        // stylesheet.css. It is applied on startup (constructor) and on
        // `changed::vertical`. A vertical panel only *looks* right once the
        // saved alignment is re-applied with real geometry, which the startup
        // `_relocate(false)` above now guarantees.
        _setOrientation(vertical) {
            if (vertical) {
                if (shellVersion > 47) {
                    this.orientation = Clutter.Orientation.VERTICAL;
                } else {
                    this.vertical = true;
                }
                this.remove_style_pseudo_class('horizontal');
                this.add_style_pseudo_class('vertical');
            } else {
                if (shellVersion > 47) {
                    this.orientation = Clutter.Orientation.HORIZONTAL;
                } else {
                    this.vertical = false;
                }
                this.remove_style_pseudo_class('vertical');
                this.add_style_pseudo_class('horizontal');
            }
            this.queue_relayout();
        }

        // Push the panel orientation + rotation direction to any plugin that
        // opts in via `setPanelLayout({vertical, rotation})` (the graph widgets
        // rotate when vertical). Duck-typed and guarded so a plugin without the
        // hook, or one that throws, cannot break the panel.
        // Read an int setting, tolerating a stale/mismatched schema that lacks a
        // newer key (returns the fallback instead of throwing).
        _getSettingInt(key, fallback) {
            try {
                return this._sets.get_int(key);
            } catch (e) {
                return fallback;
            }
        }

        // Read the single `orientation` enum setting and derive the {vertical,
        // rotation} the layout code uses. Tolerates a stale/mismatched schema.
        _orientationState() {
            let value = 'horizontal';
            try {
                value = this._sets.get_string('orientation');
            } catch (e) {
                value = 'horizontal';
            }
            const vertical = value === 'left' || value === 'right';
            const rotation = value === 'left' ? 'left' : 'right';
            return {orientation: value, vertical, rotation};
        }

        // Read the `main-panel` enum ('visible' | 'autohide' | 'hide'),
        // tolerating a stale/mismatched schema that lacks the key.
        _getMainPanelMode() {
            try {
                return this._sets.get_string('main-panel');
            } catch (e) {
                return 'visible';
            }
        }

        // True while the MainPanelController owns the GNOME top bar (any mode
        // other than 'visible'). The legacy Permanent-mode top-bar hiding must
        // stand down then, so the controller is the single authority.
        _topBarManagedExternally() {
            return this._mainPanel?.ownsTopBar?.() === true;
        }

        _applyPanelLayoutToPlugins() {
            if (!this._plugins)
                return;
            const {vertical, rotation} = this._orientationState();
            for (const {actor} of this._plugins) {
                if (typeof actor?.setPanelLayout !== 'function')
                    continue;
                try {
                    actor.setPanelLayout({vertical, rotation});
                } catch (e) {
                    logError(e, 'FloatingMiniPanel: setPanelLayout failed');
                }
            }
        }
        // END CODE VERTICAL

        _tmpHide() {
            // Hide this for 5 sec.
            this.hide();
            if (this._timeoutId2) {
                GLib.Source.remove(this._timeoutId2);
                this._timeoutId2 = null;
            }
            this._timeoutId2 = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                5000,
                () => {
                    if (
                        // Bug fix v5
                        Utils.panelBoxHidden() &&
                        !OVERVIEW.visible
                    )
                        this.show();
                    this._timeoutId2 = null;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        _showFloatingMiniPanel() {
            // If in Permanent Mode hide the Main Panel — unless the main-panel
            // controller already owns the top bar (autohide/hide mode).
            if (this._state !== State.AUTO && !this._topBarManagedExternally()) {
                let priMonGeo = Utils.priMonitorGeometry();
                PANELBOX.set_position(
                    priMonGeo.x,
                    Math.abs(priMonGeo.y - priMonGeo.y) - PANELBOX.height
                );
            }

            // Show this with animation
            this.remove_all_transitions();
            this.opacity = 0;
            this.visible = true;
            this.ease({
                opacity: 255,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_LINEAR,
                onComplete: () => {},
            });
        }

        _hideFloatingMiniPanel() {
            // Hide this w/o animation
            this.visible = false;

            // If in Permanent Mode show the Main Panel — unless the main-panel
            // controller owns the top bar (autohide/hide mode).
            if (this._state !== State.AUTO && !this._topBarManagedExternally()) {
                let priMonGeo = Utils.priMonitorGeometry();
                PANELBOX.set_position(priMonGeo.x, priMonGeo.y);
            }
        }

        // If this was moved, its width changed or the workarea has changed-----
        // Refactored and support for AUTO POSITION (Issue #5)
        _relocate(setAlign) {
            // Get monitor geometry where this is on
            let rect = new Mtk.Rectangle({
                x: this.x,
                y: this.y,
                width: this.width,
                height: this.height,
            });
            let monitor = DISPLAY.get_monitor_index_for_rect(rect);
            if (monitor < 0) monitor = DISPLAY.get_primary_monitor();
            let geom = DISPLAY.get_monitor_geometry(monitor);

            let align = Alignment.NONE;

            if (rect.y < geom.y) {
                rect.y = geom.y;
                align |= Alignment.TOP;
            }

            let max_y = geom.y + geom.height - rect.height;
            if (rect.y > max_y) {
                rect.y = max_y;
                align |= Alignment.BOTTOM;
            }

            if (rect.x < geom.x) {
                rect.x = geom.x;
                align |= Alignment.LEFT;
            }

            let max_x = geom.x + geom.width - rect.width;
            if (rect.x > max_x) {
                rect.x = max_x;
                align |= Alignment.RIGHT;
            }

            if (setAlign) {
                this._sets.set_int('aligned', align);
            } else {
                align = this._sets.get_int('aligned');
                if (align & Alignment.TOP) rect.y = geom.y;
                if (align & Alignment.BOTTOM) rect.y = max_y;
                if (align & Alignment.LEFT) rect.x = geom.x;
                if (align & Alignment.RIGHT) rect.x = max_x;
                if (this[this.orientStr]) {
                    if (align & Alignment.CENTER) rect.y = geom.y + (geom.height - rect.height) / 2;
                } else {
                    // BUG: 'max_x / 2' which is '(geom.x + geom.width - rect.width) / 2' was used !!!
                    if (align & Alignment.CENTER) rect.x = geom.x + (geom.width - rect.width) / 2;
                }
            }

            this._adjustBorder(align);

            this.set_position(rect.x, rect.y);
            this._sets.set_int('pos-x', rect.x);
            this._sets.set_int('pos-y', rect.y);
        }

        _adjustBorder(align) {
            let radius = null;
            switch (align) {
                case Alignment.LEFT | Alignment.TOP:
                    radius = '0px 0px 15px 0px';
                    break;
                case Alignment.LEFT | Alignment.BOTTOM:
                    radius = '0px 15px 0px 0px';
                    break;
               case Alignment.RIGHT | Alignment.TOP:
                    radius = '0px 0px 0px 15px';
                    break;
                case Alignment.RIGHT | Alignment.BOTTOM:
                    radius = '15px 0px 0px 0px';
                    break;
                case Alignment.TOP:
                case Alignment.TOP | Alignment.CENTER:
                    radius = '0px 0px 15px 15px';
                    break;
                case Alignment.BOTTOM:
                case Alignment.BOTTOM | Alignment.CENTER:
                    radius = '15px 15px 0px 0px';
                    break;
                case Alignment.LEFT:
                case Alignment.LEFT | Alignment.CENTER:
                    radius = '0px 15px 15px 0px';
                    break;
                case Alignment.RIGHT:
                case Alignment.RIGHT | Alignment.CENTER:
                    radius = '15px 0px 0px 15px';
                    break;
                default:
                    radius = null;
                    break;
            }

            // Combine the alignment border-radius with the configurable frame
            // size (padding = the frame around the widgets' working body).
            const parts = [];
            if (radius)
                parts.push(`border-radius: ${radius};`);
            const frame = Number.isFinite(this._contentPadding) ? this._contentPadding : 0;
            if (frame > 0)
                parts.push(`padding: ${frame}px;`);
            this.style = parts.length ? parts.join(' ') : null;
        }

        destroy() {
            this._hideFloatingMiniPanel();

            this._ctlBtn.destroy();
            for (const {actor} of [...this._plugins].reverse())
                actor.destroy();
            this._plugins = [];

            // Release the config-change listener and any pending debounced reload.
            if (this._reloadTimeoutId) {
                GLib.Source.remove(this._reloadTimeoutId);
                this._reloadTimeoutId = null;
            }
            if (this._widgetsChangedId) {
                this._sets.disconnect(this._widgetsChangedId);
                this._widgetsChangedId = null;
            }

            if (this._timeoutId1) {
                GLib.Source.remove(this._timeoutId1);
                this._timeoutId1 = null;
            }

            if (this._timeoutId2) {
                GLib.Source.remove(this._timeoutId2);
                this._timeoutId2 = null;
            }

            if (this._initRelocateId) {
                this.disconnect(this._initRelocateId);
                this._initRelocateId = 0;
            }
            if (this._alignedChangedId) {
                this._sets.disconnect(this._alignedChangedId);
                this._alignedChangedId = null;
            }
            if (this._orientationChangedId) {
                this._sets.disconnect(this._orientationChangedId);
                this._orientationChangedId = null;
            }
            if (this._contentPaddingChangedId) {
                this._sets.disconnect(this._contentPaddingChangedId);
                this._contentPaddingChangedId = null;
            }

            PANELBOX.disconnect(this._pvConId);
            this._pvConId = null;

            if (this._lsConId) {
                LAYOUTMANAGER.disconnect(this._lsConId);
                this._lsConId = null;
            }

            this._loginManager.disconnect(this._lpConId);
            this._lpConId = null;

            Main.extensionManager.disconnect(this._meConId);
            this._meConId = null;

            DISPLAY.disconnect(this._wcConId);
            this._wcConId = null;

            OVERVIEW.disconnect(this._ovConId1);
            this._ovConId1 = null;

            OVERVIEW.disconnect(this._ovConId2);
            this._ovConId2 = null;

            this._fmpQuickIndicator.quickSettingsItems.forEach(item =>
                item.destroy()
            );
            this._fmpQuickIndicator.destroy();
            this._fmpQuickIndicator = null;

            LAYOUTMANAGER.removeChrome(this);

            // Issue #10
            if (this._enaUnredirectFunc !== null) {
                if (shellVersion > 47) {
                    global.compositor.enable_unredirect = this._enaUnredirectFunc;
                    global.compositor.enable_unredirect();
                } else {
                    Meta.enable_unredirect_for_display = this._enaUnredirectFunc;
                    Meta.enable_unredirect_for_display(global.display);
                }
                this._enaUnredirectFunc = null;
            }

            // Release the main-panel controller (restores the top bar and its
            // strut reservation) BEFORE the legacy restore below, which is a
            // no-op while the controller still owns the bar.
            if (this._mainPanelChangedId) {
                this._sets.disconnect(this._mainPanelChangedId);
                this._mainPanelChangedId = null;
            }
            if (this._mainPanel) {
                this._mainPanel.destroy();
                this._mainPanel = null;
            }

            this._preparePermanentMode(false);

            super.destroy();
        }
    }
);

export default class FloatingMiniPanelExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        startupComplete = false;
    }

    enable() {
        const settings = this.getSettings();
        this._floatingMiniPanel = new FloatingMiniPanel(
            settings,
            this.path,
            this
        );

        // One-time async migration of a legacy widgets.json into the `widgets`
        // GSettings key. Best-effort and NOT awaited: when it writes the key the
        // panel's `changed::widgets` handler reloads the widgets. The panel above
        // built from defaults (empty key) meanwhile, which is correct.
        migrateLegacyConfigIfNeeded(settings).catch(e =>
            logError(e, 'widget-panel: legacy config migration failed')
        );
    }

    disable() {
        this._floatingMiniPanel.destroy();
        this._floatingMiniPanel = null;
    }
}
