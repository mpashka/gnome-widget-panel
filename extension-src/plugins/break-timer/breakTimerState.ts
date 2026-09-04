// @tag:widget-break-timer
//
// Pure, gi-free logic of the break-timer widget: the timer configuration, the
// activity/idle bookkeeping and the reminder state machine (prelude -> due or
// break screen). Free of GNOME imports on purpose, so `npm test` can drive it
// (tests/breakTimerState.test.mjs); everything that touches Shell lives in
// breakTimerGraph.ts, breakTimerReminder.ts and breakTimerStore.ts.
//
// User-facing contract: ../../../docs/specification/break-timer.md

import {toNumber} from '../../colorUtils.js';

export type TimerName = 'micro' | 'rest' | 'daily';

/** How a timer announces that its work interval is over. */
export type ReminderMode = 'off' | 'notify' | 'screen';

/**
 * `prelude` — the advance warning counting down to the break.
 * `due` — the break is due and was not taken (the passive message alone).
 * `break` — the modal break screen counting the break down.
 */
export type ReminderStage = 'prelude' | 'due' | 'break';

export interface TimerConfig {
    name: TimerName;
    enabled: boolean;
    workMinutes: number;
    /** Continuous idle that counts as taking this break; 0 = no idle reset. */
    breakSeconds: number;
    color: string;
    overdueColor: string;
    reminder: ReminderMode;
    /** Advance-warning length; 0 derives it from `breakSeconds`. */
    leadSeconds: number;
    allowPostpone: boolean;
    postponeMinutes: number;
    allowSkip: boolean;
}

export interface Reminder {
    timer: TimerName;
    /**
     * Which threshold raised it. Only the daily limit has two: `day-end` is the
     * clock ("stop working"), `limit` is the amount of work done.
     */
    reason?: 'limit' | 'day-end';
    stage: ReminderStage;
    /** Seconds left in this stage. */
    remaining: number;
    /** Length of this stage, for the break screen's progress bar. */
    total: number;
}

export interface BreakTimerState {
    elapsed: Record<TimerName, number>;
    reminder: Reminder | null;
    /**
     * Per timer, the elapsed value below which no reminder is offered again —
     * how postponing, skipping the message and retrying a suppressed break
     * screen all stay quiet for a while.
     */
    quietUntil: Record<string, number>;
    /**
     * Wall-clock second (epoch) until which the manual pause silences every
     * reminder; 0 while the timers are running. Wall-clock, not activity time:
     * "pause for an hour" must end an hour later even if the meeting it covers
     * involved no typing at all.
     */
    pausedUntil: number;
    /**
     * Wall-clock second the running pause began at, so the widget can draw how
     * much of it is left. 0 when nothing is paused — and also for a state
     * written by an older version, where the bar simply reads as full.
     */
    pausedFrom: number;
    /**
     * Wall-clock second today's work began at — the first activity after the
     * daily counter was last reset. It is what the end-of-day bar fills from;
     * 0 before the first activity of the day.
     */
    dayStartedAt: number;
    /**
     * Wall-clock second until which the end-of-day window stays away, after the
     * user answered it with "ten more minutes" or "work until 23:00". 0 when
     * nothing was postponed.
     *
     * Wall-clock rather than the activity seconds `quietUntil` counts in,
     * because this threshold is a time of day: a user who walks away for the
     * ten minutes they asked for must still be met by the window when they sit
     * back down, and activity seconds would not have moved.
     */
    dayEndSnoozedUntil: number;
}

export interface TickInput {
    idleSeconds: number;
    tickSeconds: number;
    /** False while a break screen would be harmful (fullscreen, locked, …). */
    canInterrupt: boolean;
    /**
     * True while something holds the session awake (a call, a presentation, the
     * panel's own caffeine widget). Reminders stay silent for as long as it
     * lasts — see `isSilent`.
     */
    inhibited: boolean;
    /** Wall-clock epoch seconds; only the manual pause deadline reads it. */
    now: number;
    /** Idle that ends the working day and resets the daily counter; 0 = off. */
    dailyIdleResetSeconds: number;
    /**
     * Wall-clock epoch second of today's "stop working" time, or 0 when that
     * limit is switched off. The widget computes it (only it knows the local
     * time zone and today's date), so these rules stay plain arithmetic and the
     * tests stay timezone-free.
     */
    dayEndAt: number;
}

export interface StoredState {
    schema: number;
    bootId: string;
    savedAt: number;
    elapsed: Record<string, number>;
}

export const STORE_SCHEMA = 1;

// Idle below this counts as "the user is working" and grows every enabled
// timer; idle at or above a timer's own breakSeconds resets that timer.
export const ACTIVE_IDLE_THRESHOLD_SECONDS = 5;

// How long the "break is due" message stays on screen before it gives up.
export const DUE_MESSAGE_SECONDS = 30;

// Auto advance-warning bounds: half the break, clamped to this range.
export const MIN_LEAD_SECONDS = 5;
export const MAX_LEAD_SECONDS = 30;

// Activity seconds before a break that was only messaged about (notify mode,
// or a message the user ignored) is offered again.
const NOTIFY_REPEAT_SECONDS = 300;
const DAILY_REPEAT_SECONDS = 3600;

// Activity seconds before retrying a break screen that could not be shown
// (fullscreen application, session inhibitor, locked session).
const SUPPRESSED_RETRY_SECONDS = 60;

// The one fixed answer the end-of-day window offers: long enough to close the
// windows and shut the machine down. Deliberately not configurable — its whole
// value is that it needs no thought at the end of a long day.
export const DAY_END_WRAP_UP_SECONDS = 10 * 60;

// The lengths its menu offers beyond that, in minutes.
export const DAY_END_POSTPONE_MINUTES = [20, 30, 60];

export const DEFAULT_DAILY_IDLE_RESET_HOURS = 6;

/**
 * The pause lengths the context menu offers, in minutes. Three of them: a menu
 * of every plausible duration is a menu nobody reads. Configurable, because the
 * length of "a meeting" is personal.
 */
export const DEFAULT_PAUSE_MINUTES: number[] = [30, 60, 90];

/**
 * The "stop working" time, as minutes since midnight (21:30). Off by default:
 * when the working day ends is a personal rule, and a widget that invents one
 * for somebody is a widget they switch off.
 */
export const DEFAULT_DAY_END_MINUTES = 21 * 60 + 30;

/** The end-of-day limit as the widget reads it out of its options. */
export interface DayEndConfig {
    enabled: boolean;
    /** Minutes since local midnight. */
    minutes: number;
}


export function normalizeDayEnd(options: {
    dayEndEnabled?: unknown;
    dayEndMinutes?: unknown;
}): DayEndConfig {
    const raw = Math.round(Number(options?.dayEndMinutes));
    const minutes = Number.isFinite(raw)
        ? Math.min(24 * 60 - 1, Math.max(0, raw))
        : DEFAULT_DAY_END_MINUTES;
    return {enabled: options?.dayEndEnabled === true, minutes};
}
const PAUSE_MINUTES_RANGE: readonly [number, number] = [1, 8 * 60];

/**
 * Where the advance-warning message may sit. It starts on the configured
 * anchor and, when the pointer comes for it, hops once to the one furthest
 * away — see breakTimerReminder.ts. The default is the top right: the middle
 * of the top edge belongs to the shell's own notifications.
 */
export const MESSAGE_ANCHORS = [
    'top-left', 'top-center', 'top-right',
    'bottom-left', 'bottom-center', 'bottom-right',
] as const;

export type MessageAnchor = typeof MESSAGE_ANCHORS[number];

export const DEFAULT_MESSAGE_ANCHOR: MessageAnchor = 'top-right';


export function normalizeAnchor(anchor: unknown): MessageAnchor {
    return MESSAGE_ANCHORS.includes(anchor as MessageAnchor)
        ? anchor as MessageAnchor
        : DEFAULT_MESSAGE_ANCHOR;
}


export const TIMER_TITLES: Record<TimerName, string> = {
    micro: 'Micro break',
    rest: 'Rest break',
    daily: 'Daily limit',
};

export const DEFAULT_TIMERS: TimerConfig[] = [
    {
        name: 'micro',
        enabled: true,
        workMinutes: 10,
        breakSeconds: 30,
        color: '#4ca6ff',
        overdueColor: '#f03333',
        reminder: 'screen',
        leadSeconds: 0,
        allowPostpone: true,
        postponeMinutes: 2,
        allowSkip: true,
    },
    {
        name: 'rest',
        enabled: true,
        workMinutes: 60,
        breakSeconds: 480,
        color: '#3dc752',
        overdueColor: '#f03333',
        reminder: 'screen',
        leadSeconds: 0,
        allowPostpone: true,
        postponeMinutes: 5,
        allowSkip: true,
    },
    {
        // The daily limit has no break length: it is not taken, it is reached.
        // Reminders stay passive and the counter resets on a new boot or a long
        // absence, never on a lunch-length idle.
        name: 'daily',
        enabled: true,
        workMinutes: 480,
        breakSeconds: 0,
        color: '#ffb82e',
        overdueColor: '#f03333',
        reminder: 'notify',
        leadSeconds: 0,
        allowPostpone: false,
        postponeMinutes: 0,
        allowSkip: false,
    },
];

const REMINDER_MODES: ReminderMode[] = ['off', 'notify', 'screen'];


/**
 * Read the configured pause lengths: exactly three, each a whole number of
 * minutes inside the allowed range, in ascending order. Anything missing or
 * unusable falls back to its default, so a hand-edited config still leaves a
 * usable menu.
 */
export function normalizePauseMinutes(value: unknown): number[] {
    const raw = Array.isArray(value) ? value : [];
    const minutes = DEFAULT_PAUSE_MINUTES.map((fallback, index) => {
        const candidate = Math.round(Number(raw[index]));
        if (!Number.isFinite(candidate))
            return fallback;
        return Math.min(
            PAUSE_MINUTES_RANGE[1],
            Math.max(PAUSE_MINUTES_RANGE[0], candidate)
        );
    });
    return minutes.sort((a, b) => a - b);
}


/**
 * Normalize the configured timers: fixed name/count/order (micro, rest, daily);
 * every other field is taken from the matching input entry when valid and
 * defaulted otherwise. Mirrors cpuGraph's normalizeBands defensive pattern —
 * the options come from a user-editable JSON GSettings value.
 */
export function normalizeTimers(timers: unknown): TimerConfig[] {
    const source = Array.isArray(timers) ? timers : [];
    return DEFAULT_TIMERS.map(def => {
        const match = (source.find(
            (timer: any) => timer && timer.name === def.name
        ) ?? {}) as Partial<TimerConfig>;
        const workMinutes = toNumber(match.workMinutes, NaN);
        const breakSeconds = toNumber(match.breakSeconds, NaN);
        const leadSeconds = toNumber(match.leadSeconds, NaN);
        const postponeMinutes = toNumber(match.postponeMinutes, NaN);
        return {
            name: def.name,
            enabled: typeof match.enabled === 'boolean' ? match.enabled : def.enabled,
            workMinutes: Number.isFinite(workMinutes) && workMinutes > 0
                ? workMinutes : def.workMinutes,
            breakSeconds: Number.isFinite(breakSeconds) && breakSeconds >= 0
                ? breakSeconds : def.breakSeconds,
            color: typeof match.color === 'string' && match.color.length > 0
                ? match.color : def.color,
            overdueColor: typeof match.overdueColor === 'string' && match.overdueColor.length > 0
                ? match.overdueColor : def.overdueColor,
            reminder: REMINDER_MODES.includes(match.reminder as ReminderMode)
                ? match.reminder as ReminderMode : def.reminder,
            leadSeconds: Number.isFinite(leadSeconds) && leadSeconds >= 0
                ? leadSeconds : def.leadSeconds,
            allowPostpone: typeof match.allowPostpone === 'boolean'
                ? match.allowPostpone : def.allowPostpone,
            postponeMinutes: Number.isFinite(postponeMinutes) && postponeMinutes > 0
                ? postponeMinutes : def.postponeMinutes,
            allowSkip: typeof match.allowSkip === 'boolean' ? match.allowSkip : def.allowSkip,
        };
    });
}


/** Work interval in seconds — what the progress bar fills up to. */
export function limitSeconds(timer: TimerConfig): number {
    return timer.workMinutes * 60;
}


/**
 * How early the advance warning appears: the configured value, or half the
 * break clamped to 5..30 s. A timer without a break (the daily limit) gets no
 * warning — its message appears when the limit is reached.
 */
export function leadSeconds(timer: TimerConfig): number {
    if (timer.leadSeconds > 0)
        return timer.leadSeconds;
    if (timer.breakSeconds <= 0)
        return 0;
    return Math.min(
        MAX_LEAD_SECONDS,
        Math.max(MIN_LEAD_SECONDS, Math.round(timer.breakSeconds / 2))
    );
}


export function createState(): BreakTimerState {
    return {
        elapsed: {micro: 0, rest: 0, daily: 0},
        reminder: null,
        quietUntil: {},
        pausedUntil: 0,
        pausedFrom: 0,
        dayStartedAt: 0,
        dayEndSnoozedUntil: 0,
    };
}


function cloneState(state: BreakTimerState): BreakTimerState {
    return {
        elapsed: {...state.elapsed},
        reminder: state.reminder ? {...state.reminder} : null,
        quietUntil: {...state.quietUntil},
        pausedUntil: state.pausedUntil ?? 0,
        pausedFrom: state.pausedFrom ?? 0,
        dayStartedAt: state.dayStartedAt ?? 0,
        dayEndSnoozedUntil: state.dayEndSnoozedUntil ?? 0,
    };
}


function findTimer(timers: TimerConfig[], name: TimerName): TimerConfig | undefined {
    return timers.find(timer => timer.name === name);
}


// Taking the break: the counter starts again, nothing is owed and any reminder
// about this timer is over.
function resetTimer(state: BreakTimerState, name: TimerName): void {
    state.elapsed[name] = 0;
    delete state.quietUntil[name];
    // A new working day starts when the daily counter does, so the end-of-day
    // bar fills from the moment work actually resumes.
    if (name === 'daily') {
        state.dayStartedAt = 0;
        // Yesterday's "ten more minutes" has nothing to say about today.
        state.dayEndSnoozedUntil = 0;
    }
    if (state.reminder && state.reminder.timer === name)
        state.reminder = null;
}


// Activity seconds of quiet after a message the user did not act on. A break
// screen that could not be shown retries much sooner than a plain reminder.
function repeatSeconds(timer: TimerConfig, canInterrupt: boolean): number {
    if (timer.reminder === 'screen' && !canInterrupt)
        return SUPPRESSED_RETRY_SECONDS;
    return timer.name === 'daily' ? DAILY_REPEAT_SECONDS : NOTIFY_REPEAT_SECONDS;
}


/**
 * Is the "stop working for today" time here? A second daily threshold that has
 * nothing to do with how much was worked: some hours are simply not working
 * hours. `dayEndAt` is 0 when the limit is switched off.
 */
export function isDayOver(input: {dayEndAt: number; now: number}): boolean {
    return input.dayEndAt > 0 && input.now >= input.dayEndAt;
}


/**
 * Is the end-of-day window postponed right now? "Ten more minutes" and "work
 * until 23:00" are the same thing in two words — a wall-clock second before
 * which the window says nothing.
 */
export function isDayEndSnoozed(
    state: BreakTimerState,
    now: number
): boolean {
    return (state.dayEndSnoozedUntil ?? 0) > now;
}


/**
 * The end-of-day window is the one reminder that never expires, so it is also
 * the one that must not be able to appear where it cannot be answered: on a
 * shared screen, over a fullscreen presentation, or on the lock screen. Both
 * `canInterrupt` and the snooze gate it — a suppressed window returns by itself
 * the moment the obstacle is gone, and nothing is marked as "said".
 */
function isDayEndDue(
    state: BreakTimerState,
    timer: TimerConfig,
    input: TickInput
): boolean {
    return timer.name === 'daily'
        && isDayOver(input)
        && input.canInterrupt
        && !isDayEndSnoozed(state, input.now);
}


/** Activity seconds worked beyond the daily limit; 0 while inside it. */
export function overtimeSeconds(
    state: BreakTimerState,
    timers: TimerConfig[]
): number {
    const daily = findTimer(timers, 'daily');
    if (!daily)
        return 0;
    return Math.max(0, (state.elapsed.daily ?? 0) - limitSeconds(daily));
}


/**
 * How close the working day is to its end, as 0..1 — the daily bar draws
 * whichever of its two thresholds is further along. Measured from the moment
 * today's work began, which is the only start the widget can honestly claim;
 * before the first activity of the day there is nothing to measure, so the bar
 * stays empty until the deadline itself arrives.
 */
export function dayEndFraction(
    state: BreakTimerState,
    input: {dayEndAt: number; now: number}
): number {
    if (input.dayEndAt <= 0)
        return 0;
    if (input.now >= input.dayEndAt)
        return 1;
    const started = state.dayStartedAt ?? 0;
    if (started <= 0 || started >= input.dayEndAt)
        return 0;
    return Math.min(1, Math.max(0, (input.now - started) / (input.dayEndAt - started)));
}


/** Seconds of the working day left; 0 once it is over or the limit is off. */
export function dayEndRemainingSeconds(input: {dayEndAt: number; now: number}): number {
    if (input.dayEndAt <= 0)
        return 0;
    return Math.max(0, input.dayEndAt - input.now);
}


function isOffered(
    state: BreakTimerState,
    timer: TimerConfig,
    input: TickInput
): boolean {
    if (!timer.enabled || timer.reminder === 'off')
        return false;
    const elapsed = state.elapsed[timer.name] ?? 0;
    // The daily limit has a second way of coming due: the clock. Whichever
    // arrives first raises the same reminder, on the same timer, so nothing is
    // said twice.
    const worked = elapsed >= limitSeconds(timer) - leadSeconds(timer);
    if (!worked && !isDayEndDue(state, timer, input))
        return false;
    // A day-end window that is only waiting for the screen to be free is not
    // subject to the hourly quiet period the counter's own message uses: it was
    // never shown, so there is nothing to be quiet about.
    if (!worked)
        return true;
    return elapsed >= (state.quietUntil[timer.name] ?? 0);
}


// The break screen wins over a plain message, and the longer break wins over
// the shorter one: taking a rest break also settles the micro break.
function byUrgency(left: TimerConfig, right: TimerConfig): number {
    const screens = Number(right.reminder === 'screen') - Number(left.reminder === 'screen');
    return screens !== 0 ? screens : right.breakSeconds - left.breakSeconds;
}


function startedReminder(
    state: BreakTimerState,
    timer: TimerConfig,
    canInterrupt: boolean,
    input: TickInput
): Reminder {
    // The clock beat the counter to it: no advance warning (the warning belongs
    // to a break one is about to owe, not to a time of day) and a message of its
    // own, so "call it a day" is not confused with "you have worked 8 hours".
    //
    // It carries no countdown: `remaining: 0` marks the one reminder that does
    // not expire. The end of the day cannot be taken the way a break can — no
    // amount of idling satisfies it — so a message that leaves by itself would
    // let the day close with nothing decided. It stays until it is answered.
    // The clock outranks the counter here: past the end of the day, "you have
    // worked 8 hours" is the smaller half of what the window has to say, and it
    // is in there as the overtime line anyway.
    if (isDayEndDue(state, timer, input)) {
        return {
            timer: timer.name,
            reason: 'day-end',
            stage: 'due',
            remaining: 0,
            total: 0,
        };
    }
    const lead = leadSeconds(timer);
    const toLimit = limitSeconds(timer) - (state.elapsed[timer.name] ?? 0);
    if (lead > 0 && toLimit > 0) {
        const remaining = Math.min(lead, toLimit);
        return {timer: timer.name, stage: 'prelude', remaining, total: remaining};
    }
    if (timer.reminder === 'screen' && canInterrupt && timer.breakSeconds > 0)
        return {
            timer: timer.name,
            stage: 'break',
            remaining: timer.breakSeconds,
            total: timer.breakSeconds,
        };
    return {
        timer: timer.name,
        stage: 'due',
        remaining: DUE_MESSAGE_SECONDS,
        total: DUE_MESSAGE_SECONDS,
    };
}


// A break was served in full: reset its timer and every enabled timer whose own
// break is no longer than it, exactly as a real idle period of that length does.
function completeBreak(state: BreakTimerState, timers: TimerConfig[], taken: TimerConfig): void {
    for (const timer of timers) {
        if (!timer.enabled || timer.breakSeconds <= 0)
            continue;
        if (timer.breakSeconds <= taken.breakSeconds)
            resetTimer(state, timer.name);
    }
    resetTimer(state, taken.name);
}


function advanceReminder(
    state: BreakTimerState,
    timers: TimerConfig[],
    input: TickInput
): void {
    const reminder = state.reminder;
    if (!reminder)
        return;
    const timer = findTimer(timers, reminder.timer);
    if (!timer || !timer.enabled || timer.reminder === 'off') {
        state.reminder = null;
        return;
    }
    // The end-of-day window has no countdown to advance: it stays until the
    // user answers it, or until something makes it unshowable (handled in
    // `advance`, which drops it the way a pause does).
    if (reminder.reason === 'day-end')
        return;
    reminder.remaining -= input.tickSeconds;
    if (reminder.remaining > 0)
        return;

    if (reminder.stage === 'prelude') {
        const toScreen = timer.reminder === 'screen'
            && input.canInterrupt
            && timer.breakSeconds > 0;
        state.reminder = toScreen
            ? {
                timer: timer.name,
                stage: 'break',
                remaining: timer.breakSeconds,
                total: timer.breakSeconds,
            }
            : {
                timer: timer.name,
                stage: 'due',
                remaining: DUE_MESSAGE_SECONDS,
                total: DUE_MESSAGE_SECONDS,
            };
        return;
    }
    if (reminder.stage === 'break') {
        completeBreak(state, timers, timer);
        return;
    }
    // The message ran its course without a break being taken: stay quiet for a
    // while rather than nagging every second.
    state.reminder = null;
    state.quietUntil[timer.name] =
        (state.elapsed[timer.name] ?? 0) + repeatSeconds(timer, input.canInterrupt);
}


/**
 * Are reminders silenced right now? Two sources, one behaviour: the manual
 * pause, and anything holding the session awake — a call, a presentation, the
 * panel's caffeine widget. Both mean "this is not the moment", so nothing is
 * shown while they last. The counters keep growing regardless: a meeting still
 * tires the eyes, and the break is owed the moment it is over.
 */
export function isSilent(state: BreakTimerState, input: TickInput): boolean {
    return input.inhibited || pauseRemainingSeconds(state, input.now) > 0;
}


/**
 * One second of the widget's life: account for activity and taken breaks, move
 * the active reminder along, and offer a new one when a timer comes due.
 * Pure — returns the next state and never touches the argument.
 */
export function advance(
    state: BreakTimerState,
    timers: TimerConfig[],
    input: TickInput
): BreakTimerState {
    const next = cloneState(state);
    if (next.pausedUntil > 0 && next.pausedUntil <= input.now) {
        next.pausedUntil = 0;
        next.pausedFrom = 0;
    }
    const silent = isSilent(next, input);
    if (silent)
        next.reminder = null;
    // A window that cannot be closed must not be able to sit on a shared
    // screen, a fullscreen presentation or the lock screen. It is only hidden,
    // never answered: `dayEndSnoozedUntil` is untouched, so it comes back by
    // itself as soon as the screen is the user's own again.
    if (next.reminder?.reason === 'day-end' && !input.canInterrupt)
        next.reminder = null;
    const inBreak = !silent && state.reminder?.stage === 'break';
    const working = input.idleSeconds < ACTIVE_IDLE_THRESHOLD_SECONDS;

    for (const timer of timers) {
        if (!timer.enabled)
            continue;
        if (timer.breakSeconds > 0 && input.idleSeconds >= timer.breakSeconds)
            resetTimer(next, timer.name);
        else if (working && !inBreak) {
            next.elapsed[timer.name] = (next.elapsed[timer.name] ?? 0) + input.tickSeconds;
            // The first activity after a reset is when today's work began.
            if (timer.name === 'daily' && next.dayStartedAt <= 0)
                next.dayStartedAt = input.now;
        }
    }
    if (input.dailyIdleResetSeconds > 0 && input.idleSeconds >= input.dailyIdleResetSeconds)
        resetTimer(next, 'daily');
    if (silent)
        return next;

    advanceReminder(next, timers, input);
    if (!next.reminder) {
        const due = timers.filter(timer => isOffered(next, timer, input)).sort(byUrgency);
        if (due.length > 0)
            next.reminder = startedReminder(next, due[0], input.canInterrupt, input);
    }
    return next;
}


/**
 * Silence the reminders for `seconds` of wall-clock time — the "I am in a
 * meeting" gesture. Sets the deadline rather than extending it, so choosing a
 * shorter pause during a longer one shortens it.
 */
export function pauseReminders(
    state: BreakTimerState,
    seconds: number,
    now: number
): BreakTimerState {
    const next = cloneState(state);
    next.pausedUntil = now + Math.max(0, seconds);
    next.pausedFrom = now;
    next.reminder = null;
    return next;
}


/** End the manual pause early; the timers speak again from this second on. */
export function resumeReminders(state: BreakTimerState): BreakTimerState {
    if (!state.pausedUntil)
        return state;
    const next = cloneState(state);
    next.pausedUntil = 0;
    next.pausedFrom = 0;
    return next;
}


/** Seconds left of the manual pause, 0 when the timers are not paused. */
export function pauseRemainingSeconds(state: BreakTimerState, now: number): number {
    return Math.max(0, (state.pausedUntil ?? 0) - now);
}


/**
 * How much of the running pause is still to come, as 1..0 — what the widget
 * draws instead of its timer bars while paused. 0 when nothing is paused, and 1
 * when the start is unknown (a state file written before `pausedFrom` existed):
 * a full bar reads as "paused", which is the part that matters.
 */
export function pauseFraction(state: BreakTimerState, now: number): number {
    const remaining = pauseRemainingSeconds(state, now);
    if (remaining <= 0)
        return 0;
    // `pausedFrom` is a wall-clock epoch second, so 0 means "not recorded"
    // (a state file from before the field existed), not "the epoch".
    const from = state.pausedFrom ?? 0;
    if (from <= 0)
        return 1;
    const total = (state.pausedUntil ?? 0) - from;
    if (!(total > 0))
        return 1;
    return Math.min(1, remaining / total);
}


/** The user asked for a few more minutes: the break is still owed. */
export function postponeReminder(
    state: BreakTimerState,
    timers: TimerConfig[]
): BreakTimerState {
    const reminder = state.reminder;
    if (!reminder)
        return state;
    const timer = findTimer(timers, reminder.timer);
    if (!timer || !timer.allowPostpone)
        return state;
    const next = cloneState(state);
    next.quietUntil[timer.name] =
        (next.elapsed[timer.name] ?? 0) + timer.postponeMinutes * 60;
    next.reminder = null;
    return next;
}


/**
 * The end-of-day window was answered: stay away until `until` (a wall-clock
 * second), and say nothing more about it before then.
 *
 * This is the only answer the window has — "ten more minutes", "an hour",
 * "until 23:00" are one operation with a different number, and none of them
 * touches the configured end of the working day. A window that rewrote that
 * setting every evening would walk it to 1 a.m. inside a week and quietly
 * dismantle the feature it belongs to; tonight is only tonight.
 */
export function postponeDayEnd(
    state: BreakTimerState,
    until: number
): BreakTimerState {
    const next = cloneState(state);
    next.dayEndSnoozedUntil = Math.max(next.dayEndSnoozedUntil ?? 0, Math.round(until));
    if (next.reminder?.reason === 'day-end')
        next.reminder = null;
    return next;
}


/**
 * The user declined the break: only that timer starts over, so a skipped rest
 * break does not silence the micro break the way a taken one does.
 */
export function skipReminder(
    state: BreakTimerState,
    timers: TimerConfig[]
): BreakTimerState {
    const reminder = state.reminder;
    if (!reminder)
        return state;
    const timer = findTimer(timers, reminder.timer);
    if (!timer || !timer.allowSkip)
        return state;
    const next = cloneState(state);
    resetTimer(next, timer.name);
    return next;
}


export function serializeState(
    state: BreakTimerState,
    context: {bootId: string; now: number}
): StoredState {
    return {
        schema: STORE_SCHEMA,
        bootId: context.bootId,
        savedAt: Math.round(context.now),
        elapsed: {...state.elapsed},
    };
}


/**
 * Counters to start from after a restart. The gap since the last save is itself
 * time away from the keyboard, so it is read as a break: micro and rest survive
 * only a gap shorter than their own break, and the daily counter survives only
 * within the same boot and a gap shorter than the long-absence reset.
 */
export function restoreElapsed(
    stored: unknown,
    timers: TimerConfig[],
    context: {bootId: string; now: number; dailyIdleResetSeconds: number}
): Record<TimerName, number> {
    const fresh: Record<TimerName, number> = {micro: 0, rest: 0, daily: 0};
    const state = stored as StoredState | null;
    if (!state || typeof state !== 'object' || state.schema !== STORE_SCHEMA)
        return fresh;
    const savedAt = toNumber(state.savedAt, NaN);
    if (!Number.isFinite(savedAt))
        return fresh;
    const gap = Math.max(0, context.now - savedAt);
    const elapsed = (state.elapsed ?? {}) as Record<string, unknown>;

    for (const timer of timers) {
        const value = toNumber(elapsed[timer.name], NaN);
        if (!Number.isFinite(value) || value < 0)
            continue;
        if (timer.name === 'daily') {
            const rebooted = state.bootId !== context.bootId;
            const away = context.dailyIdleResetSeconds > 0
                && gap >= context.dailyIdleResetSeconds;
            if (!rebooted && !away)
                fresh.daily = value;
            continue;
        }
        if (timer.breakSeconds <= 0 || gap < timer.breakSeconds)
            fresh[timer.name] = value;
    }
    return fresh;
}
