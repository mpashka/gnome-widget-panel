// @tag:widget-ai-agent-usage
//
// The slot decides whether the panel may write `settings.json` at all. A wrong
// answer silently replaces a status line the user wrote, or drops a segment into
// a directory nothing runs and calls that an install.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    evaluateSlot,
    planSlotWrites,
} from '../extension/plugins/ai-agent-usage/statusLineSlot.js';

const HOME = '/home/tester';
const HOOK = `${HOME}/.claude/gnome-widget-panel-claude-hook.js`;
const SEGMENTS = `${HOME}/.claude/status_line.d`;
const DISPATCHER = `${HOME}/.claude/statusline-dispatch`;
const OWN_SCRIPT = `${HOME}/bin/my-statusline.sh`;

const FILES = {
    [DISPATCHER]: '#!/bin/bash\ndir=${CLAUDE_STATUSLINE_DIR:-$HOME/.claude/status_line.d}\n',
    [OWN_SCRIPT]: '#!/bin/sh\nprintf "%s" "$(whoami)"\n',
};

async function readTextHead(path) {
    return FILES[path] ?? null;
}


function settingsWith(statusLine) {
    return JSON.stringify({model: 'opus', permissions: {allow: ['Bash(ls)']}, statusLine}, null, 2);
}


function slotRunning(command) {
    return settingsWith({type: 'command', command, padding: 0});
}


async function evaluate(settingsText, segmentsDirExists = false) {
    return evaluateSlot(
        {settingsText, hookPath: HOOK, segmentsDir: SEGMENTS, segmentsDirExists, home: HOME},
        readTextHead
    );
}


async function stateOf(settingsText, segmentsDirExists = false) {
    return (await evaluate(settingsText, segmentsDirExists)).state;
}


test('an empty slot with no segment directory is free', async () => {
    assert.equal(await stateOf(null), 'free');
    assert.equal(await stateOf('{}'), 'free');
    assert.equal(await stateOf(JSON.stringify({model: 'opus'})), 'free');
    assert.equal(await stateOf(JSON.stringify({statusLine: null})), 'free');
});

test('the slot is ours when it runs the panel hook, however the path is spelled', async () => {
    for (const command of [HOOK, `"${HOOK}"`, '~/.claude/gnome-widget-panel-claude-hook.js',
        '$HOME/.claude/gnome-widget-panel-claude-hook.js'])
        assert.equal(await stateOf(slotRunning(command)), 'ours', command);
});

// Nothing reads the directory then, but the line is the panel's and it works.
test('ours wins over a segment directory', async () => {
    assert.equal(await stateOf(slotRunning(HOOK), true), 'ours');
});

test('a dispatcher that reads the segment directory owns the line', async () => {
    assert.equal(await stateOf(slotRunning(DISPATCHER), true), 'dispatched');
    assert.equal(await stateOf(slotRunning('~/.claude/statusline-dispatch'), true), 'dispatched');
    assert.equal(await stateOf(slotRunning('compose-line --dir ~/.claude/status_line.d'), true),
        'dispatched');
});

test('somebody else\'s command is taken', async () => {
    assert.equal(await stateOf(slotRunning(OWN_SCRIPT)), 'taken');
    assert.equal(await stateOf(slotRunning('npx -y ccstatusline@latest')), 'taken');
    assert.equal(await stateOf(slotRunning(`${HOOK} --verbose`)), 'taken');
    assert.equal(await stateOf(settingsWith({type: 'command'})), 'taken');
    assert.equal(await stateOf(settingsWith('echo hi')), 'taken');
});

// The directory proves only that somebody created it.
test('a segment directory beside a command that never reads it stays taken', async () => {
    assert.equal(await stateOf(slotRunning(OWN_SCRIPT), true), 'taken');
    assert.equal(await stateOf(slotRunning('npx -y ccstatusline@latest'), true), 'taken');
});

test('a dispatcher without its directory is just somebody else\'s command', async () => {
    assert.equal(await stateOf(slotRunning(DISPATCHER)), 'taken');
});

test('a segment directory that nothing runs is an orphan', async () => {
    assert.equal(await stateOf(null, true), 'orphan');
    assert.equal(await stateOf(JSON.stringify({model: 'opus'}), true), 'orphan');
    assert.equal(await stateOf(slotRunning(`${HOME}/.claude/uninstalled-dispatch`), true), 'orphan');
});

test('settings that are not a JSON object are unreadable', async () => {
    for (const text of ['', 'not json', '[]', '"statusLine"', '{"statusLine": {"type"'])
        assert.equal(await stateOf(text), 'unreadable', JSON.stringify(text));
});

test('the report names the command it found', async () => {
    assert.deepEqual(await evaluate(slotRunning(OWN_SCRIPT)), {state: 'taken', command: OWN_SCRIPT});
    assert.deepEqual(await evaluate(null), {state: 'free', command: null});
});

test('free takes the slot and keeps every other setting', () => {
    const before = settingsWith(undefined);
    const writes = planSlotWrites('free', before, HOOK);
    assert.equal(writes.hook, true);
    assert.equal(writes.segment, undefined);
    assert.deepEqual(JSON.parse(writes.settingsText), {
        ...JSON.parse(before),
        statusLine: {type: 'command', command: HOOK},
    });
    assert.ok(writes.settingsText.endsWith('}\n'));
});

test('free with no settings file writes only the slot', () => {
    const writes = planSlotWrites('free', null, HOOK);
    assert.deepEqual(JSON.parse(writes.settingsText), {statusLine: {type: 'command', command: HOOK}});
});

test('ours refreshes the hook and leaves settings.json alone', () => {
    assert.deepEqual(planSlotWrites('ours', slotRunning(HOOK), HOOK), {hook: true});
});

test('dispatched writes the segment and nothing else', () => {
    assert.deepEqual(planSlotWrites('dispatched', slotRunning(DISPATCHER), HOOK), {segment: true});
});

test('taken, orphan and unreadable write nothing at all', () => {
    for (const state of ['taken', 'orphan', 'unreadable'])
        assert.deepEqual(planSlotWrites(state, slotRunning(OWN_SCRIPT), HOOK), {}, state);
});

// The regression that made this module: a user's own status line was replaced
// on the first shell start after installing the panel.
test('a foreign status line survives the install decision byte for byte', async () => {
    const before = slotRunning(OWN_SCRIPT);
    const slot = await evaluate(before);
    const writes = planSlotWrites(slot.state, before, HOOK);
    assert.equal(writes.settingsText, undefined);
    assert.deepEqual(writes, {});
});
