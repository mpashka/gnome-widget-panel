// Shared, gi-free colour and numeric helpers used by the graph widgets
// (cpu-load-monitor, ai-agent-usage, ai-agent-status, break-timer). Deliberately
// free of any `gi://` import so it stays unit testable in plain Node.

export function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

export function hexToRgb(hex) {
    const raw = String(hex).replace('#', '');
    const full = raw.length === 3
        ? raw.split('').map(c => c + c).join('')
        : raw;
    const channel = start => {
        const value = parseInt(full.slice(start, start + 2), 16) / 255;
        return Number.isFinite(value) ? value : 0;
    };
    return [channel(0), channel(2), channel(4)];
}
