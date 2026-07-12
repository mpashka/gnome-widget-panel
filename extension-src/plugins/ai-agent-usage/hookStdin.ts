// @tag:widget-ai-agent-usage
//
// The stdin-reading code injected verbatim into the generated Claude hook
// scripts (statusLine + lifecycle events). Kept gi-free so it can be
// unit-tested, and shared so both scripts stay in sync.
//
// Claude Code passes a hook's input JSON on a socketpair — fd 0 is a socket
// (G_FILE_TYPE_SPECIAL), not a regular pipe — so `GLib.file_get_contents(
// '/dev/stdin')`, which re-opens the `/dev/stdin` path, reads nothing and the
// hook forwards an empty body (which then fails JSON.parse and delivers no
// samples/markers/sessions). Read the inherited fd 0 directly and loop to EOF.
//
// The stream class moved from `Gio.UnixInputStream` (deprecated on GNOME 50,
// which prints a stack-trace warning on every hook run) to `GioUnix.InputStream`.
// Resolve it once via a dynamic import (top-level await), falling back to the
// old class on older GNOME (46) that has no `GioUnix` typelib.

export const READ_STDIN_FN = `const GWP_UnixInputStream = await (async () => {
    try {
        const GioUnix = (await import('gi://GioUnix')).default;
        if (GioUnix && GioUnix.InputStream)
            return GioUnix.InputStream;
    } catch (_e) {
        // Older GNOME without a separate GioUnix typelib.
    }
    return Gio.UnixInputStream;
})();

function readStdin() {
    try {
        const stream = new GWP_UnixInputStream({fd: 0, close_fd: false});
        const chunks = [];
        let total = 0;
        for (;;) {
            const bytes = stream.read_bytes(65536, null);
            const size = bytes.get_size();
            if (size === 0)
                break;
            chunks.push(bytes.get_data());
            total += size;
        }
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    } catch (error) {
        return new Uint8Array();
    }
}`;
