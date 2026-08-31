// Unit tests for the gi-free break-timer logic: activity bookkeeping, the
// reset rules and the reminder state machine.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {formatDuration} from '../extension/duration.js';
import {
    DUE_MESSAGE_SECONDS,
    advance,
    createState,
    leadSeconds,
    limitSeconds,
    normalizeTimers,
    pauseRemainingSeconds,
    pauseReminders,
    postponeReminder,
    restoreElapsed,
    resumeReminders,
    serializeState,
    skipReminder,
} from '../extension/plugins/break-timer/breakTimerState.js';

const TIMERS = normalizeTimers(undefined);
const MICRO = TIMERS[0];
const REST = TIMERS[1];

// Run `seconds` ticks with the same input; returns the resulting state.
function run(state, seconds, input = {}, timers = TIMERS) {
    let next = state;
    for (let i = 0; i < seconds; i++) {
        next = advance(next, timers, {
            idleSeconds: 0,
            tickSeconds: 1,
            canInterrupt: true,
            inhibited: false,
            now: 0,
            dailyIdleResetSeconds: 0,
            ...input,
        });
    }
    return next;
}

// Like run(), but wall-clock time moves with the ticks: only the manual pause
// deadline reads it.
function runClock(state, seconds, startNow, input = {}, timers = TIMERS) {
    let next = state;
    for (let i = 0; i < seconds; i++)
        next = run(next, 1, {now: startNow + i, ...input}, timers);
    return next;
}

test('defaults are three enabled timers: 10 min, 60 min, 8 h', () => {
    assert.deepEqual(TIMERS.map(t => t.name), ['micro', 'rest', 'daily']);
    assert.deepEqual(TIMERS.map(t => t.enabled), [true, true, true]);
    assert.deepEqual(TIMERS.map(t => t.workMinutes), [10, 60, 480]);
    assert.equal(TIMERS[2].breakSeconds, 0);
    assert.equal(TIMERS[2].reminder, 'notify');
});

test('normalizeTimers keeps valid fields and defaults invalid ones', () => {
    const [micro] = normalizeTimers([
        {name: 'micro', workMinutes: 3, breakSeconds: -1, reminder: 'nope', postponeMinutes: 7},
    ]);
    assert.equal(micro.workMinutes, 3);
    assert.equal(micro.breakSeconds, 30);
    assert.equal(micro.reminder, 'screen');
    assert.equal(micro.postponeMinutes, 7);
});

test('lead time is half the break, clamped, and configurable', () => {
    assert.equal(leadSeconds(MICRO), 15);
    assert.equal(leadSeconds(REST), 30);
    assert.equal(leadSeconds({...MICRO, leadSeconds: 3}), 3);
    assert.equal(leadSeconds(TIMERS[2]), 0);
});

test('activity accumulates, idle freezes the counters', () => {
    const working = run(createState(), 10);
    assert.equal(working.elapsed.micro, 10);
    assert.equal(working.elapsed.daily, 10);
    const paused = run(working, 10, {idleSeconds: 12});
    assert.equal(paused.elapsed.micro, 10);
});

test('idle as long as the break resets that timer, and the shorter ones', () => {
    const worked = run(createState(), 100);
    const afterMicro = run(worked, 1, {idleSeconds: 30});
    assert.equal(afterMicro.elapsed.micro, 0);
    assert.equal(afterMicro.elapsed.rest, 100);
    const afterRest = run(worked, 1, {idleSeconds: 480});
    assert.equal(afterRest.elapsed.micro, 0);
    assert.equal(afterRest.elapsed.rest, 0);
});

test('the daily counter ignores breaks and follows the long-absence rule', () => {
    const worked = run(createState(), 100);
    const lunch = run(worked, 1, {idleSeconds: 3600, dailyIdleResetSeconds: 6 * 3600});
    assert.equal(lunch.elapsed.daily, 100);
    const away = run(worked, 1, {idleSeconds: 6 * 3600, dailyIdleResetSeconds: 6 * 3600});
    assert.equal(away.elapsed.daily, 0);
});

test('the warning arms one lead before the limit and counts down', () => {
    const limit = limitSeconds(MICRO);
    const early = run(createState(), limit - leadSeconds(MICRO) - 1);
    assert.equal(early.reminder, null);
    const armed = run(early, 1);
    assert.deepEqual(
        {stage: armed.reminder.stage, timer: armed.reminder.timer},
        {stage: 'prelude', timer: 'micro'}
    );
    assert.equal(armed.reminder.remaining, leadSeconds(MICRO));
    const ticking = run(armed, 5);
    assert.equal(ticking.reminder.remaining, leadSeconds(MICRO) - 5);
});

test('the warning becomes a break screen, which resets the timer when served', () => {
    const armed = run(createState(), limitSeconds(MICRO));
    assert.equal(armed.reminder.stage, 'break');
    assert.equal(armed.reminder.remaining, MICRO.breakSeconds);
    // No timer accumulates while the break screen is up.
    const middle = run(armed, 10);
    assert.equal(middle.elapsed.rest, limitSeconds(MICRO));
    const done = run(middle, MICRO.breakSeconds - 10);
    assert.equal(done.reminder, null);
    assert.equal(done.elapsed.micro, 0);
    assert.equal(done.elapsed.rest, limitSeconds(MICRO));
});

test('a served rest break also resets the micro timer', () => {
    const state = createState();
    state.elapsed = {micro: 100, rest: limitSeconds(REST), daily: 4000};
    const armed = run(state, 1);
    assert.deepEqual(
        {stage: armed.reminder.stage, timer: armed.reminder.timer},
        {stage: 'break', timer: 'rest'}
    );
    const done = run(armed, REST.breakSeconds);
    assert.equal(done.elapsed.rest, 0);
    assert.equal(done.elapsed.micro, 0);
    // The daily counter is not a break-taking timer: the rest break leaves it
    // alone (it grew by the one working second before the screen came up).
    assert.equal(done.elapsed.daily, 4001);
});

test('going idle during the warning takes the break and drops the reminder', () => {
    const armed = run(createState(), limitSeconds(MICRO) - leadSeconds(MICRO));
    assert.equal(armed.reminder.stage, 'prelude');
    const away = run(armed, 1, {idleSeconds: MICRO.breakSeconds});
    assert.equal(away.reminder, null);
    assert.equal(away.elapsed.micro, 0);
});

test('a break screen that cannot interrupt degrades to the message and retries', () => {
    const armed = run(createState(), limitSeconds(MICRO), {canInterrupt: false});
    assert.equal(armed.reminder.stage, 'due');
    const expired = run(armed, DUE_MESSAGE_SECONDS, {canInterrupt: false});
    assert.equal(expired.reminder, null);
    // Quiet for a minute of activity, then offered again.
    const quiet = run(expired, 59, {canInterrupt: false});
    assert.equal(quiet.reminder, null);
    const retried = run(quiet, 1, {canInterrupt: false});
    assert.equal(retried.reminder.stage, 'due');
});

test('a manual pause silences the reminders while the counters keep running', () => {
    const paused = pauseReminders(createState(), 900, 1000);
    assert.equal(pauseRemainingSeconds(paused, 1000), 900);
    const during = runClock(paused, limitSeconds(MICRO), 1000);
    assert.equal(during.reminder, null);
    assert.equal(during.elapsed.micro, limitSeconds(MICRO));
});

test('the pause takes down a break screen that is already up', () => {
    const armed = run(createState(), limitSeconds(MICRO));
    assert.equal(armed.reminder.stage, 'break');
    assert.equal(pauseReminders(armed, 900, 1000).reminder, null);
});

test('the pause ends by itself and the owed break arrives at once', () => {
    const owed = createState();
    owed.elapsed = {micro: limitSeconds(MICRO), rest: 0, daily: 0};
    const silent = runClock(pauseReminders(owed, 60, 1000), 60, 1000);
    assert.equal(silent.reminder, null);
    assert.equal(silent.pausedUntil, 1060);
    const back = runClock(silent, 1, 1060);
    assert.equal(back.pausedUntil, 0);
    assert.equal(back.reminder.stage, 'break');
});

test('resume ends the pause early', () => {
    const resumed = resumeReminders(pauseReminders(createState(), 3600, 1000));
    assert.equal(pauseRemainingSeconds(resumed, 1000), 0);
});

test('a session inhibitor silences both stages, not just the break screen', () => {
    const kept = run(createState(), limitSeconds(MICRO) + 30, {inhibited: true});
    assert.equal(kept.reminder, null);
    assert.equal(kept.elapsed.micro, limitSeconds(MICRO) + 30);
    // The call is over: the break is owed and offered on the next tick.
    assert.equal(run(kept, 1).reminder.stage, 'break');
});

test('notify mode never opens a break screen', () => {
    const timers = normalizeTimers([{name: 'micro', reminder: 'notify'}]);
    const armed = run(createState(), limitSeconds(timers[0]), {}, timers);
    assert.equal(armed.reminder.stage, 'due');
});

test('the daily limit announces itself when reached, without a break screen', () => {
    const timers = normalizeTimers([
        {name: 'micro', enabled: false},
        {name: 'rest', enabled: false},
        {name: 'daily', workMinutes: 1},
    ]);
    const reached = run(createState(), 60, {}, timers);
    assert.deepEqual(
        {stage: reached.reminder.stage, timer: reached.reminder.timer},
        {stage: 'due', timer: 'daily'}
    );
});

test('postpone keeps the break owed; skip starts the interval over', () => {
    const armed = run(createState(), limitSeconds(MICRO));
    const postponed = postponeReminder(armed, TIMERS);
    assert.equal(postponed.reminder, null);
    assert.equal(postponed.elapsed.micro, limitSeconds(MICRO));
    const stillQuiet = run(postponed, MICRO.postponeMinutes * 60 - 1);
    assert.equal(stillQuiet.reminder, null);
    assert.equal(run(stillQuiet, 1).reminder.stage, 'break');

    const skipped = skipReminder(armed, TIMERS);
    assert.equal(skipped.reminder, null);
    assert.equal(skipped.elapsed.micro, 0);
    assert.equal(skipped.elapsed.rest, limitSeconds(MICRO));
});

test('postpone and skip are refused when the timer forbids them', () => {
    const timers = normalizeTimers([
        {name: 'micro', allowPostpone: false, allowSkip: false},
    ]);
    const armed = run(createState(), limitSeconds(timers[0]), {}, timers);
    assert.equal(postponeReminder(armed, timers), armed);
    assert.equal(skipReminder(armed, timers), armed);
});

test('restore keeps counters within one boot and a short gap', () => {
    const state = createState();
    state.elapsed = {micro: 20, rest: 300, daily: 5000};
    const stored = serializeState(state, {bootId: 'boot-a', now: 1000});
    const context = {bootId: 'boot-a', now: 1010, dailyIdleResetSeconds: 6 * 3600};
    assert.deepEqual(restoreElapsed(stored, TIMERS, context), {
        micro: 20, rest: 300, daily: 5000,
    });
});

test('restore drops what the gap and a reboot invalidate', () => {
    const state = createState();
    state.elapsed = {micro: 20, rest: 300, daily: 5000};
    const stored = serializeState(state, {bootId: 'boot-a', now: 1000});

    const afterLunch = restoreElapsed(stored, TIMERS, {
        bootId: 'boot-a', now: 1000 + 3600, dailyIdleResetSeconds: 6 * 3600,
    });
    assert.deepEqual(afterLunch, {micro: 0, rest: 0, daily: 5000});

    const afterReboot = restoreElapsed(stored, TIMERS, {
        bootId: 'boot-b', now: 1010, dailyIdleResetSeconds: 6 * 3600,
    });
    assert.equal(afterReboot.daily, 0);

    const afterNight = restoreElapsed(stored, TIMERS, {
        bootId: 'boot-a', now: 1000 + 8 * 3600, dailyIdleResetSeconds: 6 * 3600,
    });
    assert.equal(afterNight.daily, 0);
});

test('restore rejects a foreign or damaged store', () => {
    const zero = {micro: 0, rest: 0, daily: 0};
    const context = {bootId: 'boot-a', now: 10, dailyIdleResetSeconds: 0};
    assert.deepEqual(restoreElapsed(null, TIMERS, context), zero);
    assert.deepEqual(restoreElapsed({schema: 99}, TIMERS, context), zero);
    assert.deepEqual(
        restoreElapsed({schema: 1, bootId: 'boot-a', savedAt: 'x'}, TIMERS, context),
        zero
    );
});

test('durations switch to hours once past one', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(452), '7:32');
    assert.equal(formatDuration(28800), '8:00:00');
});
