// @ts-nocheck
// @tag:widget-cpu-load-monitor
import {CpuGraph} from './cpuGraph.js';

export function create(parent, options) {
    return new CpuGraph(options ?? {});
}
