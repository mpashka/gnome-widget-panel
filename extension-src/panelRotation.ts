// @tag:ui
//
// Geometry shared by the panel's Cairo widgets (the graphs and the clock's
// text): a widget draws in its own "base" coordinate space — wide and short,
// the way it looks in a horizontal panel — and a rotation maps that space onto
// the tall, narrow surface a vertical strip gives it.
//
// The one rule worth remembering: **the drawing box comes from the surface, not
// from the size the widget asked for**. A widget asks for 32×16, but the strip
// is 20 px wide and CSS margins take their cut, so the allocation can be
// narrower; drawing the requested size into a smaller surface put the last of
// the break-timer's stacked bars past the edge, leaving a one-pixel sliver of
// the daily bar.
//
// gi-free (a Cairo context is passed in), so the mapping is unit tested in
// plain Node — see ../tests/panelRotation.test.mjs.

/** Which way a vertical strip turns its widgets. */
export type PanelRotation = 'left' | 'right';

/**
 * The base drawing box for a surface of `sw`×`sh`: unchanged while horizontal,
 * swapped when the widget is rotated, so `width` is always the long axis the
 * widget draws along and `height` the thickness across the strip.
 */
export function drawingBox(
    rotated: boolean,
    surfaceWidth: number,
    surfaceHeight: number
): [number, number] {
    return rotated
        ? [surfaceHeight, surfaceWidth]
        : [surfaceWidth, surfaceHeight];
}

/**
 * Rotate `context` so a drawing made in the base box lands on the rotated
 * surface: `right` runs the long axis top→bottom, `left` bottom→top. A no-op
 * while horizontal, so callers need no branch of their own.
 */
export function applyRotation(
    context: {translate(x: number, y: number): void; rotate(angle: number): void},
    rotated: boolean,
    direction: PanelRotation,
    surfaceWidth: number,
    surfaceHeight: number
): void {
    if (!rotated)
        return;
    if (direction === 'left') {
        context.translate(0, surfaceHeight);
        context.rotate(-Math.PI / 2);
    } else {
        context.translate(surfaceWidth, 0);
        context.rotate(Math.PI / 2);
    }
}
