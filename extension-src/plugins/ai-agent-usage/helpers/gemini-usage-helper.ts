#!/usr/bin/env gjs
// @ts-nocheck
// @tag:widget-ai-agent-usage
'use strict';

// Out-of-process Gemini CLI usage collector. Runs as `gjs -m` (spawned by
// aiAgentUsageGraph.ts), polls the on-disk Gemini data dir every
// INTERVAL_SECONDS and streams normalized JSON Lines (provider: 'gemini') to
// stdout. It must never crash or block the Shell: every file read/parse is
// guarded and the collector emits nothing when it finds nothing.
//
// Data source (Linux): `~/.gemini/tmp/<project_hash>/` (override the root with
// GEMINI_DATA_DIR, matching ccusage's convention). Two files per active
// project:
//   - `logs.json` — array of process-level LogEntry records
//       {sessionId, messageId, type:"user", message, timestamp} — the reliable
//       source of recent user prompts (high confidence).
//   - `chats/*.json` — saved conversation records; parsed defensively for
//       Gemini `usageMetadata` token counts (totalTokenCount / promptTokenCount
//       / candidatesTokenCount / cachedContentTokenCount). The exact shape is
//       version-dependent (a JSONL migration is in flight upstream), so token
//       extraction is best-effort: when absent, prompts are still emitted and
//       tokens default to zero (lower confidence).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const INTERVAL_SECONDS = 5;
const REQUEST_HISTORY_SECONDS = 20 * 60;
const REQUEST_TEXT_MAX = 200;
// Token-bearing keys used by Gemini's usageMetadata (camelCase) and by any
// snake_case variants a future format might emit.
const TOKEN_KEYS = [
    'totalTokenCount', 'total_tokens', 'total',
    'promptTokenCount', 'prompt_tokens', 'input_tokens', 'input',
    'candidatesTokenCount', 'candidates_tokens', 'output_tokens', 'output',
    'cachedContentTokenCount', 'cached_content_tokens', 'cache_read',
];

function now() {
    return new Date().toISOString();
}

function geminiRoot() {
    const override = GLib.getenv('GEMINI_DATA_DIR');
    if (override) {
        // GEMINI_DATA_DIR may be a comma-separated list; use the first entry.
        const first = override.split(',')[0].trim();
        if (first)
            return first;
    }
    return GLib.build_filenamev([GLib.get_home_dir(), '.gemini', 'tmp']);
}

function readText(path) {
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(contents) : null;
    } catch (_) {
        return null;
    }
}

function readJson(path) {
    const text = readText(path);
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    } catch (_) {
        return null;
    }
}

// Recursively list files under `rootPath` whose name satisfies `matches`.
// Returns `[{path, mtime}]`; unreadable directories are skipped silently.
function listFiles(rootPath, matches) {
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
                } else if (matches(info.get_name(), child.get_path())) {
                    result.push({
                        path: child.get_path(),
                        mtime: info.get_attribute_uint64('time::modified'),
                    });
                }
            }
        } catch (_) {
            // Ignore unreadable subdirectories.
        } finally {
            if (enumerator)
                enumerator.close(null);
        }
    }

    if (root.query_exists(null))
        walk(root);
    return result;
}

function newest(files) {
    files.sort((a, b) => b.mtime - a.mtime);
    return files.length ? files[0] : null;
}

// Recent user prompts from a project's logs.json (array of LogEntry records).
function extractRequests(logsPath) {
    const data = readJson(logsPath);
    if (!Array.isArray(data))
        return [];
    const cutoffMs = Date.now() - REQUEST_HISTORY_SECONDS * 1000;
    const requests = [];
    for (const entry of data) {
        if (!entry || entry.type !== 'user')
            continue;
        const text = String(entry.message ?? '').replace(/\s+/g, ' ').trim();
        if (!text)
            continue;
        const parsed = Date.parse(entry.timestamp);
        if (!Number.isFinite(parsed) || parsed < cutoffMs)
            continue;
        requests.push({
            timestamp: entry.timestamp,
            text: text.slice(0, REQUEST_TEXT_MAX),
        });
    }
    return requests;
}

// Defensively walk a parsed conversation record for the most recent
// token-usage object (last one in document order, i.e. the latest turn).
function extractTokens(root) {
    let latest = null;

    function isTokenObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return false;
        return TOKEN_KEYS.some(key => Number.isFinite(Number(value[key])));
    }

    function walk(value) {
        if (Array.isArray(value)) {
            for (const item of value)
                walk(item);
            return;
        }
        if (!value || typeof value !== 'object')
            return;
        if (isTokenObject(value))
            latest = value;
        for (const key of Object.keys(value))
            walk(value[key]);
    }

    walk(root);
    if (!latest)
        return null;

    const num = (...keys) => {
        for (const key of keys) {
            const value = Number(latest[key]);
            if (Number.isFinite(value))
                return value;
        }
        return 0;
    };
    const input = num('promptTokenCount', 'prompt_tokens', 'input_tokens', 'input');
    const output = num('candidatesTokenCount', 'candidates_tokens', 'output_tokens', 'output');
    const cacheRead = num('cachedContentTokenCount', 'cached_content_tokens', 'cache_read');
    const total = num('totalTokenCount', 'total_tokens', 'total') || (input + output);
    if (total <= 0)
        return null;
    return {input, output, cache_read: cacheRead, total};
}

// Pick the most recently active project (newest logs.json), then read its
// prompts and (from its chats/ session files) its latest token usage.
function collect() {
    const root = geminiRoot();
    const logs = newest(listFiles(root, name => name === 'logs.json'));
    if (!logs)
        return null;

    const projectDir = Gio.File.new_for_path(logs.path).get_parent()?.get_path();
    const requests = extractRequests(logs.path);

    let tokens = null;
    let sessionFile = null;
    if (projectDir) {
        sessionFile = newest(listFiles(
            projectDir,
            (name, path) => name.endsWith('.json')
                && name !== 'logs.json'
                && path.includes(`${GLib.DIR_SEPARATOR_S}chats${GLib.DIR_SEPARATOR_S}`)
        ));
        if (sessionFile)
            tokens = extractTokens(readJson(sessionFile.path));
    }

    if (!tokens && !requests.length)
        return null;

    const value = {
        provider: 'gemini',
        updated_at: now(),
        tokens: tokens ?? {input: 0, output: 0, cache_read: 0, total: 0},
        context: {window_tokens: 0},
    };
    value.tokens.session_total = value.tokens.total;

    if (tokens && sessionFile) {
        // Dedupe identical token states so an idle session does not keep the
        // graph pinned; freshness is the session file's mtime.
        value.event_id = `${sessionFile.path}:${tokens.total}`;
        value.event_timestamp = new Date(sessionFile.mtime * 1000).toISOString();
    }
    if (requests.length)
        value.requests = requests;

    return value;
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
