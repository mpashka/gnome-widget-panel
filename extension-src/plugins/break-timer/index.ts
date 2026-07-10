// @ts-nocheck
// @tag:widget-break-timer
import {BreakTimerGraph} from './breakTimerGraph.js';

export function create(parent, options) {
    return new BreakTimerGraph(options ?? {});
}
