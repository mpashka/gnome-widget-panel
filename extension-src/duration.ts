// @tag:ui
// Shared, gi-free duration formatting. Every widget that shows a countdown —
// the break timer's bars, tooltip and break screen, caffeine's remaining
// keep-awake time — writes it the same way, so one glance reads the same
// everywhere. Free of GNOME imports so `npm test` can drive it directly.

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
