// @ts-nocheck
// Shared hover-tooltip positioning and show/hide animation used by the graph
// widgets (cpu-load-monitor, ai-agent-usage, ai-agent-status, break-timer).
// Each widget owns its own `_tooltip` actor and `_rotated` flag; these
// functions read them off the passed-in `actor`.

import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const TOOLTIP_OFFSET = 6;
export const TOOLTIP_ANIMATION_TIME = 150;

export function positionTooltip(actor) {
    const [stageX, stageY] = actor.get_transformed_position();
    const [actorWidth, actorHeight] = actor.allocation.get_size();
    const [tipWidth, tipHeight] = actor._tooltip.get_size();
    const monitor = Main.layoutManager.findMonitorForActor(actor);
    if (actor._rotated) {
        // Vertical panel: the strip hugs a screen edge, so an above/below
        // tooltip would overlap the strip and its neighbours. Place the
        // tooltip beside the widget, on whichever side has more room
        // (widget in the right half of the monitor → left, else right),
        // vertically centred on the widget and clamped to the monitor.
        const widgetCenterX = stageX + actorWidth / 2;
        const placeLeft =
            widgetCenterX > monitor.x + monitor.width / 2;
        const x = placeLeft
            ? stageX - tipWidth - TOOLTIP_OFFSET
            : stageX + actorWidth + TOOLTIP_OFFSET;
        const clampedX = Math.clamp(
            x,
            monitor.x,
            monitor.x + monitor.width - tipWidth
        );
        const y = Math.clamp(
            stageY + Math.floor((actorHeight - tipHeight) / 2),
            monitor.y,
            monitor.y + monitor.height - tipHeight
        );
        actor._tooltip.set_position(clampedX, y);
        return;
    }
    const x = Math.clamp(
        stageX + Math.floor((actorWidth - tipWidth) / 2),
        monitor.x,
        monitor.x + monitor.width - tipWidth
    );
    const y = stageY - monitor.y > actorHeight + TOOLTIP_OFFSET
        ? stageY - tipHeight - TOOLTIP_OFFSET
        : stageY + actorHeight + TOOLTIP_OFFSET;
    actor._tooltip.set_position(x, y);
}

export function animateTooltipVisibility(actor, show) {
    if (show) {
        actor._tooltip.opacity = 0;
        actor._tooltip.visible = true;
        actor._tooltip.ease({
            opacity: 255,
            duration: TOOLTIP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    } else {
        actor._tooltip.ease({
            opacity: 0,
            duration: TOOLTIP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (actor._tooltip)
                    actor._tooltip.visible = false;
            },
        });
    }
}
