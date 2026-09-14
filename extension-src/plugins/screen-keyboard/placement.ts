// @tag:widget-screen-keyboard
//
// gi-free placement of the floating keyboard next to its panel button.

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Size {
    width: number;
    height: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Position for a surface of `size` next to `anchor`, inside `area`, `gap` pixels
 * away. Above or below is preferred — the keyboard is wide and a horizontal
 * panel is the common case — on whichever side has more room; a side placement
 * is used only when neither above nor below fits (a vertical panel on a short
 * screen). The result is always clamped into `area`.
 */
export function placeBeside(anchor: Rect, size: Size, area: Rect, gap: number): {x: number; y: number} {
    const roomAbove = anchor.y - area.y - gap;
    const roomBelow = area.y + area.height - (anchor.y + anchor.height) - gap;
    const roomLeft = anchor.x - area.x - gap;
    const roomRight = area.x + area.width - (anchor.x + anchor.width) - gap;
    const clampX = (x: number) => clamp(x, area.x, area.x + area.width - size.width);
    const clampY = (y: number) => clamp(y, area.y, area.y + area.height - size.height);

    const centeredX = anchor.x + Math.floor((anchor.width - size.width) / 2);
    const centeredY = anchor.y + Math.floor((anchor.height - size.height) / 2);

    if (Math.max(roomAbove, roomBelow) >= size.height) {
        const y = roomAbove >= roomBelow
            ? anchor.y - gap - size.height
            : anchor.y + anchor.height + gap;
        return {x: clampX(centeredX), y: clampY(y)};
    }
    if (Math.max(roomLeft, roomRight) >= size.width) {
        const x = roomLeft >= roomRight
            ? anchor.x - gap - size.width
            : anchor.x + anchor.width + gap;
        return {x: clampX(x), y: clampY(centeredY)};
    }
    return {x: clampX(centeredX), y: clampY(anchor.y + anchor.height + gap)};
}
