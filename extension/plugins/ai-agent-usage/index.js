// @ts-nocheck
import { AiAgentUsageGraph } from './aiAgentUsageGraph.js';
export function create(parent, options) {
    return new AiAgentUsageGraph(parent._extensionPath, options);
}
