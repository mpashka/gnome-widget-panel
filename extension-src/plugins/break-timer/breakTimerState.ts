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
    /**
     * Wall-clock second whose local date names the working day, when the user
     * was not the first activity: a new day started after tonight's end of day
     * — by the menu or by the long absence — puts it on tomorrow
     * (`nextDayAnchor`). 0 = none, and the day is named by `dayStartedAt` (see
     * `dayAnchor`).
     */
    dayAnchorAt: number;
    /**
     * The long-absence count that ends the working day — see `trackAbsence`.
     * Its count and `away` are stored with the day (`restoreDay`).
     */
    absence: AbsenceTracker;
    /**
     * Why the working day started over in the transition that produced this
     * state, or null — what the widget writes to the journal. Cleared by every
     * transition, never stored.
     */
    dayReset: DayResetReason | null;
    /** The away stretch the break timers see — see `trackAwayStretch`. */
    awayStretch: AwayStretch;
    /**
     * How an away stretch of at least `AWAY_TOLERANCE_MIN_SECONDS` ended, in
     * the transition that produced this state; null otherwise. The widget
     * writes it to the journal, to tune `AWAY_TOUCH_SECONDS` from real data.
     * Never stored.
     */
    awayReport: AwayReport | null;
}

/**
 * Time away from the keyboard as the micro and rest timers judge it: like the
 * idle reading, but a brief touch — the mouse nudged in passing — with at least
 * `AWAY_TOLERANCE_MIN_SECONDS` of idle on both sides does not start it over.
 */
export interface AwayStretch {
    /**
     * Seconds away so far, confirmed touches included. Frozen at the start of
     * a pending touch: what follows it counts only once the touch is confirmed.
     */
    seconds: number;
    /** `seconds` when the current idle run began (the idle reading adds on). */
    baseSeconds: number;
    /** Ticks since the pending touch began; 0 when there is none. */
    touchTicks: number;
    /** Its input span, fixed once idle resumed after it. */
    touchInputSeconds: number;
    /** Idle has resumed after the pending touch: new input now rewinds it. */
    touchEnded: boolean;
    /** Work seconds since the pending touch began, held until it is settled. */
    heldSeconds: number;
    /** Touches confirmed in this stretch, and their input seconds. */
    touches: number;
    touchSeconds: number;
}

export interface AwayReport {
    /** Seconds away, up to the input that ended it. */
    awaySeconds: number;
    /** Touches tolerated on the way, and their input seconds in total. */
    touches: number;
    touchSeconds: number;
    /** Seconds of the input that ended it. */
    inputSeconds: number;
}

/**
 * Bookkeeping of the long absence that ends the working day. A machine left on
 * overnight sees a key or the mouse touched now and then — a cat, a bumped
 * desk, a glance at the clock — and a rule that wanted one unbroken idle period
 * never fired on it. So the absence is counted across short bursts of input.
 */
export interface AbsenceTracker {
    /** Idle seconds counted towards the current absence. */
    idleSeconds: number;
    /** The idle reading of the previous tick, to see how much a stretch grew. */
    lastIdleSeconds: number;
    /**
     * Seconds since the last counted idle stretch ended — the burst of input
     * that interrupted the absence, plus the short idle inside and after it.
     */
    burstSeconds: number;
    /** Wall-clock second the current burst began at. */
    burstStartedAt: number;
    /**
     * An absence is under way: a stretch counted and no burst has yet proved a
     * return to work. Daily activity is held meanwhile, so a touch in the night
     * neither starts the day nor adds to it.
     */
    away: boolean;
    /** Daily activity of the current burst, held while `away`. */
    heldSeconds: number;
}

/**
 * Why the working day started over; the widget writes it to the journal.
 * `break` is the daily timer's own break length, when one is configured.
 */
export type DayResetReason = 'absence' | 'boot' | 'manual' | 'break';

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
    /**
     * Absence that ends the working day and resets the daily counter, counted
     * across short bursts of input (`trackAbsence`); 0 = off.
     */
    dailyIdleResetSeconds: number;
    /**
     * Wall-clock epoch second of today's "stop working" time, or 0 when that
     * limit is switched off. The widget computes it (only it knows the local
     * time zone and today's date), so these rules stay plain arithmetic and the
     * tests stay timezone-free.
     */
    dayEndAt: number;
    /**
     * The "stop working" time on today's local date (not the running day's),
     * and a second on tomorrow's local date: the calendar a new day started
     * after the day end needs to belong to tomorrow (`nextDayAnchor`). 0 when
     * the limit is off or the caller does not say.
     */
    todayDayEndAt?: number;
    tomorrowAt?: number;
    /**
     * Wall-clock seconds that passed without a tick beyond `tickSeconds` — a
     * suspended machine. Counted as time away (`trackAbsence`); 0 normally.
     */
    sleptSeconds?: number;
}

export interface StoredState {
    schema: number;
    bootId: string;
    savedAt: number;
    elapsed: Record<string, number>;
    /**
     * The working day's anchor and tonight's postponement, so that rebuilding
     * the widget neither re-raises the evening window nor forgets it. Added
     * without a schema bump: a file without them loads as "not recorded" (0),
     * and an older build simply ignores them.
     */
    dayStartedAt?: number;
    dayEndSnoozedUntil?: number;
    dayAnchorAt?: number;
    /**
     * The idle reading at the save. The panel is destroyed when the screen
     * locks, and the lock comes minutes into an absence: the time away is this
     * plus the gap since the save, not the gap alone.
     */
    idleSeconds?: number;
    /** `absence.idleSeconds` and `absence.away`, so a rebuild keeps the night. */
    absenceIdleSeconds?: number;
    absenceAway?: boolean;
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
 * The longest burst of input that does not interrupt a long absence, and the
 * shortest idle stretch that counts towards one. A night of a cat on the desk
 * or a glance at a notification stays one absence; five minutes of real work
 * is a return, and the count starts over.
 */
export const ABSENCE_BURST_SECONDS = 5 * 60;

/**
 * The shortest idle stretch that counts towards a long absence. Deliberately
 * well above the burst cap: a working day spent watching a training video or
 * reading, with a key pressed every 5–20 minutes, is not an absence, while the
 * stretches of a night are hours long. Twenty minutes keeps that day intact
 * and costs a night at most a few short stretches.
 */
export const ABSENCE_STRETCH_SECONDS = 20 * 60;

/**
 * A shorter break is not offered when a longer one is this close: if the rest
 * break is due in less than this share of the micro interval, the micro break
 * that comes due now is settled silently — the rest break, which settles it
 * anyway, follows within minutes, and two interruptions in a row for the same
 * purpose teach the user to wave both away.
 */
export const COVERED_BY_LONGER_BREAK_FRACTION = 2 / 3;

/**
 * The idle a touch needs on **both** sides to be tolerated, and the shortest
 * away stretch reported to the journal. Two minutes: someone reading scrolls
 * far more often than that, so reading never turns into an away stretch,
 * while someone away touches the machine rarely. Breaks shorter than this —
 * the 30-second micro break — get no tolerance at all and work as they always
 * did.
 */
export const AWAY_TOLERANCE_MIN_SECONDS = 120;

/**
 * The longest input that counts as a touch rather than a return, in seconds of
 * input. Three seconds covers a nudged mouse or a key pressed to wake the
 * screen; reading a notification and answering it does not fit. A starting
 * value: the journal line `break-timer: away …` reports the touches of every
 * stretch, so it can be tuned from what really happens.
 */
export const AWAY_TOUCH_SECONDS = 3;

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


/**
 * A fresh state. `idleSeconds` is the idle reading at the moment it is made:
 * an idle stretch already running then is counted from there on, not again
 * from its start — the part before was counted (and stored) by the widget
 * that came before this one.
 */
export function createState(idleSeconds = 0): BreakTimerState {
    const absence = createAbsence();
    absence.lastIdleSeconds = Math.max(0, idleSeconds);
    return {
        elapsed: {micro: 0, rest: 0, daily: 0},
        reminder: null,
        quietUntil: {},
        pausedUntil: 0,
        pausedFrom: 0,
        dayStartedAt: 0,
        dayEndSnoozedUntil: 0,
        dayAnchorAt: 0,
        absence,
        dayReset: null,
        awayStretch: createAwayStretch(),
        awayReport: null,
    };
}


function createAwayStretch(): AwayStretch {
    return {
        seconds: 0,
        baseSeconds: 0,
        touchTicks: 0,
        touchInputSeconds: 0,
        touchEnded: false,
        heldSeconds: 0,
        touches: 0,
        touchSeconds: 0,
    };
}


function createAbsence(): AbsenceTracker {
    return {
        idleSeconds: 0,
        lastIdleSeconds: 0,
        burstSeconds: 0,
        burstStartedAt: 0,
        away: false,
        heldSeconds: 0,
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
        dayAnchorAt: state.dayAnchorAt ?? 0,
        absence: {...createAbsence(), ...state.absence},
        dayReset: null,
        awayStretch: {...createAwayStretch(), ...state.awayStretch},
        awayReport: null,
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
        state.dayAnchorAt = 0;
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
 * The wall-clock second whose local date the working day belongs to — what the
 * widget computes the "stop working" time from. An explicitly chosen day first,
 * then the day work began on, then today. Past midnight the deadline that
 * matters is still the one of the day one sat down on, by then behind.
 */
export function dayAnchor(state: BreakTimerState, now: number): number {
    if ((state.dayAnchorAt ?? 0) > 0)
        return state.dayAnchorAt;
    if ((state.dayStartedAt ?? 0) > 0)
        return state.dayStartedAt;
    return now;
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
    // The daily limit has a second way of coming due: the clock. Once the day
    // is over by the clock, the end-of-day window is the daily timer's only
    // voice — whether it is up, postponed or waiting for a free screen — so the
    // counter's own "limit reached" message never appears beside it. Its
    // return after a postponement is a time of day (`dayEndSnoozedUntil`), not
    // the activity seconds `quietUntil` counts: a user away for the ten minutes
    // they asked for must find it waiting.
    if (isDailyEvening(timer, input))
        return isDayEndDue(state, timer, input);
    const elapsed = state.elapsed[timer.name] ?? 0;
    if (elapsed < limitSeconds(timer) - leadSeconds(timer))
        return false;
    return elapsed >= (state.quietUntil[timer.name] ?? 0);
}


// The daily timer past the end of the working day, by the clock.
function isDailyEvening(timer: TimerConfig, input: {dayEndAt: number; now: number}): boolean {
    return timer.name === 'daily' && isDayOver(input);
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
    // The day is no longer over — a new one began, the limit was switched off
    // or moved later: a window asking to stop has nothing left to ask.
    if (next.reminder?.reason === 'day-end' && !isDayOver(input))
        next.reminder = null;
    // A window that cannot be closed must not be able to sit on a shared
    // screen, a fullscreen presentation or the lock screen. It is only hidden,
    // never answered: `dayEndSnoozedUntil` is untouched, so it comes back by
    // itself as soon as the screen is the user's own again.
    if (next.reminder?.reason === 'day-end' && !input.canInterrupt)
        next.reminder = null;
    // A "limit reached" message still up when the clock ends the day gives way
    // to the end-of-day window (see `isOffered`).
    if (next.reminder?.timer === 'daily' && next.reminder.reason !== 'day-end'
        && isDayOver(input))
        next.reminder = null;
    const inBreak = !silent && state.reminder?.stage === 'break';
    const working = input.idleSeconds < ACTIVE_IDLE_THRESHOLD_SECONDS;
    const slept = awaySeconds(next, input);
    trackAwayStretch(next, timers, input);
    const away = Math.max(slept, next.awayStretch.seconds);
    const touching = next.awayStretch.touchTicks > 0;

    trackAbsence(next, input);
    if (input.dailyIdleResetSeconds > 0
        && next.absence.idleSeconds >= input.dailyIdleResetSeconds) {
        resetDay(next, 'absence', input);
        // The absence has done its work; whatever follows is counted afresh, so
        // the reset fires once and not on every tick of the rest of the night.
        next.absence.idleSeconds = 0;
    }

    for (const timer of timers) {
        if (!timer.enabled)
            continue;
        if (timer.breakSeconds > 0 && away >= timer.breakSeconds) {
            if (timer.name === 'daily')
                resetDay(next, 'break', input);
            else
                resetTimer(next, timer.name);
        } else if (working && !inBreak && !touching) {
            creditWork(next, timer, input.tickSeconds, input.now);
        }
    }
    if (touching && working && !inBreak)
        next.awayStretch.heldSeconds += input.tickSeconds;
    if (silent)
        return next;

    advanceReminder(next, timers, input);
    if (!next.reminder) {
        for (const timer of timers) {
            if (isOffered(next, timer, input) && isCoveredByLongerBreak(next, timer, timers))
                resetTimer(next, timer.name);
        }
        const due = timers.filter(timer => isOffered(next, timer, input)).sort(byUrgency);
        if (due.length > 0)
            next.reminder = startedReminder(next, due[0], input.canInterrupt, input);
    }
    return next;
}


/**
 * How long the user has been away, as the break timers judge it: the idle
 * reading, or — across a suspend, when no tick ran — the idle before it plus
 * the time asleep, whichever is longer (the reading may or may not have grown
 * through the suspend).
 */
function awaySeconds(state: BreakTimerState, input: TickInput): number {
    const idle = Math.max(0, input.idleSeconds);
    const slept = Math.max(0, input.sleptSeconds ?? 0);
    if (slept <= 0)
        return idle;
    return Math.max(idle, state.absence.lastIdleSeconds + slept);
}


/**
 * Is a longer break coming so soon that this one is not worth interrupting
 * for? Another break timer with a longer break that will be offered: due in
 * less than `COVERED_BY_LONGER_BREAK_FRACTION` of this timer's own interval,
 * or owed and offered now. Not one that is owed but deferred — postponed, its
 * message gone unanswered, its screen waiting to be shown (`quietUntil`): that
 * break is not coming soon, and this one would be silenced for as long as it
 * waits. Never the daily limit: it is not a break, and past it the evening
 * would silence every other timer.
 */
function isCoveredByLongerBreak(
    state: BreakTimerState,
    timer: TimerConfig,
    timers: TimerConfig[]
): boolean {
    if (timer.breakSeconds <= 0)
        return false;
    const window = limitSeconds(timer) * COVERED_BY_LONGER_BREAK_FRACTION;
    return timers.some(longer => {
        if (longer.name === 'daily' || !longer.enabled || longer.reminder === 'off'
            || longer.breakSeconds <= timer.breakSeconds)
            return false;
        const elapsed = state.elapsed[longer.name] ?? 0;
        const deferred = elapsed < (state.quietUntil[longer.name] ?? 0);
        return !deferred && limitSeconds(longer) - elapsed < window;
    });
}


// Work seconds onto one timer. A touch inside an absence is not work yet for
// the daily counter (see `trackAbsence`).
function creditWork(state: BreakTimerState, timer: TimerConfig, seconds: number, now: number): void {
    if (timer.name === 'daily' && state.absence.away) {
        state.absence.heldSeconds += seconds;
        return;
    }
    state.elapsed[timer.name] = (state.elapsed[timer.name] ?? 0) + seconds;
    // The first activity after a reset is when today's work began.
    if (timer.name === 'daily' && state.dayStartedAt <= 0)
        state.dayStartedAt = now;
}


/**
 * Follow the away stretch the break timers judge by. While idle, it is the
 * idle reading on top of what came before the current idle run. Input after
 * at least `AWAY_TOLERANCE_MIN_SECONDS` of idle starts a pending touch: the
 * stretch stops growing and all work from then on is held. The touch is
 * confirmed — the stretch resumes, its time included, and the held work is
 * dropped as the daily counter drops a burst inside an absence — once it
 * stayed within `AWAY_TOUCH_SECONDS` of input and was followed by another
 * `AWAY_TOLERANCE_MIN_SECONDS` of idle. Anything else first — longer input, or
 * new input before that idle — rewinds: the stretch ends where the touch
 * began, and the held work is counted after all, so reading or browsing loses
 * nothing. Input after less idle ends the stretch at once.
 * Mutates `state` — the clone inside `advance`.
 */
function trackAwayStretch(state: BreakTimerState, timers: TimerConfig[], input: TickInput): void {
    const stretch = state.awayStretch;
    const idle = Math.max(0, input.idleSeconds);
    const slept = Math.max(0, input.sleptSeconds ?? 0);
    if (slept > 0) {
        stretch.baseSeconds += slept;
        stretch.seconds += slept;
    }
    const idleNow = idle >= ACTIVE_IDLE_THRESHOLD_SECONDS;
    if (stretch.touchTicks === 0) {
        if (idleNow) {
            stretch.seconds = stretch.baseSeconds + idle;
            return;
        }
        if (stretch.seconds < AWAY_TOLERANCE_MIN_SECONDS) {
            endAwayStretch(state, timers, input, 0);
            return;
        }
        stretch.touchTicks = input.tickSeconds;
        return;
    }
    stretch.touchTicks += input.tickSeconds;
    if (!stretch.touchEnded) {
        // The input span of the touch: its ticks without the idle since its
        // last input.
        stretch.touchInputSeconds = Math.max(0, stretch.touchTicks - idle);
        if (stretch.touchInputSeconds > AWAY_TOUCH_SECONDS)
            endAwayStretch(state, timers, input, stretch.touchInputSeconds);
        else if (idleNow)
            stretch.touchEnded = true;
        return;
    }
    if (!idleNow) {
        endAwayStretch(state, timers, input, stretch.touchInputSeconds);
        return;
    }
    if (idle < AWAY_TOLERANCE_MIN_SECONDS)
        return;
    stretch.seconds += stretch.touchTicks;
    stretch.baseSeconds = stretch.seconds - idle;
    stretch.touches += 1;
    stretch.touchSeconds += stretch.touchInputSeconds;
    stretch.touchTicks = 0;
    stretch.touchInputSeconds = 0;
    stretch.touchEnded = false;
    stretch.heldSeconds = 0;
}


// The stretch is over: report it when it was long enough to matter, count the
// held work after all, and start afresh. `inputSeconds` is the input that
// ended it, as far as it is known.
function endAwayStretch(
    state: BreakTimerState,
    timers: TimerConfig[],
    input: TickInput,
    inputSeconds: number
): void {
    const stretch = state.awayStretch;
    if (stretch.seconds >= AWAY_TOLERANCE_MIN_SECONDS) {
        state.awayReport = {
            awaySeconds: Math.round(stretch.seconds),
            touches: stretch.touches,
            touchSeconds: Math.round(stretch.touchSeconds),
            inputSeconds: Math.round(inputSeconds),
        };
    }
    const held = stretch.heldSeconds;
    state.awayStretch = createAwayStretch();
    if (held <= 0)
        return;
    for (const timer of timers) {
        if (timer.enabled)
            creditWork(state, timer, held, input.now);
    }
}


/**
 * Count one tick of the long absence that ends the working day. Idle stretches
 * of at least `ABSENCE_STRETCH_SECONDS` count in full, and so does a suspend
 * that long (`sleptSeconds`); bursts of input between them do not break the
 * count as long as the input itself spans no more than `ABSENCE_BURST_SECONDS`;
 * a longer burst is a return to work, and the count starts over. While away,
 * the daily activity of a burst is held: a short burst is dropped with the
 * next stretch, a return releases it into the daily counter and the day starts
 * where that burst began. Mutates `state` — the clone inside `advance`.
 */
function trackAbsence(state: BreakTimerState, input: TickInput): void {
    const absence = state.absence;
    const idle = Math.max(0, input.idleSeconds);
    const last = absence.lastIdleSeconds;
    absence.lastIdleSeconds = idle;
    const slept = Math.max(0, input.sleptSeconds ?? 0);
    if (slept >= ABSENCE_STRETCH_SECONDS) {
        // The suspend is the stretch. An idle reading that also kept growing
        // through it must not count the same time twice, hence `last = idle`.
        countStretch(absence, slept);
        if (idle >= ABSENCE_STRETCH_SECONDS)
            return;
    } else if (idle >= ABSENCE_STRETCH_SECONDS) {
        // On its first tick all of the stretch counts, afterwards what it grew
        // by. A reading below the last one means input came and went within one
        // tick — a new stretch, counted from its start.
        const continuing = last >= ABSENCE_STRETCH_SECONDS && idle >= last;
        countStretch(absence, continuing ? idle - last : idle);
        return;
    }
    if (idle >= ABSENCE_BURST_SECONDS) {
        // A gap of 5–20 minutes neither counts towards the absence nor belongs
        // to the burst: two touches eight minutes apart at night are two short
        // bursts, not an eight-minute return to work. The ticks counted while
        // this gap was still short come off again.
        if (last < ABSENCE_BURST_SECONDS)
            absence.burstSeconds = Math.max(0, absence.burstSeconds - last);
        return;
    }
    if (absence.burstSeconds === 0)
        absence.burstStartedAt = input.now;
    absence.burstSeconds += input.tickSeconds;
    // The burst's input span — its short gaps included, the trailing idle
    // since the latest input not yet.
    if (absence.burstSeconds - idle <= ABSENCE_BURST_SECONDS)
        return;
    absence.idleSeconds = 0;
    if (!absence.away)
        return;
    absence.away = false;
    if (absence.heldSeconds > 0) {
        state.elapsed.daily = (state.elapsed.daily ?? 0) + absence.heldSeconds;
        if (state.dayStartedAt <= 0)
            state.dayStartedAt = absence.burstStartedAt || input.now;
        absence.heldSeconds = 0;
    }
}


function countStretch(absence: AbsenceTracker, seconds: number): void {
    absence.idleSeconds += seconds;
    absence.away = true;
    absence.burstSeconds = 0;
    absence.heldSeconds = 0;
}


/**
 * The anchor a new working day starting now gets: a second on tomorrow's date
 * once today's "stop working" time has passed — the evening is over, and the
 * day that starts now is tomorrow's — and none (0) before it.
 */
function nextDayAnchor(input: {now: number; todayDayEndAt?: number; tomorrowAt?: number}): number {
    const todayEnd = input.todayDayEndAt ?? 0;
    return todayEnd > 0 && input.now >= todayEnd ? (input.tomorrowAt ?? 0) : 0;
}


// A new working day, for `reason`. Reported only when a day had begun — the
// rule that fires again over an already-empty day has nothing to say.
function resetDay(
    state: BreakTimerState,
    reason: DayResetReason,
    input: {now: number; todayDayEndAt?: number; tomorrowAt?: number}
): void {
    const begun = (state.elapsed.daily ?? 0) > 0 || (state.dayStartedAt ?? 0) > 0;
    resetTimer(state, 'daily');
    state.dayAnchorAt = nextDayAnchor(input);
    if (begun)
        state.dayReset = reason;
}


/**
 * "Start a new day" from the menu: the daily counter, the day's start, tonight's
 * postponement and any daily reminder all start over, and so does the absence
 * count. The deliberate twin of the automatic reset, for a morning the widget
 * could not recognise by itself. Pressed after today's "stop working" time,
 * the new day belongs to tomorrow's date (`nextDayAnchor`), so tonight's window
 * does not come straight back; pressed before it, today stays the day.
 */
export function startNewDay(
    state: BreakTimerState,
    input: {now: number; todayDayEndAt: number; tomorrowAt: number}
): BreakTimerState {
    const next = cloneState(state);
    resetDay(next, 'manual', input);
    next.dayReset = 'manual';
    next.absence = createAbsence();
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
        dayStartedAt: state.dayStartedAt ?? 0,
        dayEndSnoozedUntil: state.dayEndSnoozedUntil ?? 0,
        dayAnchorAt: state.dayAnchorAt ?? 0,
        idleSeconds: Math.round(state.absence?.lastIdleSeconds ?? 0),
        absenceIdleSeconds: state.absence?.idleSeconds ?? 0,
        absenceAway: state.absence?.away === true,
    };
}


interface RestoreContext {
    bootId: string;
    now: number;
    dailyIdleResetSeconds: number;
    /** The calendar `nextDayAnchor` reads, as in `TickInput`. */
    todayDayEndAt?: number;
    tomorrowAt?: number;
}


// A stored state this version can read, the seconds since it was saved, and
// how long the user has been away by now — the gap plus the idle already
// running at the save; null for a foreign or damaged store.
function readStored(
    stored: unknown,
    now: number
): {state: StoredState; gap: number; away: number} | null {
    const state = stored as StoredState | null;
    if (!state || typeof state !== 'object' || state.schema !== STORE_SCHEMA)
        return null;
    const savedAt = toNumber(state.savedAt, NaN);
    if (!Number.isFinite(savedAt))
        return null;
    const gap = Math.max(0, now - savedAt);
    return {state, gap, away: gap + Math.max(0, toNumber(state.idleSeconds, 0))};
}


// The stored absence count with the time away since added — it counts like
// any idle stretch once long enough. A stretch already long at the save was
// counted up to it, so only the gap is new; otherwise the whole stretch is.
function storedAbsenceSeconds(state: StoredState, gap: number, away: number): number {
    const stored = Math.max(0, toNumber(state.absenceIdleSeconds, 0));
    if (away - gap >= ABSENCE_STRETCH_SECONDS)
        return stored + gap;
    return stored + (away >= ABSENCE_STRETCH_SECONDS ? away : 0);
}


// Does the stored working day go on? Not after a reboot, and not after a gap
// that is itself — or completes — a long absence. `null` when it does,
// otherwise why not.
function storedDayEnded(
    state: StoredState,
    gap: number,
    away: number,
    context: RestoreContext
): DayResetReason | null {
    if (state.bootId !== context.bootId)
        return 'boot';
    const reset = context.dailyIdleResetSeconds;
    if (reset > 0 && (away >= reset || storedAbsenceSeconds(state, gap, away) >= reset))
        return 'absence';
    return null;
}


/**
 * Counters to start from after a restart. The gap since the last save — plus
 * the idle already running at it, since the screen locks minutes into an
 * absence — is time away from the keyboard, so it is read as a break: micro
 * and rest survive only an absence shorter than their own break, and the daily
 * counter survives only within the same boot and short of the long-absence
 * reset.
 */
export function restoreElapsed(
    stored: unknown,
    timers: TimerConfig[],
    context: RestoreContext
): Record<TimerName, number> {
    const fresh: Record<TimerName, number> = {micro: 0, rest: 0, daily: 0};
    const read = readStored(stored, context.now);
    if (!read)
        return fresh;
    const {state, gap, away} = read;
    const elapsed = (state.elapsed ?? {}) as Record<string, unknown>;

    for (const timer of timers) {
        const value = toNumber(elapsed[timer.name], NaN);
        if (!Number.isFinite(value) || value < 0)
            continue;
        if (timer.name === 'daily') {
            if (!storedDayEnded(state, gap, away, context))
                fresh.daily = value;
            continue;
        }
        if (timer.breakSeconds <= 0 || away < timer.breakSeconds)
            fresh[timer.name] = value;
    }
    return fresh;
}


/**
 * The working day's anchor to start from after a restart: when it began, the
 * day chosen by "Start a new day", how long tonight's end-of-day window was put
 * off, and the long-absence count so far (the gap since the save added). They live and die with the
 * daily counter (`restoreElapsed`) — a reboot or a long gap drops them. `reset`
 * says why a stored day that had begun was dropped, for the journal; null when
 * it goes on or there was nothing to drop.
 */
export function restoreDay(
    stored: unknown,
    context: RestoreContext
): {
    dayStartedAt: number;
    dayEndSnoozedUntil: number;
    dayAnchorAt: number;
    absence: {idleSeconds: number; away: boolean};
    reset: DayResetReason | null;
} {
    const none = {
        dayStartedAt: 0,
        dayEndSnoozedUntil: 0,
        dayAnchorAt: 0,
        absence: {idleSeconds: 0, away: false},
        reset: null,
    };
    const read = readStored(stored, context.now);
    if (!read)
        return none;
    const {state, gap, away} = read;
    const dayStartedAt = Math.max(0, toNumber(state.dayStartedAt, 0));
    const daily = Math.max(0, toNumber(state.elapsed?.daily, 0));
    const ended = storedDayEnded(state, gap, away, context);
    // A day that ended while the widget was away starts now, and after
    // today's "stop working" time it is tomorrow's — exactly as a reset seen
    // by the tick would make it. The panel is rebuilt on every unlock, so a
    // locked night comes through here.
    if (ended) {
        return {
            ...none,
            dayAnchorAt: nextDayAnchor(context),
            reset: dayStartedAt > 0 || daily > 0 ? ended : null,
        };
    }
    return {
        dayStartedAt,
        dayEndSnoozedUntil: Math.max(0, toNumber(state.dayEndSnoozedUntil, 0)),
        dayAnchorAt: Math.max(0, toNumber(state.dayAnchorAt, 0)),
        absence: {
            idleSeconds: storedAbsenceSeconds(state, gap, away),
            away: state.absenceAway === true || away >= ABSENCE_STRETCH_SECONDS,
        },
        reset: null,
    };
}
