// @ts-nocheck
'use strict';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
const WIDTH = 32;
const HEIGHT = 16;
const UPDATE_INTERVAL_SECONDS = 2;
const WARM_TEMPERATURE_C = 80;
const HOT_TEMPERATURE_C = 90;
export const CpuGraph = GObject.registerClass(class CpuGraph extends St.DrawingArea {
    constructor() {
        super({
            style_class: 'cpu-graph',
            width: WIDTH,
            height: HEIGHT,
            reactive: false,
        });
        this._samples = Array(WIDTH).fill(0);
        this._previous = null;
        this._temperaturePath = this._findCpuTemperaturePath();
        this._temperature = null;
        this._repaintId = this.connect('repaint', () => this._draw());
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
            this._samples.push(load);
            this._samples.shift();
            this.queue_repaint();
        }
        this._previous = current;
    }
    _draw() {
        const context = this.get_context();
        const [width, height] = this.get_surface_size();
        const themeNode = this.get_theme_node();
        const color = themeNode.get_foreground_color();
        if (this._temperature !== null &&
            this._temperature >= HOT_TEMPERATURE_C) {
            context.setSourceRGBA(0.94, 0.20, 0.20, 0.95);
        }
        else if (this._temperature !== null &&
            this._temperature >= WARM_TEMPERATURE_C) {
            context.setSourceRGBA(1.0, 0.78, 0.16, 0.95);
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
        super.destroy();
    }
});
