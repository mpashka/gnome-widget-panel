// @tag:ui
// Shared, gi-free duration formatting. Every widget that shows a countdown —
// the break timer's bars, tooltip and break screen, caffeine's remaining
// keep-awake time — writes it the same way, so one glance reads the same
// everywhere. Free of GNOME imports so `npm test` can drive it directly.

/**
 * A duration as it is *edited* rather than counted down: `30 s` below a minute,
 * `45 min` below an hour, `1:30` (h:mm) above one. Hours in minutes ("480") is
 * what a settings page must never ask anybody to read.
 */
export function formatClock(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    if (seconds < 60)
        return `${seconds} s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60)
        return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}


/**
 * How much one press of `−`/`+` moves a duration, in seconds. The step follows
 * the value: minutes matter when the interval is minutes long and stop
 * mattering once it is hours, so 8 hours is reachable without a hundred clicks
 * and 30 seconds is still reachable at all.
 */
export function durationStep(totalSeconds: number): number {
    const seconds = Math.max(0, Math.round(totalSeconds));
    if (seconds < 60)
        return 5;
    if (seconds < 10 * 60)
        return 60;
    if (seconds < 30 * 60)
        return 5 * 60;
    if (seconds < 60 * 60)
        return 10 * 60;
    if (seconds <= 3 * 3600)
        return 15 * 60;
    return 30 * 60;
}


/**
 * The next value one press of `−`/`+` produces: a step away, snapped to a
 * multiple of that step, clamped to `[min, max]`. Snapping is what makes a value
 * that arrived from elsewhere (an imported config, an older default) tidy up
 * instead of carrying its odd remainder forever.
 */
export function stepDuration(
    totalSeconds: number,
    direction: 1 | -1,
    [min, max]: readonly [number, number]
): number {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const step = durationStep(direction > 0 ? seconds : Math.max(0, seconds - 1));
    const next = direction > 0
        ? (Math.floor(seconds / step) + 1) * step
        : (Math.ceil(seconds / step) - 1) * step;
    return Math.min(max, Math.max(min, next));
}


/** Adaptive `H:MM:SS` (once an hour is reached) / `M:SS` duration formatter. */
export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0)
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}
