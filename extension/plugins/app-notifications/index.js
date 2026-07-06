import * as IndicatorsDrawer from '../../indicatorsDrawer.js';

export function create(parent) {
    return new IndicatorsDrawer.IndicatorsDrawer(
        parent,
        role => role.startsWith('appindicator')
    );
}
