// @ts-nocheck
// @tag:widget-keyboard-layout
import * as IndicatorsDrawer from '../../indicatorsDrawer.js';

export function create(parent, options) {
    return new IndicatorsDrawer.IndicatorsDrawer(
        parent,
        role => role === 'keyboard',
        true
    );
}
