// Unit tests for the gi-free break-timer logic: activity bookkeeping, the
// reset rules and the reminder state machine.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {formatDuration} from '../extension/duration.js';
import {
    ABSENCE_BURST_SECONDS,
    ACTIVE_IDLE_THRESHOLD_SECONDS,
    AWAY_TOLERANCE_MIN_SECONDS,
    AWAY_TOUCH_SECONDS,
    COVERED_BY_LONGER_BREAK_FRACTION,
    DAY_END_WRAP_UP_SECONDS,
    DEFAULT_DAY_END_MINUTES,
    DEFAULT_PAUSE_MINUTES,
    DUE_MESSAGE_SECONDS,
    advance,
    createState,
    dayAnchor,
    dayEndFraction,
    dayEndRemainingSeconds,
    isDayEndSnoozed,
    isDayOver,
    normalizeDayEnd,
    normalizePauseMinutes,
    leadSeconds,
    limitSeconds,
    normalizeTimers,
    pauseFraction,
    pauseRemainingSeconds,
    pauseReminders,
    overtimeSeconds,
    postponeDayEnd,
    postponeReminder,
    restoreDay,
    restoreElapsed,
    resumeReminders,
    serializeState,
    skipReminder,
    startNewDay,
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
    assert.equal(resumed.pausedFrom, 0);
});

test('the pause fraction counts down from 1 to 0 over the chosen pause', () => {
    const paused = pauseReminders(createState(), 1000, 1000);
    assert.equal(paused.pausedFrom, 1000);
    assert.equal(pauseFraction(paused, 1000), 1);
    assert.equal(pauseFraction(paused, 1250), 0.75);
    assert.equal(pauseFraction(paused, 1900), 0.1);
    assert.equal(pauseFraction(paused, 2000), 0);
});

test('the pause fraction is 0 when nothing is paused, 1 when the start is lost', () => {
    assert.equal(pauseFraction(createState(), 1000), 0);
    // A state file written before `pausedFrom` existed: a full bar still reads
    // as "paused", which is the part that matters.
    const legacy = {...createState(), pausedUntil: 2000, pausedFrom: 0};
    assert.equal(pauseFraction(legacy, 1500), 1);
});

test('the pause start is cleared when the pause runs out', () => {
    const silent = pauseReminders(createState(), 60, 1000);
    const back = runClock(silent, 1, 1060);
    assert.equal(back.pausedUntil, 0);
    assert.equal(back.pausedFrom, 0);
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


// --- Configurable pause lengths ---------------------------------------------

test('the pause menu offers three lengths, 30 min / 1 h / 1:30 by default', () => {
    assert.deepEqual(DEFAULT_PAUSE_MINUTES, [30, 60, 90]);
    assert.deepEqual(normalizePauseMinutes(undefined), [30, 60, 90]);
});

test('configured pause lengths are kept, sorted and clamped', () => {
    assert.deepEqual(normalizePauseMinutes([90, 10, 45]), [10, 45, 90]);
    assert.deepEqual(normalizePauseMinutes([0, 'x', 10000]), [1, 60, 480]);
});

test('a short pause list falls back to the defaults for what is missing', () => {
    assert.deepEqual(normalizePauseMinutes([5]), [5, 60, 90]);
    assert.deepEqual(normalizePauseMinutes('nonsense'), [30, 60, 90]);
});

// --- End of the working day --------------------------------------------------

const DAY_END_OFF = {dayEndAt: 0, now: 1000};

test('the end-of-day limit is off by default and defaults to 21:30', () => {
    const off = normalizeDayEnd({});
    assert.equal(off.enabled, false);
    assert.equal(off.minutes, DEFAULT_DAY_END_MINUTES);
    assert.equal(DEFAULT_DAY_END_MINUTES, 21 * 60 + 30);
});

test('the configured stop-working time is clamped to a day', () => {
    assert.equal(normalizeDayEnd({dayEndMinutes: -5}).minutes, 0);
    assert.equal(normalizeDayEnd({dayEndMinutes: 5000}).minutes, 24 * 60 - 1);
    assert.equal(normalizeDayEnd({dayEndEnabled: true, dayEndMinutes: 90}).enabled, true);
});

test('the working day is over once the deadline passes, never when it is off', () => {
    assert.equal(isDayOver({dayEndAt: 2000, now: 1999}), false);
    assert.equal(isDayOver({dayEndAt: 2000, now: 2000}), true);
    assert.equal(isDayOver(DAY_END_OFF), false);
    assert.equal(dayEndRemainingSeconds({dayEndAt: 2000, now: 1400}), 600);
    assert.equal(dayEndRemainingSeconds({dayEndAt: 2000, now: 2500}), 0);
    assert.equal(dayEndRemainingSeconds(DAY_END_OFF), 0);
});

test('today\'s work starts at the first activity, and the day bar fills from it', () => {
    const worked = run(createState(), 10, {now: 1000, dayEndAt: 3000});
    assert.equal(worked.dayStartedAt, 1000);
    // Ten seconds of a 2000-second working day.
    assert.equal(
        Math.round(dayEndFraction(worked, {dayEndAt: 3000, now: 1010}) * 1000) / 1000,
        0.005
    );
    assert.equal(dayEndFraction(worked, {dayEndAt: 3000, now: 3000}), 1);
});

test('before the first activity there is nothing to fill from', () => {
    assert.equal(dayEndFraction(createState(), {dayEndAt: 3000, now: 2000}), 0);
    assert.equal(dayEndFraction(createState(), DAY_END_OFF), 0);
});

test('the deadline raises the daily reminder even with hours left on the counter', () => {
    const state = run(createState(), 60, {now: 1000, dayEndAt: 2000});
    assert.equal(state.reminder, null);
    const over = run(state, 1, {now: 2000, dayEndAt: 2000});
    assert.equal(over.reminder.timer, 'daily');
    assert.equal(over.reminder.reason, 'day-end');
    assert.equal(over.reminder.stage, 'due');
    // The counter is nowhere near its own limit; the clock alone did this.
    assert.ok(over.elapsed.daily < limitSeconds(TIMERS[2]));
});

test('with the limit off the clock says nothing', () => {
    const state = run(createState(), 60, {now: 5000, dayEndAt: 0});
    assert.equal(state.reminder, null);
});

test('a new working day clears the previous day start', () => {
    const worked = run(createState(), 5, {now: 1000, dayEndAt: 9000});
    assert.equal(worked.dayStartedAt, 1000);
    // A long absence ends the working day (the daily reset rule).
    const away = run(worked, 1, {
        now: 40000,
        idleSeconds: 7 * 3600,
        dailyIdleResetSeconds: 6 * 3600,
        dayEndAt: 9000,
    });
    assert.equal(away.elapsed.daily, 0);
    assert.equal(away.dayStartedAt, 0);
});


// --- The end-of-day window: it stays until it is answered -------------------

const DAILY = TIMERS[2];

test('the end-of-day window does not expire the way a break message does', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    assert.equal(over.reminder.reason, 'day-end');
    // No countdown at all: the field that makes every other message leave.
    assert.equal(over.reminder.remaining, 0);
    // Far longer than DUE_MESSAGE_SECONDS, and still there.
    const later = runClock(over, DUE_MESSAGE_SECONDS * 4, 2001, {dayEndAt: 2000});
    assert.equal(later.reminder?.reason, 'day-end');
});

test('postponing the end of the day silences it for exactly that long', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    const snoozed = postponeDayEnd(over, 2000 + DAY_END_WRAP_UP_SECONDS);
    assert.equal(snoozed.reminder, null);
    assert.equal(isDayEndSnoozed(snoozed, 2500), true);

    // Quiet for the whole ten minutes...
    const during = runClock(snoozed, 60, 2100, {dayEndAt: 2000});
    assert.equal(during.reminder, null);
    // ...and back the second they are up.
    const after = run(during, 1, {now: 2000 + DAY_END_WRAP_UP_SECONDS, dayEndAt: 2000});
    assert.equal(after.reminder?.reason, 'day-end');
});

test('postponing waits out wall-clock time, not time at the keyboard', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    const snoozed = postponeDayEnd(over, 2600);
    // Away from the machine for the whole postponement: no activity accrues,
    // so an activity-based quiet period would never end. This one does.
    const back = run(snoozed, 1, {now: 2600, idleSeconds: 600, dayEndAt: 2000});
    assert.equal(back.reminder?.reason, 'day-end');
});

test('postponing never moves the configured end of the working day', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    const snoozed = postponeDayEnd(over, 9999);
    // The only thing that changed is tonight's snooze; dayEndAt is an input,
    // computed by the widget from the setting, and nothing here writes it.
    assert.equal(snoozed.dayEndSnoozedUntil, 9999);
    assert.deepEqual(Object.keys(snoozed).sort(), Object.keys(over).sort());
});

test('a shared or fullscreen screen holds the window back without answering it', () => {
    const busy = run(createState(), 5, {now: 2000, dayEndAt: 2000, canInterrupt: false});
    assert.equal(busy.reminder, null);
    // Nothing was marked as said, so it arrives the moment the screen is free.
    const free = run(busy, 1, {now: 2100, dayEndAt: 2000});
    assert.equal(free.reminder?.reason, 'day-end');
});

test('a window already up comes down when the screen stops being the user\'s own', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    assert.equal(over.reminder.reason, 'day-end');
    const shared = run(over, 1, {now: 2001, dayEndAt: 2000, canInterrupt: false});
    assert.equal(shared.reminder, null);
    assert.equal(isDayEndSnoozed(shared, 2001), false);
});

test('a pause and a session inhibitor silence it too', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    const inhibited = run(over, 1, {now: 2001, dayEndAt: 2000, inhibited: true});
    assert.equal(inhibited.reminder, null);
    const paused = run(pauseReminders(over, 1800, 2000), 1, {now: 2001, dayEndAt: 2000});
    assert.equal(paused.reminder, null);
});

test('a new working day forgets yesterday\'s postponement', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    const snoozed = postponeDayEnd(over, 99999);
    const away = run(snoozed, 1, {
        now: 40000,
        idleSeconds: 7 * 3600,
        dailyIdleResetSeconds: 6 * 3600,
        dayEndAt: 2000,
    });
    assert.equal(away.dayEndSnoozedUntil, 0);
    assert.equal(isDayEndSnoozed(away, 40000), false);
});

test('overtime is what the window has to argue with', () => {
    const inside = run(createState(), 60, {now: 1000, dayEndAt: 0});
    assert.equal(overtimeSeconds(inside, TIMERS), 0);
    const over = {...inside, elapsed: {...inside.elapsed, daily: limitSeconds(DAILY) + 2700}};
    assert.equal(overtimeSeconds(over, TIMERS), 2700);
    assert.equal(formatDuration(overtimeSeconds(over, TIMERS)), '45:00');
});



// --- The evening: one window, and only one -----------------------------------

// The daily counter already past its limit when the clock ends the day — the
// combination the evening bug (gwp-344) needed and no test had.
function overLimitAtDayEnd() {
    const state = createState();
    state.elapsed = {micro: 0, rest: 0, daily: limitSeconds(DAILY) + 600};
    state.dayStartedAt = 100;
    return run(state, 1, {now: 2000, dayEndAt: 2000});
}

test('B1: past the limit, the day-end window wins and postponing it raises nothing else', () => {
    const over = overLimitAtDayEnd();
    assert.equal(over.reminder?.reason, 'day-end');
    const postponed = postponeDayEnd(over, 2000 + 3600);
    assert.equal(postponed.reminder, null);
    // Still at the keyboard, the counter still past its limit: neither the
    // window nor the plain "limit reached" message comes while it is put off.
    const next = run(postponed, 1, {now: 2001, dayEndAt: 2000});
    assert.equal(next.reminder, null);
    const later = runClock(postponed, 120, 2001, {dayEndAt: 2000});
    assert.equal(later.reminder, null);
});

test('B2: the window returns by the wall clock, even after an hour mostly away', () => {
    const postponed = postponeDayEnd(overLimitAtDayEnd(), 2000 + 3600);
    // A minute of work, then the rest of the hour away from the keyboard: the
    // activity seconds hardly move, the clock does.
    const worked = runClock(postponed, 60, 2001, {dayEndAt: 2000});
    const away = run(worked, 1, {now: 2000 + 3599, idleSeconds: 3500, dayEndAt: 2000});
    assert.equal(away.reminder, null);
    const back = run(away, 1, {now: 2000 + 3600, idleSeconds: 3501, dayEndAt: 2000});
    assert.equal(back.reminder?.reason, 'day-end');
});

test('a "limit reached" message still up when the day ends gives way to the window', () => {
    const state = createState();
    state.elapsed = {micro: 0, rest: 0, daily: limitSeconds(DAILY)};
    const limit = run(state, 1, {now: 1000, dayEndAt: 2000});
    assert.equal(limit.reminder?.timer, 'daily');
    assert.equal(limit.reminder?.reason, undefined);
    const evening = run(limit, 1, {now: 2000, dayEndAt: 2000});
    assert.equal(evening.reminder?.reason, 'day-end');
});

test('before the day ends, the limit message keeps its hourly quiet period', () => {
    const state = createState();
    state.elapsed = {micro: 0, rest: 0, daily: limitSeconds(DAILY)};
    const shown = run(state, 1, {now: 1000, dayEndAt: 99999});
    assert.equal(shown.reminder?.stage, 'due');
    const quiet = run(shown, DUE_MESSAGE_SECONDS + 5, {now: 1000, dayEndAt: 99999});
    assert.equal(quiet.reminder, null);
});


// --- The long absence across sporadic night input ---------------------------

const NINE_HOURS = 9 * 3600;

// Away for `seconds`: Mutter's idle reading grows by one every tick.
function idleFor(state, seconds, reset = NINE_HOURS) {
    let next = state;
    for (let i = 1; i <= seconds; i++)
        next = run(next, 1, {idleSeconds: i, dailyIdleResetSeconds: reset});
    return next;
}

// At the keyboard for `seconds`.
function workFor(state, seconds, reset = NINE_HOURS) {
    return run(state, seconds, {idleSeconds: 0, dailyIdleResetSeconds: reset});
}

test('A1: a night of idle stretches broken by brief touches ends the day by morning', () => {
    let night = workFor(createState(), 600);
    assert.equal(night.elapsed.daily, 600);
    // 2.5 h, a 30 s touch, 3 h, a 1 s bump, 2 h, a minute, 2 h: 9.5 h away,
    // never more than 3 h at a stretch.
    for (const [idle, touch] of [[9000, 30], [10800, 1], [7200, 60]]) {
        night = idleFor(night, idle);
        assert.ok(night.elapsed.daily > 0, 'not yet');
        night = workFor(night, touch);
    }
    night = idleFor(night, 7200);
    assert.equal(night.elapsed.daily, 0);
    assert.equal(night.dayStartedAt, 0);
});

test('the reset fires once: the first minutes of the morning are counted', () => {
    let night = workFor(createState(), 600);
    night = idleFor(night, NINE_HOURS + 600);
    assert.equal(night.elapsed.daily, 0);
    // Held until the burst proves a return (over ABSENCE_BURST_SECONDS), then
    // released: none of the morning is lost.
    const morning = workFor(night, ABSENCE_BURST_SECONDS + 100);
    assert.equal(morning.elapsed.daily, ABSENCE_BURST_SECONDS + 100);
});

test('a burst of input longer than the limit restarts the absence count', () => {
    let day = workFor(createState(), 600);
    day = idleFor(day, 5 * 3600);
    day = workFor(day, ABSENCE_BURST_SECONDS + 60);
    day = idleFor(day, 5 * 3600);
    assert.ok(day.elapsed.daily > 0, 'ten hours away, but split by real work');

    let night = workFor(createState(), 600);
    night = idleFor(night, 5 * 3600);
    night = workFor(night, ABSENCE_BURST_SECONDS - 60);
    night = idleFor(night, 5 * 3600);
    assert.equal(night.elapsed.daily, 0, 'a shorter burst does not');
});

test('lunch-length idle between work never adds up to a new day', () => {
    let day = workFor(createState(), 600);
    for (let i = 0; i < 8; i++) {
        day = idleFor(day, 3600);
        day = workFor(day, 1800);
    }
    assert.ok(day.elapsed.daily > 0);
});

test('Start a new day zeroes the counter, the day start and tonight\'s answer', () => {
    const over = overLimitAtDayEnd();
    const postponed = postponeDayEnd(over, 99999);
    const fresh = startNewDay(postponed, {now: 2100, todayDayEndAt: 0, tomorrowAt: 0});
    assert.equal(fresh.elapsed.daily, 0);
    assert.equal(fresh.dayStartedAt, 0);
    assert.equal(fresh.dayEndSnoozedUntil, 0);
    assert.equal(fresh.quietUntil.daily, undefined);
    assert.equal(fresh.absence.idleSeconds, 0);
    // Only the day: the break timers are not touched.
    const worked = run(createState(), 50);
    assert.equal(startNewDay(worked, {now: 0, todayDayEndAt: 0, tomorrowAt: 0}).elapsed.micro, 50);
    // A daily reminder on screen goes with it.
    const limit = createState();
    limit.elapsed = {micro: 0, rest: 0, daily: limitSeconds(DAILY)};
    assert.equal(startNewDay(run(limit, 1), {now: 0, todayDayEndAt: 0, tomorrowAt: 0}).reminder, null);
});


// --- The working day survives a rebuild of the widget ------------------------

test('the day start and tonight\'s postponement round-trip through the store', () => {
    const state = createState();
    state.elapsed = {micro: 0, rest: 0, daily: 5000};
    state.dayStartedAt = 900;
    state.dayEndSnoozedUntil = 5000;
    const stored = JSON.parse(JSON.stringify(
        serializeState(state, {bootId: 'boot-a', now: 1000})
    ));
    const context = {bootId: 'boot-a', now: 1010, dailyIdleResetSeconds: 6 * 3600};
    assert.deepEqual(restoreDay(stored, context), {
        dayStartedAt: 900, dayEndSnoozedUntil: 5000, dayAnchorAt: 0, absence: {idleSeconds: 0, away: false}, reset: null,
    });
});

test('the stored day follows the daily counter: a reboot or a long gap drops it', () => {
    const state = createState();
    state.elapsed = {micro: 0, rest: 0, daily: 5000};
    state.dayStartedAt = 900;
    state.dayEndSnoozedUntil = 5000;
    const stored = serializeState(state, {bootId: 'boot-a', now: 1000});
    assert.deepEqual(
        restoreDay(stored, {bootId: 'boot-b', now: 1010, dailyIdleResetSeconds: 6 * 3600}),
        {dayStartedAt: 0, dayEndSnoozedUntil: 0, dayAnchorAt: 0, absence: {idleSeconds: 0, away: false}, reset: 'boot'}
    );
    assert.deepEqual(
        restoreDay(stored, {bootId: 'boot-a', now: 1000 + 7 * 3600, dailyIdleResetSeconds: 6 * 3600}),
        {dayStartedAt: 0, dayEndSnoozedUntil: 0, dayAnchorAt: 0, absence: {idleSeconds: 0, away: false}, reset: 'absence'}
    );
    // Nothing had begun: nothing to report.
    const empty = serializeState(createState(), {bootId: 'boot-a', now: 1000});
    assert.equal(
        restoreDay(empty, {bootId: 'boot-b', now: 1010, dailyIdleResetSeconds: 0}).reset,
        null
    );
});

test('a store written before the day fields existed still loads', () => {
    const old = {schema: 1, bootId: 'boot-a', savedAt: 1000, elapsed: {micro: 0, rest: 0, daily: 4000}};
    const context = {bootId: 'boot-a', now: 1010, dailyIdleResetSeconds: 6 * 3600};
    assert.equal(restoreElapsed(old, TIMERS, context).daily, 4000);
    assert.deepEqual(restoreDay(old, context), {
        dayStartedAt: 0, dayEndSnoozedUntil: 0, dayAnchorAt: 0, absence: {idleSeconds: 0, away: false}, reset: null,
    });
    assert.deepEqual(restoreDay(null, context), {
        dayStartedAt: 0, dayEndSnoozedUntil: 0, dayAnchorAt: 0, absence: {idleSeconds: 0, away: false}, reset: null,
    });
});



// --- "Start a new day" late in the evening belongs to tomorrow --------------

// A UTC calendar standing in for the widget's local one: the "stop working"
// time is 21:30 on the date of the anchor, as _dayEndAt() computes it, and
// tomorrow is named by its noon, as _calendar() does.
const DAY = 86400;
const DAY_END = 21 * 3600 + 1800;
function dayEndOn(anchor, end = DAY_END) {
    return Math.floor(anchor / DAY) * DAY + end;
}
function calendar(now, end = DAY_END) {
    return {todayDayEndAt: dayEndOn(now, end), tomorrowAt: (Math.floor(now / DAY) + 1) * DAY + 12 * 3600};
}
const DAILY_ONLY = normalizeTimers([
    {name: 'micro', enabled: false},
    {name: 'rest', enabled: false},
]);
// One tick the way the widget runs it: the deadline follows the state's anchor.
function tickAt(state, now, extra = {}) {
    return run(state, 1, {
        now,
        dayEndAt: dayEndOn(dayAnchor(state, now)),
        ...calendar(now),
        ...extra,
    }, DAILY_ONLY);
}

test('a new day started at 23:00 keeps tonight quiet and ends tomorrow evening', () => {
    const today = 10 * DAY;
    const pressAt = today + 23 * 3600;
    const evening = tickAt(overLimitAtDayEnd(), pressAt);
    assert.equal(evening.reminder?.reason, 'day-end');
    const fresh = startNewDay(evening, {now: pressAt, ...calendar(pressAt)});
    assert.equal(fresh.dayReset, 'manual');
    let night = fresh;
    for (let now = pressAt + 1; now <= pressAt + 600; now++)
        night = tickAt(night, now);
    assert.equal(night.reminder, null, 'still at the keyboard, no window that night');
    assert.equal(night.dayStartedAt, pressAt + 1);
    const tomorrowEnd = today + DAY + DAY_END;
    assert.equal(tickAt(night, tomorrowEnd - 1).reminder, null);
    assert.equal(tickAt(night, tomorrowEnd).reminder?.reason, 'day-end');
});

test('a new day started before today\'s end keeps today', () => {
    for (const pressAt of [10 * DAY + 8 * 3600, 10 * DAY + 1800]) {
        const fresh = startNewDay(createState(), {now: pressAt, ...calendar(pressAt)});
        assert.equal(fresh.dayAnchorAt, 0);
        assert.equal(dayEndOn(dayAnchor(fresh, pressAt)), 10 * DAY + DAY_END);
    }
});

test('a day end before noon still moves a late new day to the next date', () => {
    const end = 9 * 3600;
    const pressAt = 10 * DAY + 10 * 3600;
    const fresh = startNewDay(createState(), {now: pressAt, ...calendar(pressAt, end)});
    assert.equal(dayEndOn(dayAnchor(fresh, pressAt), end), 11 * DAY + end);
});

test('an automatic reset before today\'s end anchors to the first activity', () => {
    const chosen = startNewDay(createState(), {now: 10 * DAY + 23 * 3600, ...calendar(10 * DAY + 23 * 3600)});
    assert.ok(chosen.dayAnchorAt > 0);
    const at = 11 * DAY + 3600;
    const away = run(chosen, 1, {now: at, idleSeconds: 7 * 3600, dailyIdleResetSeconds: 6 * 3600, ...calendar(at)});
    assert.equal(away.dayAnchorAt, 0);
    assert.equal(dayAnchor(away, at), at);
});


// --- Review findings (gwp-344) -----------------------------------------------

test('reset at 23:00 and a stray touch at 23:30 still leave a normal morning', () => {
    const today = 10 * DAY;
    let s = createState();
    for (let now = today + 14 * 3600 - 60; now < today + 14 * 3600; now++)
        s = tickAt(s, now, {dailyIdleResetSeconds: NINE_HOURS});
    let idle = 0;
    let resetSeen = null;
    for (let now = today + 14 * 3600; now < today + 31.5 * 3600; now++) {
        idle = now === today + 23.5 * 3600 ? 0 : idle + 1;
        s = tickAt(s, now, {idleSeconds: idle, dailyIdleResetSeconds: NINE_HOURS, canInterrupt: false});
        resetSeen ??= s.dayReset;
    }
    assert.equal(resetSeen, 'absence');
    assert.equal(s.dayStartedAt, 0, 'the touch did not start a day');
    assert.equal(s.elapsed.daily, 0, 'nor count towards one');
    const morning = today + 31.5 * 3600;
    for (let now = morning; now < morning + 3600; now++)
        s = tickAt(s, now, {dailyIdleResetSeconds: NINE_HOURS});
    const at = morning + 3600;
    assert.equal(s.reminder, null);
    assert.equal(s.dayStartedAt, morning);
    assert.equal(s.elapsed.daily, 3600);
    assert.ok(dayEndFraction(s, {dayEndAt: dayEndOn(dayAnchor(s, at)), now: at}) < 0.2);
});

test('a day-end window is withdrawn once the day is no longer over', () => {
    const over = run(createState(), 1, {now: 2000, dayEndAt: 2000});
    assert.equal(over.reminder?.reason, 'day-end');
    assert.equal(run(over, 1, {now: 2001, dayEndAt: 0}).reminder, null, 'switched off');
    assert.equal(run(over, 1, {now: 2001, dayEndAt: 5000}).reminder, null, 'moved later');
});

test('a day of input every 5 min 1 s (a training video) never ends the day', () => {
    let day = workFor(createState(), 600);
    for (let elapsed = 0; elapsed < 10 * 3600; elapsed += 302) {
        day = idleFor(day, 301);
        day = workFor(day, 1);
    }
    // The 1-s inputs are tolerated touches (round 3): no work, and no reset.
    assert.ok(day.elapsed.daily >= 600);
    assert.equal(day.dayReset, null);
});

test('a suspend as long as a night ends the day', () => {
    const worked = workFor(createState(), 600);
    const resumed = run(worked, 1, {idleSeconds: 0, dailyIdleResetSeconds: NINE_HOURS, sleptSeconds: 10 * 3600});
    assert.equal(resumed.elapsed.daily, 0);
    assert.equal(resumed.dayReset, 'absence');
    // An idle reading that kept growing through the suspend is not counted twice.
    const both = run(idleFor(worked, 3600), 1, {
        idleSeconds: 3600 + 4 * 3600, dailyIdleResetSeconds: NINE_HOURS, sleptSeconds: 4 * 3600,
    });
    assert.ok(both.elapsed.daily > 0);
});

test('only an actual reset is reported, with its own reason', () => {
    const worked = workFor(createState(), 600);
    assert.equal(idleFor(worked, NINE_HOURS - 1).dayReset, null, 'the tick before');
    const reset = run(idleFor(worked, NINE_HOURS - 1), 1, {idleSeconds: NINE_HOURS, dailyIdleResetSeconds: NINE_HOURS});
    assert.equal(reset.dayReset, 'absence');
    assert.equal(run(reset, 1, {idleSeconds: NINE_HOURS + 1, dailyIdleResetSeconds: NINE_HOURS}).dayReset, null,
        'nothing left to reset');
    const ownBreak = normalizeTimers([{name: 'daily', breakSeconds: 3600}]);
    const broke = run(run(createState(), 10, {}, ownBreak), 1, {idleSeconds: 3600}, ownBreak);
    assert.equal(broke.dayReset, 'break');
});


test('two night touches eight minutes apart are two bursts, not a return', () => {
    // Left at 18:00; touches at 01:00 and 01:08; 9 h of absence ends the day
    // a little after 03:00 (7 h before the touches, 2 h after).
    let s = workFor(createState(), 600);
    let idle = 0;
    let resetAt = null;
    for (let t = 0; t < 10 * 3600; t++) {
        const clock = 18 * 3600 + t;
        idle = clock === 25 * 3600 || clock === 25 * 3600 + 480 ? 0 : idle + 1;
        s = run(s, 1, {idleSeconds: idle, dailyIdleResetSeconds: NINE_HOURS});
        if (s.dayReset && resetAt === null)
            resetAt = clock;
    }
    assert.ok(resetAt !== null, 'the day ended by morning');
    assert.ok(resetAt > 27 * 3600 && resetAt < 27.5 * 3600, `reset near 03:00, got ${resetAt / 3600} h`);
});

test('six minutes of continuous work after an absence is a return', () => {
    let s = workFor(createState(), 600);
    s = idleFor(s, 3 * 3600);
    s = workFor(s, 6 * 60);
    assert.equal(s.absence.away, false);
    assert.equal(s.absence.idleSeconds, 0);
    assert.equal(s.elapsed.daily, 600 + 6 * 60);
});

test('the absence count survives a rebuild in the night', () => {
    let s = workFor(createState(), 600);
    s = idleFor(s, 4 * 3600);
    assert.equal(s.absence.idleSeconds, 4 * 3600);
    const stored = JSON.parse(JSON.stringify(serializeState(s, {bootId: 'boot-a', now: 1000})));
    const context = {bootId: 'boot-a', now: 1010, dailyIdleResetSeconds: NINE_HOURS};
    // The ten seconds since the save are more of the same stretch.
    assert.deepEqual(restoreDay(stored, context).absence, {idleSeconds: 4 * 3600 + 10, away: true});
    // A gap long enough to be a stretch adds on, and may complete the absence.
    const later = {...context, now: 1000 + 3600};
    assert.equal(restoreDay(stored, later).absence.idleSeconds, 5 * 3600);
    const morning = {...context, now: 1000 + 5 * 3600};
    assert.equal(restoreDay(stored, morning).reset, 'absence');
    assert.equal(restoreElapsed(stored, TIMERS, morning).daily, 0);
});


test('a day that ended while locked starts on tomorrow when restored after the day end', () => {
    // Locked 13:00, unlocked 22:30 (9.5 h, past the 9 h threshold): the panel
    // is rebuilt and the restore sees the reset.
    const today = 10 * DAY;
    const worked = createState();
    worked.elapsed = {micro: 0, rest: 0, daily: 4 * 3600};
    worked.dayStartedAt = today + 9 * 3600;
    const atLock = serializeState(worked, {bootId: 'boot-a', now: today + 13 * 3600});
    const unlock = today + 22.5 * 3600;
    const day = restoreDay(atLock, {
        bootId: 'boot-a', now: unlock, dailyIdleResetSeconds: NINE_HOURS, ...calendar(unlock),
    });
    assert.equal(day.reset, 'absence');
    let s = {...createState(), ...day, absence: {...createState().absence, ...day.absence}};
    assert.equal(dayEndOn(dayAnchor(s, unlock)), today + DAY + DAY_END, 'the new day is tomorrow');
    for (let now = unlock; now < unlock + 900; now++)
        s = tickAt(s, now, {dailyIdleResetSeconds: NINE_HOURS});
    assert.equal(s.reminder, null, 'no window at 22:30');

    // Locked again 22:45, unlocked 07:00 (8.25 h, under the threshold): the day
    // goes on, still tomorrow's — no window all morning.
    const relock = unlock + 900;
    const stored = serializeState(s, {bootId: 'boot-a', now: relock});
    const morning = today + DAY + 7 * 3600;
    const kept = restoreDay(stored, {
        bootId: 'boot-a', now: morning, dailyIdleResetSeconds: NINE_HOURS, ...calendar(morning),
    });
    assert.equal(kept.reset, null);
    let m = {...createState(), ...kept, absence: {...createState().absence, ...kept.absence}};
    m.elapsed = restoreElapsed(stored, DAILY_ONLY, {bootId: 'boot-a', now: morning, dailyIdleResetSeconds: NINE_HOURS});
    m = tickAt(m, morning, {dailyIdleResetSeconds: NINE_HOURS});
    assert.equal(m.reminder, null);
    assert.equal(isDayOver({dayEndAt: dayEndOn(dayAnchor(m, morning)), now: morning}), false);
});

test('a widget made mid-stretch counts the stretch from there on', () => {
    const fresh = createState(3 * 3600);
    const next = run(fresh, 1, {idleSeconds: 3 * 3600 + 1, dailyIdleResetSeconds: NINE_HOURS});
    assert.equal(next.absence.idleSeconds, 1);
});


// --- Round 2: being away resets a timer, however the absence is seen ---------

const USER_TIMERS = normalizeTimers([
    {name: 'micro', workMinutes: 10, breakSeconds: 30},
    {name: 'rest', workMinutes: 50, breakSeconds: 480},
]);

test('locked minutes into an absence: the idle before the lock counts too', () => {
    // Rest one minute short of due; away 5 min, then the screen locks (the
    // panel is destroyed and saves), unlocked 6 min later: 11 min away.
    let s = createState();
    s.elapsed = {micro: 300, rest: 50 * 60 - 60, daily: 3000};
    for (let i = ACTIVE_IDLE_THRESHOLD_SECONDS; i <= 300; i++)
        s = run(s, 1, {idleSeconds: i}, USER_TIMERS);
    assert.equal(s.elapsed.rest, 50 * 60 - 60, 'five minutes is not yet the 8-minute break');
    const stored = serializeState(s, {bootId: 'boot-a', now: 1000});
    const restored = restoreElapsed(stored, USER_TIMERS, {
        bootId: 'boot-a', now: 1000 + 360, dailyIdleResetSeconds: NINE_HOURS,
    });
    assert.equal(restored.rest, 0, 'eleven minutes away took the rest break');
    assert.equal(restored.micro, 0);
    assert.equal(restored.daily, 3000);
});

test('a short lock still keeps the counters', () => {
    const s = createState();
    s.elapsed = {micro: 300, rest: 1200, daily: 3000};
    const stored = serializeState(s, {bootId: 'boot-a', now: 1000});
    const restored = restoreElapsed(stored, USER_TIMERS, {
        bootId: 'boot-a', now: 1020, dailyIdleResetSeconds: NINE_HOURS,
    });
    assert.deepEqual(restored, {micro: 300, rest: 1200, daily: 3000});
});

test('a suspend longer than a break takes it', () => {
    const s = createState();
    s.elapsed = {micro: 300, rest: 1200, daily: 3000};
    const resumed = run(s, 1, {idleSeconds: 0, sleptSeconds: 600}, USER_TIMERS);
    assert.equal(resumed.elapsed.rest, 0);
    assert.equal(resumed.elapsed.micro, 0);
    // Idle before the suspend adds to the time asleep.
    let before = createState();
    before.elapsed = {micro: 300, rest: 1200, daily: 3000};
    for (let i = 1; i <= 200; i++)
        before = run(before, 1, {idleSeconds: i}, USER_TIMERS);
    const later = run(before, 1, {idleSeconds: 0, sleptSeconds: 300}, USER_TIMERS);
    assert.equal(later.elapsed.rest, 0, '200 s idle + 300 s asleep is a rest break');
    const short = run(createState(), 1, {idleSeconds: 0, sleptSeconds: 60}, USER_TIMERS);
    assert.equal(short.elapsed.micro, 0, 'a minute asleep is a micro break');
});

test('a micro break due with the rest break 5 min off is settled silently', () => {
    const s = createState();
    s.elapsed = {micro: 600, rest: 50 * 60 - 300, daily: 3000};
    const next = run(s, 1, {}, USER_TIMERS);
    assert.equal(next.reminder, null);
    assert.equal(next.elapsed.micro, 0, 'reset as if taken');
    assert.equal(COVERED_BY_LONGER_BREAK_FRACTION, 2 / 3);
});

test('a micro break due with the rest break 8 min off is offered', () => {
    const s = createState();
    s.elapsed = {micro: 600, rest: 50 * 60 - 480, daily: 3000};
    const next = run(s, 1, {}, USER_TIMERS);
    assert.equal(next.reminder?.timer, 'micro');
});

test('the rest break settles the micro break when taken', () => {
    const s = createState();
    s.elapsed = {micro: 400, rest: 50 * 60, daily: 3000};
    const armed = run(s, 1, {}, USER_TIMERS);
    assert.equal(armed.reminder?.timer, 'rest');
    let s2 = armed;
    while (s2.reminder?.timer === 'rest')
        s2 = run(s2, 1, {}, USER_TIMERS);
    assert.equal(s2.elapsed.rest, 0);
    assert.equal(s2.elapsed.micro, 0, 'the micro timer starts over with it');
});

test('past the daily limit, micro and rest breaks are still offered', () => {
    const timers = normalizeTimers([
        {name: 'micro', workMinutes: 10, breakSeconds: 30},
        {name: 'rest', workMinutes: 50, breakSeconds: 480},
        {name: 'daily', breakSeconds: 3600},
    ]);
    const s = createState();
    s.elapsed = {micro: 600, rest: 600, daily: 10 * 3600};
    s.quietUntil = {daily: 99 * 3600};
    assert.equal(run(s, 1, {}, timers).reminder?.timer, 'micro');
    const rest = createState();
    rest.elapsed = {micro: 0, rest: 50 * 60, daily: 10 * 3600};
    rest.quietUntil = {daily: 99 * 3600};
    assert.equal(run(rest, 1, {}, timers).reminder?.timer, 'rest');
});

test('a rest break postponed again and again does not silence the micro breaks', () => {
    let s = createState();
    s.elapsed = {micro: 0, rest: 50 * 60, daily: 3000};
    let microOffers = 0;
    for (let t = 0; t < 40 * 60; t++) {
        s = run(s, 1, {}, USER_TIMERS);
        if (s.reminder?.timer === 'rest')
            s = postponeReminder(s, USER_TIMERS);
        else if (s.reminder?.timer === 'micro') {
            microOffers++;
            s = skipReminder(s, USER_TIMERS);
        }
    }
    assert.ok(microOffers >= 3, `micro offered ${microOffers} times in 40 min`);
});


// --- Round 3: a brief touch does not end an away stretch ---------------------

// Feed idle readings tick by tick: `away(n)` is n seconds idle (the reading
// grows from 1), `touch(n)` n seconds of input (reading 0).
const away = n => Array.from({length: n}, (_, i) => i + 1);
const touch = n => Array(n).fill(0);
function feed(state, readings, timers = USER_TIMERS) {
    let next = state;
    const reports = [];
    for (const idleSeconds of readings) {
        next = run(next, 1, {idleSeconds}, timers);
        if (next.awayReport)
            reports.push(next.awayReport);
    }
    return {state: next, reports};
}
function owed() {
    const s = createState();
    s.elapsed = {micro: 300, rest: 2400, daily: 3000};
    return s;
}

const timesFor = (seconds, every, input) => {
    const readings = [];
    while (readings.length < seconds)
        readings.push(...touch(input), ...away(every - input));
    return readings.slice(0, seconds);
};

test('away 10 min with a 2-second touch at minute four: the rest break is taken', () => {
    const {state, reports} = feed(owed(), [...away(240), ...touch(2), ...away(358)]);
    assert.equal(state.elapsed.rest, 0);
    assert.equal(state.elapsed.daily, 3004, 'the touch was not work');
    assert.deepEqual(reports, []);
    const back = feed(state, touch(10)).reports;
    assert.equal(back.length, 1);
    assert.equal(back[0].touches, 1);
    assert.equal(back[0].touchSeconds, 2);
    assert.ok(back[0].awaySeconds >= 600);
});

test('two touches three minutes apart in a 12-minute absence are both tolerated', () => {
    const {state, reports} = feed(owed(), [
        ...away(240), ...touch(1), ...away(179), ...touch(2), ...away(298), ...touch(8),
    ]);
    assert.equal(state.elapsed.rest > 0 && state.elapsed.rest < 20, true, 'taken, then counting again');
    assert.equal(reports.length, 1, 'one line for the whole stretch');
    assert.deepEqual({touches: reports[0].touches, touchSeconds: reports[0].touchSeconds},
        {touches: 2, touchSeconds: 3});
    assert.ok(reports[0].inputSeconds > AWAY_TOUCH_SECONDS);
});

test('reading after a pause is not away: a scroll every 20 s', () => {
    for (const pause of [70, 130]) {
        const plain = feed(owed(), timesFor(20 * 60, 20, 1));
        const {state, reports} = feed(owed(), [...away(pause), ...timesFor(20 * 60, 20, 1)]);
        assert.ok(state.elapsed.rest > 2400, `${pause} s pause: rest not taken`);
        assert.ok(state.elapsed.daily >= plain.state.elapsed.daily - 10,
            `${pause} s pause: the reading still counts as work`);
        assert.ok(reports.length <= 1, `${pause} s pause: ${reports.length} log lines`);
    }
});

test('browsing with a 2-second click every 8 s or a scroll every 61 s is not away', () => {
    const clicks = feed(owed(), [...away(150), ...timesFor(20 * 60, 8, 2)]);
    assert.ok(clicks.state.elapsed.rest > 2400);
    assert.ok(clicks.reports.length <= 1);
    const scrolls = feed(owed(), timesFor(20 * 60, 61, 1));
    assert.ok(scrolls.state.elapsed.rest > 2400, 'never away');
    assert.equal(scrolls.reports.length, 0, 'and nothing to report');
});

test('ten seconds of input at minute three ends the stretch', () => {
    const {state, reports} = feed(owed(), [...away(180), ...touch(10), ...away(300)]);
    assert.ok(state.elapsed.rest > 2400, 'the rest break starts over after the input');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].touches, 0);
    assert.equal(reports[0].awaySeconds, 180);
    assert.ok(state.elapsed.daily >= 3010, 'and the input counted as work');
});

test('a touch before two minutes away ends the stretch as before', () => {
    const {state, reports} = feed(owed(), [...away(20), ...touch(2), ...away(20)]);
    assert.ok(state.elapsed.micro > 0, '20 + 20 s is not a 30-second micro break');
    assert.deepEqual(reports, [], 'and nothing to report under two minutes');
    assert.equal(feed(state, away(30)).state.elapsed.micro, 0);
    assert.equal(AWAY_TOLERANCE_MIN_SECONDS, 120);
});
