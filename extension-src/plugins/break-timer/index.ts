// @ts-nocheck
// @tag:widget-break-timer
import {BreakTimerGraph} from './breakTimerGraph.js';

export function create(parent, options) {
    // The panel is passed on so the end-of-day window's "change my usual end of
    // day" can open the preferences window the same way the panel's own menu
    // does. Nothing else in the widget uses it.
    return new BreakTimerGraph(options ?? {}, parent);
}
