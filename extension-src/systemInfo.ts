// @ts-nocheck
// @tag:mechanism
//
// Shared helpers for the "About" surface and GitHub issue integration.
//
// Builds prefilled GitHub "new issue" URLs (bug report, feature request, widget
// request) against the issue *forms* under `.github/ISSUE_TEMPLATE/`, collects a
// best-effort plaintext system report for bug reports, and opens URLs in the
// default browser. Runs in both the Shell process (extension.ts / controlButton)
// and the preferences process (prefs.ts), so it never imports Shell-only
// modules and guards every read — it must never throw.
//
// See ../docs/preferences.md (About section).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// The canonical repository URL. Kept as a constant so callers link to a single
// source.
export const repoUrl = 'https://github.com/mpashka/gnome-widget-panel';

// GitHub "new issue" endpoint and the issue-form filenames created under
// `.github/ISSUE_TEMPLATE/`. These names must match those files exactly.
const NEW_ISSUE_URL = `${repoUrl}/issues/new`;
const BUG_TEMPLATE = 'bug_report.yml';
const FEATURE_TEMPLATE = 'feature_request.yml';
const WIDGET_TEMPLATE = 'widget_request.yml';

// GitHub Discussions/issues surface used for the roadmap. The labels query works
// without Discussions enabled; voting happens via GitHub reactions.
export const roadmapUrl = `${repoUrl}/issues?q=is%3Aissue+label%3Aroadmap`;

// Best-effort read of a whole text file. Returns '' on any failure; never throws.
function readTextFile(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const [ok, bytes] = file.load_contents(null);
        if (!ok || !bytes)
            return '';
        return new TextDecoder('utf-8').decode(bytes);
    } catch (_e) {
        return '';
    }
}

// Best-effort synchronous command run, returning trimmed stdout or '' on failure.
function runCommand(commandLine) {
    try {
        const [ok, stdout] = GLib.spawn_command_line_sync(commandLine);
        if (!ok || !stdout)
            return '';
        return new TextDecoder('utf-8').decode(stdout).trim();
    } catch (_e) {
        return '';
    }
}

// Parse a KEY="value" pair out of an os-release-style file body.
function parseKeyValue(body, key) {
    try {
        for (const line of body.split('\n')) {
            const eq = line.indexOf('=');
            if (eq < 0)
                continue;
            if (line.slice(0, eq).trim() !== key)
                continue;
            let value = line.slice(eq + 1).trim();
            // Strip surrounding quotes if present.
            if (
                value.length >= 2 &&
                (value[0] === '"' || value[0] === "'") &&
                value[value.length - 1] === value[0]
            )
                value = value.slice(1, -1);
            return value;
        }
    } catch (_e) {
        // fall through
    }
    return '';
}

// Extension version, read best-effort from the bundled metadata.json. A caller
// that already has `this.metadata.version` should prefer passing it to the URL
// helpers; this fallback lets contexts without metadata still report something.
function extensionVersion() {
    try {
        // In the generated install tree this module sits next to metadata.json.
        const dir = GLib.path_get_dirname(
            GLib.filename_from_uri(import.meta.url)[0]
        );
        const body = readTextFile(GLib.build_filenamev([dir, 'metadata.json']));
        if (body) {
            const parsed = JSON.parse(body);
            if (parsed && parsed.version !== undefined)
                return String(parsed.version);
        }
    } catch (_e) {
        // fall through
    }
    return 'unknown';
}

// GNOME Shell version. Inside the Shell process the config resource is present;
// in the prefs process it is not, so fall back to `gnome-shell --version`.
function gnomeShellVersion() {
    try {
        // Only importable inside the gnome-shell process.
        // eslint-disable-next-line no-undef
        const Config = imports.misc.config;
        if (Config && Config.PACKAGE_VERSION)
            return String(Config.PACKAGE_VERSION);
    } catch (_e) {
        // Not in the Shell process (or legacy imports unavailable).
    }
    const out = runCommand('gnome-shell --version');
    if (out) {
        // e.g. "GNOME Shell 50.0" -> "50.0"
        const match = out.match(/([0-9][0-9.]*)/);
        return match ? match[1] : out;
    }
    return 'unknown';
}

// Collect a short plaintext report to prefill into a bug report. Every field is
// best-effort and guarded; the function never throws.
export function collectSystemInfo(): string {
    const lines = [];

    lines.push(`Extension version: ${extensionVersion()}`);
    lines.push(`GNOME Shell version: ${gnomeShellVersion()}`);

    const osRelease = readTextFile('/etc/os-release');
    const distro = osRelease ? parseKeyValue(osRelease, 'PRETTY_NAME') : '';
    lines.push(`OS / distro: ${distro || 'unknown'}`);

    let kernel = runCommand('uname -sr');
    if (!kernel) {
        const osrel = readTextFile('/proc/sys/kernel/osrelease').trim();
        kernel = osrel ? `Linux ${osrel}` : '';
    }
    lines.push(`Kernel: ${kernel || 'unknown'}`);

    const sessionType = GLib.getenv('XDG_SESSION_TYPE') || 'unknown';
    lines.push(`Session type: ${sessionType}`);

    const wayland = GLib.getenv('WAYLAND_DISPLAY');
    const display = GLib.getenv('DISPLAY');
    let windowing = 'unknown';
    if (sessionType === 'wayland' || wayland)
        windowing = 'Wayland';
    else if (sessionType === 'x11' || display)
        windowing = 'X11';
    lines.push(`Windowing: ${windowing}`);

    return lines.join('\n');
}

// Assemble a GitHub new-issue URL for an issue form, appending any extra
// URL-encoded query fields (e.g. a prefilled form field). `template` selects the
// YAML issue form.
function buildIssueUrl(template, fields = {}) {
    const params = [`template=${encodeURIComponent(template)}`];
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null || value === '')
            continue;
        params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
    return `${NEW_ISSUE_URL}?${params.join('&')}`;
}

// Bug report URL: points at the bug_report.yml issue form and prefills the
// "system" textarea field with the collected system info so it lands in the
// form. GitHub maps a query param to a form field by that field's `id`.
export function bugReportUrl(): string {
    return buildIssueUrl(BUG_TEMPLATE, {system: collectSystemInfo()});
}

// Feature request URL: opens the feature_request.yml issue form.
export function featureRequestUrl(): string {
    return buildIssueUrl(FEATURE_TEMPLATE);
}

// Widget request URL: opens the widget_request.yml issue form.
export function widgetRequestUrl(): string {
    return buildIssueUrl(WIDGET_TEMPLATE);
}

// Open a URL in the default browser. Guarded; failures are logged, never thrown.
export function openUrl(url): void {
    try {
        Gio.AppInfo.launch_default_for_uri(url, null);
    } catch (e) {
        try {
            logError(e, `widget-panel: failed to open URL ${url}`);
        } catch (_e) {
            // logError may be unavailable outside the Shell; ignore.
        }
    }
}
