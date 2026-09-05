// @ts-nocheck
// @tag:widget-version-status @tag:build-stamp
//
// Developer widget: does this GNOME Shell run the build that is installed, or is
// a logout/login still pending? Installing writes new files, but the Shell keeps
// the ES modules it loaded at login for the life of the gnome-shell process, so
// after `./gwp install` the panel on screen is still the previous build — with
// nothing on screen saying so. This widget says so.
//
// It is a warning and the action that clears it, nothing else, so it is on
// screen only while the warning stands: once the running build is the installed
// one it hides itself and gives the slot back (UX: a warning is shown only while
// it stands). Between installs the panel looks as though the widget were not
// configured at all — that is the
// intended state, and the reason the poll below keeps running while hidden.
//
// The comparison is between two instants: LOADED_AT below, captured when this
// module entered the process (module loading is what a relogin redoes), and the
// `builtAtMs` of `build-stamp.json`, written into the tree by `./gwp build` and
// carried into the install. A stamp newer than LOADED_AT can only have arrived
// after this shell started. The verdict itself is gi-free logic in
// `versionState.ts`; see index.md.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {readBuildStamp} from '../../systemInfo.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {buildButtonContent} from '../panelButtonContent.js';
import {evaluateVersionState} from './versionState.js';

// When the running code became the running code. ES modules are cached for the
// life of the gnome-shell process, so this survives disable/enable cycles and
// the lock screen, and only a new shell process moves it — which is exactly the
// event the widget reports on.
const LOADED_AT = Date.now();

const CHECK_INTERVAL_SECONDS = 30;

const DEFAULTS = {
    icon: 'dialog-question-symbolic',
    text: '',
};

// Label of the build in memory, learned from the first stamp read that is not
// newer than LOADED_AT. Module-level on purpose: a settings change rebuilds the
// panel actors, and what was learned before that is still true afterwards.
let runningLabel = null;


const VersionStatusButton = GObject.registerClass(
    class VersionStatusButton extends St.Button {
        _init(parent) {
            this._parent = parent;
            this._destroyed = false;
            this._stateClass = null;
            // Hidden until the first stamp read says otherwise: the read is a
            // few milliseconds away and the common answer is "nothing to
            // report", so starting visible would flash a button on every login
            // that then vanishes.
            this.selfHidden = true;

            super._init({
                style_class: 'button ctlBtn',
                reactive: true,
                track_hover: true,
                can_focus: true,
                child: buildButtonContent({}, DEFAULTS),
            });

            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            Main.uiGroup.add_child(this._tooltip);

            this.connect('clicked', () => this._refresh());
            this.connect('notify::hover', () => this._onHoverChanged());

            // A build lands while the panel is on screen, so the state has to
            // find its own way to the icon rather than wait for a hover.
            this._checkId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                CHECK_INTERVAL_SECONDS,
                () => {
                    this._refresh();
                    return GLib.SOURCE_CONTINUE;
                }
            );
            this._refresh();
        }

        _refresh() {
            readBuildStamp()
                .then((stamp) => {
                    if (this._destroyed)
                        return;
                    // A stamp no newer than the running modules is the stamp OF
                    // the running modules: remember what this shell is running
                    // before an install replaces the file.
                    if (stamp && stamp.builtAtMs <= LOADED_AT)
                        runningLabel = stamp.label;
                    this._applyState(
                        evaluateVersionState({
                            loadedAt: LOADED_AT,
                            stamp,
                            runningLabel,
                        })
                    );
                })
                .catch((error) =>
                    logError(error, 'version-status: build stamp check failed')
                );
        }

        _applyState(state) {
            try {
                this.set_child(
                    buildButtonContent({icon: state.icon, text: state.text}, DEFAULTS)
                );
                if (this._stateClass)
                    this.remove_style_class_name(this._stateClass);
                this._stateClass = `version-status-${state.kind}`;
                this.add_style_class_name(this._stateClass);
                this._tooltip.text = state.tooltip;
                if (this._tooltip.visible)
                    positionTooltip(this);
                this._applyVisibility(state.visible);
            } catch (error) {
                logError(error, 'version-status: failed to update the button');
            }
        }

        // Nothing to warn about means nothing on screen. The panel owns
        // `visible` (collapsing hides every widget regardless), so the choice is
        // recorded on the actor and the panel is asked to re-resolve it and take
        // up the new size — see contracts.ts, `PluginActor.selfHidden`.
        _applyVisibility(visible) {
            const selfHidden = !visible;
            if (this.selfHidden === selfHidden)
                return;
            this.selfHidden = selfHidden;
            // Before the panel has adopted this actor there is nothing to
            // re-resolve: the host applies visibility itself once the widgets
            // are built.
            if (this.get_parent())
                this._parent?.updateWidgetVisibility?.();
        }

        _onHoverChanged() {
            if (this.hover) {
                // Reading it costs one small async file read, and a reader who
                // just installed wants the answer of this second.
                this._refresh();
                positionTooltip(this);
                animateTooltipVisibility(this, true);
                return;
            }
            animateTooltipVisibility(this, false);
        }

        destroy() {
            this._destroyed = true;
            if (this._checkId) {
                GLib.Source.remove(this._checkId);
                this._checkId = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            super.destroy();
        }
    }
);


export function create(parent, _options) {
    return new VersionStatusButton(parent);
}
