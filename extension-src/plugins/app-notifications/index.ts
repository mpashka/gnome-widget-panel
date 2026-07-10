// @ts-nocheck
// @tag:widget-app-notifications
import * as IndicatorsDrawer from '../../indicatorsDrawer.js';

export function create(parent, options) {
    return new IndicatorsDrawer.IndicatorsDrawer(
        parent,
        role => role.startsWith('appindicator')
    );
}
