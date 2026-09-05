// @ts-nocheck
// @tag:widget-ai-agent-status
import {AiAgentStatus} from './aiAgentStatus.js';

export function create(parent, options) {
    // The collector belongs to the panel, not to this widget: it keeps running
    // when the widget is removed, and the widget says so when it is switched
    // off. See ../../aiCollector.ts.
    return new AiAgentStatus(parent?.aiCollector ?? null, options);
}
