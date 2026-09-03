// @ts-nocheck
// @tag:ui
//
// Text in the panel, drawn rather than laid out: a PangoCairo drawing area that
// requests the size its text really needs and rotates 90° in a vertical strip.
//
// An St.Label cannot do this. Rotating one keeps its original wide allocation,
// which makes the strip as wide as the text is long; leaving it upright instead
// means Pango ellipsizes it to a bare "…" — a battery "100%" in a 20px strip
// showed as three dots and nothing else. Drawing the text lets the actor ask
// for the swapped (tall, narrow) size, so the text reads down the strip at full
// length and costs the strip only its height.
//
// Used by the clock (which passes a markup-aware `layoutText`) and by the
// Ubuntu system-status button for the labels it clones from the shell's quick
// settings.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import PangoCairo from 'gi://PangoCairo';
import St from 'gi://St';

import {applyRotation} from './panelRotation.js';

/** Put plain text into the layout; the default `layoutText`. */
function setPlainText(layout, text) {
    layout.set_text(text, -1);
}

export const PanelText = GObject.registerClass(
    class PanelText extends St.DrawingArea {
        // `options.styleClass` styles the text (font, colour) through the theme
        // node; `options.layoutText(layout, text)` fills the Pango layout, so a
        // caller with markup (the clock) can parse it without this module
        // knowing anything about markup.
        _init(options = {}) {
            super._init({
                style_class: options.styleClass ?? '',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._layoutText = options.layoutText ?? setPlainText;
            this._text = '';
            this._rotated = false;
            this._rotateDir = 'right';
            this.connect('repaint', () => this._draw());
            this.connect('notify::mapped', () => {
                if (this.mapped)
                    this._updateSize();
            });
        }

        setText(text) {
            const value = text || '';
            if (value === this._text)
                return;
            this._text = value;
            this._updateSize();
            this.queue_repaint();
        }

        setPanelLayout(vertical, rotation) {
            this._rotated = !!vertical;
            this._rotateDir = rotation === 'left' ? 'left' : 'right';
            this._updateSize();
            this.queue_repaint();
        }

        _applyText(layout) {
            this._layoutText(layout, this._text || ' ');
        }

        // Request natural text size, swapped when rotated. Needs the theme node,
        // so it only runs once the actor is on the stage.
        _updateSize() {
            if (!this.get_stage())
                return;
            try {
                const layout = this.create_pango_layout(null);
                this._applyText(layout);
                const [textWidth, textHeight] = layout.get_pixel_size();
                if (this._rotated)
                    this.set_size(textHeight, textWidth);
                else
                    this.set_size(textWidth, textHeight);
            } catch (error) {
                // Ignore; a later repaint/map will size it.
            }
        }

        _draw() {
            const context = this.get_context();
            try {
                const [surfaceWidth, surfaceHeight] = this.get_surface_size();
                const themeNode = this.get_theme_node();
                const color = themeNode.get_foreground_color();
                context.setSourceRGBA(
                    color.red / 255,
                    color.green / 255,
                    color.blue / 255,
                    (color.alpha || 255) / 255
                );
                applyRotation(
                    context,
                    this._rotated,
                    this._rotateDir,
                    surfaceWidth,
                    surfaceHeight
                );
                const layout = PangoCairo.create_layout(context);
                const font = themeNode.get_font();
                if (font)
                    layout.set_font_description(font);
                // Any colour the caller's markup sets paints over the theme
                // colour applied above; the rest inherits it.
                this._applyText(layout);
                PangoCairo.show_layout(context, layout);
            } catch (error) {
                logError(error, 'GNOME Widget Panel: panel text draw failed');
            } finally {
                context.$dispose();
            }
        }
    }
);
