// @ts-nocheck
'use strict';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const WIDTH = 32;
const HEIGHT = 16;
const UPDATE_INTERVAL_SECONDS = 2;
const GREEN_TEMPERATURE_C = 50;
const WARM_TEMPERATURE_C = 65;
const HOT_TEMPERATURE_C = 80;
const TOOLTIP_OFFSET = 6;
const TOOLTIP_ANIMATION_TIME = 150;
const BAND_COLORS = {
    green: '#3dc752',
    yellow: '#ffc729',
    red: '#f03333',
};
function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
function hexToRgb(hex) {
    const raw = String(hex).replace('#', '');
    const full = raw.length === 3
        ? raw.split('').map(c => c + c).join('')
        : raw;
    const channel = start => {
        const value = parseInt(full.slice(start, start + 2), 16) / 255;
        return Number.isFinite(value) ? value : 0;
    };
    return [channel(0), channel(2), channel(4)];
}
export const CpuGraph = GObject.registerClass(class CpuGraph extends St.DrawingArea {
    constructor(options = {}) {
        super({
            style_class: 'cpu-graph',
            width: WIDTH,
            height: HEIGHT,
            reactive: true,
            track_hover: true,
        });
        // Configurable thresholds, colours and tooltip.
        this._greenC = toNumber(options.greenTemp, GREEN_TEMPERATURE_C);
        this._warmC = toNumber(options.warmTemp, WARM_TEMPERATURE_C);
        this._hotC = toNumber(options.hotTemp, HOT_TEMPERATURE_C);
        this._colors = {
            green: options.colorGreen || BAND_COLORS.green,
            yellow: options.colorYellow || BAND_COLORS.yellow,
            red: options.colorRed || BAND_COLORS.red,
        };
        this._showTooltip = options.showTooltip !== false;
        this._samples = Array(WIDTH).fill(0);
        this._previous = null;
        this._temperaturePath = this._findCpuTemperaturePath();
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
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, UPDATE_INTERVAL_SECONDS, () => {
            this._sample();
            return GLib.SOURCE_CONTINUE;
        });
    }
    _readCpuCounters() {
        try {
            const [ok, contents] = GLib.file_get_contents('/proc/stat');
            if (!ok)
                return null;
            const line = new TextDecoder().decode(contents).split('\n')[0];
            const fields = line.trim().split(/\s+/).slice(1).map(Number);
            if (fields.length < 4 || fields.some(Number.isNaN))
                return null;
            const idle = fields[3] + (fields[4] ?? 0);
            const total = fields.reduce((sum, value) => sum + value, 0);
            return { idle, total };
        }
        catch (error) {
            console.error(`Floating Mini Panel CPU graph: ${error}`);
            return null;
        }
    }
    _readText(path) {
        const [ok, contents] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(contents).trim() : null;
    }
    _findCpuTemperaturePath() {
        try {
            let fallback = null;
            for (let index = 0; index < 32; index++) {
                const base = `/sys/class/thermal/thermal_zone${index}`;
                const type = this._readText(`${base}/type`);
                if (type === 'x86_pkg_temp')
                    return `${base}/temp`;
                if (type === 'TCPU')
                    fallback = `${base}/temp`;
            }
            return fallback;
        }
        catch (error) {
            console.error(`Floating Mini Panel CPU temperature discovery: ${error}`);
            return null;
        }
    }
    _readCpuTemperature() {
        if (!this._temperaturePath)
            return null;
        try {
            const value = Number(this._readText(this._temperaturePath));
            return Number.isFinite(value) ? value / 1000 : null;
        }
        catch (error) {
            console.error(`Floating Mini Panel CPU temperature: ${error}`);
            return null;
        }
    }
    _sample() {
        const current = this._readCpuCounters();
        this._temperature = this._readCpuTemperature();
        if (current && this._previous) {
            const totalDelta = current.total - this._previous.total;
            const idleDelta = current.idle - this._previous.idle;
            const load = totalDelta > 0
                ? Math.clamp(1 - idleDelta / totalDelta, 0, 1)
                : 0;
            this._lastLoad = load;
            this._samples.push(load);
            this._samples.shift();
            if (this.hover)
                this._updateTooltip();
            this.queue_repaint();
        }
        this._previous = current;
    }
    _temperatureBand() {
        const t = this._temperature;
        if (t === null)
            return 'normal';
        if (t >= this._hotC)
            return 'red';
        if (t >= this._warmC)
            return 'yellow';
        if (t >= this._greenC)
            return 'green';
        return 'normal';
    }
    _tooltipMarkup() {
        const band = this._temperatureBand();
        const load = Math.round(this._lastLoad * 100);
        const tempStr = this._temperature === null
            ? '?'
            : `${Math.round(this._temperature)}°C`;
        const temp = band === 'normal'
            ? tempStr
            : `<span foreground="${this._colors[band]}">${tempStr}</span>`;
        // Legend: colored temperature bands; current band bold; the "normal"
        // (grey, < green threshold) band is intentionally not drawn.
        const ranges = [
            ['green', `${this._greenC}..${this._warmC}`],
            ['yellow', `${this._warmC}..${this._hotC}`],
            ['red', `&gt;${this._hotC}`],
        ];
        const legend = ranges
            .map(([b, label]) => {
            const inner = b === band ? `<b>${label}</b>` : label;
            return `<span foreground="${this._colors[b]}">${inner}</span>`;
        })
            .join(', ');
        return `cpu: ${load}%, ${temp}\n°C: ${legend}`;
    }
    _onHoverChanged() {
        if (this._showTooltip && this.hover) {
            this._updateTooltip();
            this._tooltip.opacity = 0;
            this._tooltip.visible = true;
            this._tooltip.ease({
                opacity: 255,
                duration: TOOLTIP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        else {
            this._tooltip.ease({
                opacity: 0,
                duration: TOOLTIP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this._tooltip)
                        this._tooltip.visible = false;
                },
            });
        }
    }
    // Refresh text/position in place without touching opacity, so periodic
    // updates while hovering do not make the tooltip blink.
    _updateTooltip() {
        this._tooltip.clutter_text.set_markup(this._tooltipMarkup());
        this._positionTooltip();
    }
    _positionTooltip() {
        const [stageX, stageY] = this.get_transformed_position();
        const [actorWidth, actorHeight] = this.allocation.get_size();
        const [tipWidth, tipHeight] = this._tooltip.get_size();
        const monitor = Main.layoutManager.findMonitorForActor(this);
        const x = Math.clamp(stageX + Math.floor((actorWidth - tipWidth) / 2), monitor.x, monitor.x + monitor.width - tipWidth);
        const y = stageY - monitor.y > actorHeight + TOOLTIP_OFFSET
            ? stageY - tipHeight - TOOLTIP_OFFSET
            : stageY + actorHeight + TOOLTIP_OFFSET;
        this._tooltip.set_position(x, y);
    }
    _draw() {
        const context = this.get_context();
        const [width, height] = this.get_surface_size();
        const themeNode = this.get_theme_node();
        const color = themeNode.get_foreground_color();
        const band = this._temperatureBand();
        if (band !== 'normal') {
            context.setSourceRGBA(...hexToRgb(this._colors[band]), 0.95);
        }
        else {
            context.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, 0.9);
        }
        context.setLineWidth(1);
        context.moveTo(0, height);
        for (let x = 0; x < this._samples.length; x++)
            context.lineTo(x, height - this._samples[x] * (height - 1));
        context.lineTo(width, height);
        context.closePath();
        context.fill();
        context.$dispose();
    }
    destroy() {
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
});
