// @tag:widget-ai-agent-status
'use strict';

// The attention pulse's opacity curve, as plain arithmetic.
//
// It used to be a Clutter `ease` restarted every half-cycle, which interpolates
// at the frame rate: one 12 px dot breathing cost ~3 % of a CPU core for as long
// as a promptable session existed, measured in the headless stand (gwp-231).
// Stepping the opacity on a timer instead costs one frame per step, so the price
// is set by `stepMs` rather than by the monitor's refresh rate.
//
// Deliberately free of any `gi://` import: arithmetic, unit tested by Node
// (`../../../tests/pulseOpacity.test.mjs`).

/**
 * Opacity of a pulsing dot at step `step` of a triangular full → dim → full
 * cycle of `2 * halfSteps` steps, shaped like the `EASE_IN_OUT_QUAD` the eased
 * pulse used, so the stepped pulse keeps the same rhythm.
 *
 * `step` may run past the cycle: it is taken modulo its length, so the caller
 * can keep a counter that only ever increments. `halfSteps` below 1 is treated
 * as 1 (a hard blink).
 */
export function pulseOpacity(
    step: number,
    halfSteps: number,
    lowOpacity: number
): number {
    const half = Math.max(1, Math.round(halfSteps));
    const cycle = half * 2;
    const index = ((Math.round(step) % cycle) + cycle) % cycle;
    // 0 at full brightness, 1 at the dim end, linear in both directions.
    const phase = index <= half ? index / half : (cycle - index) / half;
    const eased = phase < 0.5
        ? 2 * phase * phase
        : 1 - 2 * (1 - phase) * (1 - phase);
    return Math.round(255 - eased * (255 - lowOpacity));
}
