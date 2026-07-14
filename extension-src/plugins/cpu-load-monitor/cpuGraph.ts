// @ts-nocheck
// @tag:widget-cpu-load-monitor
'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {hexToRgb, toNumber} from '../../colorUtils.js';
import {animateTooltipVisibility, positionTooltip} from '../../tooltip.js';
import {renderTemplate} from '../../tooltipTemplate.js';

// Async file reads keep the periodic /proc/stat and thermal-zone sampling off
// the Shell main loop (EGO forbids synchronous file I/O there).
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

const WIDTH = 32;
const HEIGHT = 16;
const UPDATE_INTERVAL_SECONDS = 2;
// Default hover-tooltip template. Tokens: {load} (e.g. `37%`), {temp} (the
// coloured `NN°C` or `?`) and {legend} (the coloured band-range legend). Literal
// text is Pango-escaped; `\n` is a line break. See ../../tooltipTemplate.ts.
const DEFAULT_TOOLTIP_TEMPLATE = 'cpu: {load}, {temp}\n°C: {legend}';
const DEFAULT_BANDS = [
    {name: 'green', temp: 50, color: '#3dc752'},
    {name: 'yellow', temp: 65, color: '#ffc729'},
    {name: 'red', temp: 80, color: '#f03333'},
];

// Normalize the configured temperature bands: keep only valid entries, sort
// ascending by temperature, fall back to defaults when missing or invalid.
function normalizeBands(bands) {
    const defaults = () => DEFAULT_BANDS.map(band => ({...band}));
    if (!Array.isArray(bands))
        return defaults();
    const cleaned = bands
        .filter(band =>
            band
            && Number.isFinite(Number(band.temp))
            && typeof band.color === 'string'
            && band.color.length > 0)
        .map(band => ({
            name: String(band.name ?? ''),
            temp: Number(band.temp),
            color: band.color,
        }));
    if (cleaned.length === 0)
        return defaults();
    cleaned.sort((a, b) => a.temp - b.temp);
    return cleaned;
}

export const CpuGraph = GObject.registerClass(
    class CpuGraph extends St.DrawingArea {
        constructor(options = {}) {
            const width = Math.max(1, Math.round(toNumber(options.width, WIDTH)));
            super({
                style_class: 'cpu-graph',
                width,
                height: HEIGHT,
                reactive: true,
                track_hover: true,
            });

            // Configurable geometry, temperature bands and tooltip.
            this._width = width;
            // Base (unrotated) size; the actor size is swapped when the panel is
            // vertical (see setPanelLayout / the rotated branch in _draw).
            this._baseWidth = width;
            this._baseHeight = HEIGHT;
            this._rotated = false;
            this._rotateDir = 'right';
            this._bands = normalizeBands(options.bands);
            this._updateInterval = Math.max(
                1,
                Math.round(toNumber(options.updateInterval, UPDATE_INTERVAL_SECONDS))
            );
            this._showTooltip = options.showTooltip !== false;
            this._template = typeof options.template === 'string'
                ? options.template
                : DEFAULT_TOOLTIP_TEMPLATE;

            // Each sample keeps its own load and temperature so the graph can be
            // coloured per column by the band the temperature was in at the time,
            // rather than recolouring the whole graph by the current temperature.
            this._samples = Array.from({length: width}, () => ({load: 0, temp: null}));
            this._previous = null;
            // Guards for async continuations that may resolve after destroy().
            this._destroyed = false;
            // Re-entrancy guard so a slow sample cannot overlap the next tick.
            this._sampling = false;
            // Temperature discovery reads sysfs; it runs async and stores the
            // resolved path when ready. First ticks with a null path are fine.
            this._temperaturePath = null;
            this._findCpuTemperaturePath()
                .then(path => {
                    if (!this._destroyed)
                        this._temperaturePath = path;
                })
                .catch(error =>
                    logError(
                        error,
                        'Floating Mini Panel CPU temperature discovery'
                    )
                );
            this._temperature = null;
            this._lastLoad = 0;
            this._tooltip = new St.Label({
                style_class: 'dash-label',
                visible: false,
            });
            Main.uiGroup.add_child(this._tooltip);
            this._repaintId = this.connect('repaint', () => this._draw());
            this._hoverId = this.connect('notify::hover', () => this._onHoverChanged());
            this._sample();
            this._timeoutId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                this._updateInterval,
                () => {
                    this._sample();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        async _readCpuCounters() {
            try {
                const file = Gio.File.new_for_path('/proc/stat');
                // load_contents_async resolves to [contents, etag] (Uint8Array,
                // no leading boolean); throws on failure, caught below.
                const [contents] = await file.load_contents_async(null);

                const line = new TextDecoder().decode(contents).split('\n')[0];
                const fields = line.trim().split(/\s+/).slice(1).map(Number);
                if (fields.length < 4 || fields.some(Number.isNaN))
                    return null;

                const idle = fields[3] + (fields[4] ?? 0);
                const total = fields.reduce((sum, value) => sum + value, 0);
                return {idle, total};
            } catch (error) {
                logError(error, 'Floating Mini Panel CPU graph');
                return null;
            }
        }

        async _readText(path) {
            const file = Gio.File.new_for_path(path);
            const [contents] = await file.load_contents_async(null);
            return new TextDecoder().decode(contents).trim();
        }

        async _findCpuTemperaturePath() {
            try {
                let fallback = null;
                for (let index = 0; index < 32; index++) {
                    const base = `/sys/class/thermal/thermal_zone${index}`;
                    const type = await this._readText(`${base}/type`);
                    if (type === 'x86_pkg_temp')
                        return `${base}/temp`;
                    if (type === 'TCPU')
                        fallback = `${base}/temp`;
                }
                return fallback;
            } catch (error) {
                logError(error, 'Floating Mini Panel CPU temperature discovery');
                return null;
            }
        }

        async _readCpuTemperature() {
            if (!this._temperaturePath)
                return null;
            try {
                const value = Number(await this._readText(this._temperaturePath));
                return Number.isFinite(value) ? value / 1000 : null;
            } catch (error) {
                logError(error, 'Floating Mini Panel CPU temperature');
                return null;
            }
        }

        // Fire-and-forget sample entry point for the timeout/constructor. It
        // never awaits (the Shell timeout callback must return immediately) and
        // skips if a prior sample is still in flight (re-entrancy guard).
        _sample() {
            if (this._sampling || this._destroyed)
                return;
            this._sampling = true;
            this._doSample()
                .catch(error =>
                    logError(error, 'Floating Mini Panel CPU sample')
                )
                .finally(() => {
                    this._sampling = false;
                });
        }

        async _doSample() {
            const current = await this._readCpuCounters();
            if (this._destroyed)
                return;
            this._temperature = await this._readCpuTemperature();
            if (this._destroyed)
                return;
            if (current && this._previous) {
                const totalDelta = current.total - this._previous.total;
                const idleDelta = current.idle - this._previous.idle;
                const load = totalDelta > 0
                    ? Math.clamp(1 - idleDelta / totalDelta, 0, 1)
                    : 0;
                this._lastLoad = load;
                this._samples.push({load, temp: this._temperature});
                this._samples.shift();
                if (this.hover)
                    this._updateTooltip();
                this.queue_repaint();
            }
            this._previous = current;
        }

        // The band for a given temperature: the highest band whose temp <= t.
        // Below the lowest band's temp (or unknown temperature) → null (normal:
        // use the theme foreground colour).
        _bandForTemp(t) {
            if (t === null || t === undefined)
                return null;
            let active = null;
            for (const band of this._bands) {
                if (t >= band.temp)
                    active = band;
                else
                    break;
            }
            return active;
        }

        // The band for the current temperature (drives the tooltip).
        _activeBand() {
            return this._bandForTemp(this._temperature);
        }

        // Build the coloured Pango-markup fragments for the tooltip tokens from
        // live data. These are the same pieces the old fixed tooltip produced;
        // `renderTemplate` splices them into the (configurable) template.
        _tooltipFragments() {
            const active = this._activeBand();
            const load = Math.round(this._lastLoad * 100);
            const tempStr = this._temperature === null
                ? '?'
                : `${Math.round(this._temperature)}°C`;
            const temp = active === null
                ? tempStr
                : `<span foreground="${active.color}">${tempStr}</span>`;

            // Legend: temperature ranges built from consecutive band temps
            // (t0..t1, t1..t2, >tlast), each range in its band colour; the active
            // band is bold. The below-lowest (normal) range is intentionally not
            // drawn.
            const legend = this._bands
                .map((band, index) => {
                    const next = this._bands[index + 1];
                    const label = next
                        ? `${band.temp}..${next.temp}`
                        : `&gt;${band.temp}`;
                    const inner = band === active ? `<b>${label}</b>` : label;
                    return `<span foreground="${band.color}">${inner}</span>`;
                })
                .join(', ');

            return {load: `${load}%`, temp, legend};
        }

        _tooltipMarkup() {
            return renderTemplate(this._template, this._tooltipFragments());
        }

        _onHoverChanged() {
            if (this._showTooltip && this.hover) {
                this._updateTooltip();
                animateTooltipVisibility(this, true);
            } else {
                animateTooltipVisibility(this, false);
            }
        }

        // Refresh text/position in place without touching opacity, so periodic
        // updates while hovering do not make the tooltip blink.
        _updateTooltip() {
            this._tooltip.clutter_text.set_markup(this._tooltipMarkup());
            positionTooltip(this);
        }

        // Rotate the vertical panel: when rotated the actor/surface is swapped
        // (see setPanelLayout); draw in the base (unrotated) coordinate space and
        // let the transform map it into the tall/narrow surface. Verified so the
        // time axis runs top->bottom (right) or bottom->top (left).
        _applyRotation(context, sw, sh) {
            if (!this._rotated)
                return;
            if (this._rotateDir === 'left') {
                context.translate(0, sh);
                context.rotate(-Math.PI / 2);
            } else {
                context.translate(sw, 0);
                context.rotate(Math.PI / 2);
            }
        }

        _draw() {
            const context = this.get_context();
            const [sw, sh] = this.get_surface_size();
            const width = this._rotated ? this._baseWidth : sw;
            const height = this._rotated ? this._baseHeight : sh;
            const themeNode = this.get_theme_node();
            const color = themeNode.get_foreground_color();
            const fg = [color.red / 255, color.green / 255, color.blue / 255];

            context.save();
            this._applyRotation(context, sw, sh);

            // One column per sample, coloured by the temperature band that
            // sample was recorded in (not the current temperature).
            context.setLineWidth(1);
            for (let x = 0; x < this._samples.length; x++) {
                const sample = this._samples[x];
                const load = sample.load;
                if (load <= 0)
                    continue;
                const band = this._bandForTemp(sample.temp);
                if (band !== null)
                    context.setSourceRGBA(...hexToRgb(band.color), 0.95);
                else
                    context.setSourceRGBA(fg[0], fg[1], fg[2], 0.9);
                const barHeight = load * (height - 1);
                context.rectangle(x, height - barHeight, 1, barHeight);
                context.fill();
            }
            context.restore();
            context.$dispose();
        }

        // Called by the panel host when its orientation/rotation changes. When
        // vertical the graph rotates 90° and swaps its actor size so the layout
        // reserves a tall/narrow slot.
        setPanelLayout(info) {
            const vertical = !!(info && info.vertical);
            this._rotated = vertical;
            this._rotateDir =
                info && info.rotation === 'left' ? 'left' : 'right';
            if (vertical) {
                this.width = this._baseHeight;
                this.height = this._baseWidth;
                // Centre the narrow graph in the vertical strip.
                this.x_align = Clutter.ActorAlign.CENTER;
                this.x_expand = true;
            } else {
                this.width = this._baseWidth;
                this.height = this._baseHeight;
                this.x_align = Clutter.ActorAlign.FILL;
            }
            this.queue_repaint();
        }

        destroy() {
            // Bail out of any async sample continuation still in flight.
            this._destroyed = true;
            if (this._timeoutId) {
                GLib.Source.remove(this._timeoutId);
                this._timeoutId = null;
            }
            if (this._repaintId) {
                this.disconnect(this._repaintId);
                this._repaintId = null;
            }
            if (this._hoverId) {
                this.disconnect(this._hoverId);
                this._hoverId = null;
            }
            if (this._tooltip) {
                this._tooltip.destroy();
                this._tooltip = null;
            }
            super.destroy();
        }
    }
);
