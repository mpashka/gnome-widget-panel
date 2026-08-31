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

export const DEFAULT_DAILY_IDLE_RESET_HOURS = 6;

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
    };
}


function cloneState(state: BreakTimerState): BreakTimerState {
    return {
        elapsed: {...state.elapsed},
        reminder: state.reminder ? {...state.reminder} : null,
        quietUntil: {...state.quietUntil},
        pausedUntil: state.pausedUntil ?? 0,
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


function isOffered(state: BreakTimerState, timer: TimerConfig): boolean {
    if (!timer.enabled || timer.reminder === 'off')
        return false;
    const elapsed = state.elapsed[timer.name] ?? 0;
    if (elapsed < limitSeconds(timer) - leadSeconds(timer))
        return false;
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
    canInterrupt: boolean
): Reminder {
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
    if (next.pausedUntil > 0 && next.pausedUntil <= input.now)
        next.pausedUntil = 0;
    const silent = isSilent(next, input);
    if (silent)
        next.reminder = null;
    const inBreak = !silent && state.reminder?.stage === 'break';
    const working = input.idleSeconds < ACTIVE_IDLE_THRESHOLD_SECONDS;

    for (const timer of timers) {
        if (!timer.enabled)
            continue;
        if (timer.breakSeconds > 0 && input.idleSeconds >= timer.breakSeconds)
            resetTimer(next, timer.name);
        else if (working && !inBreak)
            next.elapsed[timer.name] = (next.elapsed[timer.name] ?? 0) + input.tickSeconds;
    }
    if (input.dailyIdleResetSeconds > 0 && input.idleSeconds >= input.dailyIdleResetSeconds)
        resetTimer(next, 'daily');
    if (silent)
        return next;

    advanceReminder(next, timers, input);
    if (!next.reminder) {
        const due = timers.filter(timer => isOffered(next, timer)).sort(byUrgency);
        if (due.length > 0)
            next.reminder = startedReminder(next, due[0], input.canInterrupt);
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
    next.reminder = null;
    return next;
}


/** End the manual pause early; the timers speak again from this second on. */
export function resumeReminders(state: BreakTimerState): BreakTimerState {
    if (!state.pausedUntil)
        return state;
    const next = cloneState(state);
    next.pausedUntil = 0;
    return next;
}


/** Seconds left of the manual pause, 0 when the timers are not paused. */
export function pauseRemainingSeconds(state: BreakTimerState, now: number): number {
    return Math.max(0, (state.pausedUntil ?? 0) - now);
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
