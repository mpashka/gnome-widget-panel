// Unit tests for the shared panel-widget rotation geometry: the drawing box a
// widget gets for a surface, and the transform that maps it onto a vertical
// strip. Run with `npm test` (which builds first).
import test from 'node:test';
import assert from 'node:assert/strict';

import {applyRotation, drawingBox} from '../extension/panelRotation.js';

// Records what a widget would do to a Cairo context, and replays it on a point
// so a test can say where a base coordinate lands on the surface.
function fakeContext() {
    const operations = [];
    return {
        operations,
        translate(x, y) {
            operations.push(['translate', x, y]);
        },
        rotate(angle) {
            operations.push(['rotate', angle]);
        },
        // Apply the recorded transform to a point of the base drawing box.
        map(x, y) {
            let point = {x, y};
            for (const [kind, a, b] of operations) {
                if (kind === 'translate') {
                    point = {x: point.x + a, y: point.y + b};
                } else {
                    const cos = Math.cos(a);
                    const sin = Math.sin(a);
                    point = {
                        x: point.x * cos - point.y * sin,
                        y: point.x * sin + point.y * cos,
                    };
                }
            }
            return [Math.round(point.x), Math.round(point.y)];
        },
    };
}

// The base box is applied in the order the widgets do it: translate/rotate are
// recorded first, then the point is mapped through them in reverse — which is
// what Cairo does, so map() replays them innermost-last.
function mapPoint(rotated, direction, sw, sh, x, y) {
    const context = fakeContext();
    applyRotation(context, rotated, direction, sw, sh);
    context.operations.reverse();
    return context.map(x, y);
}

test('a horizontal widget draws in its surface as it is', () => {
    assert.deepEqual(drawingBox(false, 32, 16), [32, 16]);
    assert.deepEqual(mapPoint(false, 'right', 32, 16, 5, 3), [5, 3]);
});

test('a rotated widget draws in the SURFACE, swapped — not in what it asked for', () => {
    // The regression: a 32x16 graph allocated only 12x32 by the strip used to
    // keep drawing 32x16, so its last stacked bar fell off the edge and showed
    // as a one-pixel sliver. The box now follows the surface.
    assert.deepEqual(drawingBox(true, 12, 32), [32, 12]);
    assert.deepEqual(drawingBox(true, 16, 32), [32, 16]);
});

test('rotating right runs the long axis top to bottom, inside the surface', () => {
    const [sw, sh] = [16, 32];
    const [width, height] = drawingBox(true, sw, sh);
    // The corners of the base box land on the corners of the surface.
    assert.deepEqual(mapPoint(true, 'right', sw, sh, 0, 0), [sw, 0]);
    assert.deepEqual(mapPoint(true, 'right', sw, sh, width, 0), [sw, sh]);
    assert.deepEqual(mapPoint(true, 'right', sw, sh, 0, height), [0, 0]);
    assert.deepEqual(mapPoint(true, 'right', sw, sh, width, height), [0, sh]);
});

test('rotating left runs the long axis bottom to top, inside the surface', () => {
    const [sw, sh] = [16, 32];
    const [width, height] = drawingBox(true, sw, sh);
    assert.deepEqual(mapPoint(true, 'left', sw, sh, 0, 0), [0, sh]);
    assert.deepEqual(mapPoint(true, 'left', sw, sh, width, 0), [0, 0]);
    assert.deepEqual(mapPoint(true, 'left', sw, sh, 0, height), [sw, sh]);
    assert.deepEqual(mapPoint(true, 'left', sw, sh, width, height), [sw, 0]);
});

test('an unknown direction is treated as "right"', () => {
    const [sw, sh] = [16, 32];
    assert.deepEqual(
        mapPoint(true, 'sideways', sw, sh, 4, 5),
        mapPoint(true, 'right', sw, sh, 4, 5)
    );
});
