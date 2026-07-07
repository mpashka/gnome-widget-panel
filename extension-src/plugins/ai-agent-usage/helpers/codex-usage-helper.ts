#!/usr/bin/env gjs
// @ts-nocheck
'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const INTERVAL_SECONDS = 5;

function now() {
    return new Date().toISOString();
}

function readText(path) {
    const [ok, contents] = GLib.file_get_contents(path);
    return ok ? new TextDecoder().decode(contents) : null;
}

function listJsonlFiles(rootPath) {
    const root = Gio.File.new_for_path(rootPath);
    const result = [];

    function walk(file) {
        let enumerator = null;
        try {
            enumerator = file.enumerate_children(
                'standard::name,standard::type,time::modified',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const child = file.get_child(info.get_name());
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    walk(child);
                } else if (info.get_name().endsWith('.jsonl')) {
                    result.push({
                        path: child.get_path(),
                        mtime: info.get_attribute_uint64('time::modified'),
                    });
                }
            }
        } catch (_) {
            // Ignore unreadable session subdirectories.
        } finally {
            if (enumerator)
                enumerator.close(null);
        }
    }

    if (root.query_exists(null))
        walk(root);
    return result;
}

function newestSession() {
    const sessionsRoot = GLib.build_filenamev([
        GLib.get_home_dir(),
        '.codex',
        'sessions',
    ]);
    const files = listJsonlFiles(sessionsRoot);
    files.sort((a, b) => b.mtime - a.mtime);
    return files.length ? files[0].path : null;
}

function parsePayload(path) {
    const text = readText(path);
    if (!text)
        return null;

    let latest = null;
    let latestEvent = null;
    for (const line of text.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const event = JSON.parse(line);
            const payload = event.payload ?? {};
            if (event.type === 'event_msg' && payload.type === 'token_count') {
                latest = payload;
                latestEvent = event;
            }
        } catch (_) {
            // Ignore partial or unrelated JSONL lines.
        }
    }
    if (!latest)
        return null;

    const info = latest.info ?? {};
    const usage = info.total_token_usage ?? {};
    const lastUsage = info.last_token_usage ?? {};
    const value = {
        provider: 'codex',
        updated_at: now(),
        event_id: `${path}:${latestEvent?.timestamp ?? ''}:${usage.total_tokens ?? ''}`,
        event_timestamp: latestEvent?.timestamp ?? null,
        tokens: {
            input: Number(lastUsage.input_tokens ?? usage.input_tokens ?? 0),
            output: Number(lastUsage.output_tokens ?? usage.output_tokens ?? 0),
            cache_read: Number(lastUsage.cached_input_tokens ?? usage.cached_input_tokens ?? 0),
            total: Number(lastUsage.total_tokens ?? usage.total_tokens ?? 0),
            session_total: Number(usage.total_tokens ?? 0),
        },
        context: {
            window_tokens: Number(info.model_context_window ?? 0),
        },
    };

    const rateLimits = latest.rate_limits ?? {};
    const limits = {};
    for (const name of ['primary', 'secondary']) {
        if (!rateLimits[name])
            continue;
        limits[name] = {
            used_percent: rateLimits[name].used_percent ?? null,
            window_minutes: rateLimits[name].window_minutes ?? null,
            resets_at: rateLimits[name].resets_at ?? null,
        };
    }
    if (Object.keys(limits).length)
        value.limits = limits;

    return value;
}

function collect() {
    const session = newestSession();
    return session ? parsePayload(session) : null;
}

function emit(value) {
    if (value)
        print(JSON.stringify(value));
}

emit(collect());
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, INTERVAL_SECONDS, () => {
    emit(collect());
    return GLib.SOURCE_CONTINUE;
});

new GLib.MainLoop(null, false).run();
