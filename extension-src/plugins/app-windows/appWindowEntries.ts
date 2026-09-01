// @tag:widget-app-windows
//
// Pure rules of the app-windows menu: option parsing plus turning the tracked
// application's windows into the ordered, limited list of rows the popup shows.
// Deliberately free of any `gi://` import so it is unit tested in plain Node
// (see ../../../tests/appWindowEntries.test.mjs); `index.ts` does the Meta/St
// work and calls in here for every decision that is not drawing.

import {escapePangoText} from '../../tooltipTemplate.js';

/** How the menu orders the windows it lists. */
export type AppWindowsSort = 'recent' | 'title';

/** Validated `options` of one app-windows widget instance. */
export interface AppWindowsOptions {
    /** Show the tracked application's own icon; `false` always shows `icon`. */
    useAppIcon: boolean;
    /** The configured icon: the fallback under `useAppIcon`, the icon otherwise. */
    icon: string;
    /** Optional text label next to the button icon. */
    text: string;
    /** Draw the number of windows as a badge on the icon. */
    showCount: boolean;
    /** Pango-markup tooltip template; empty means no tooltip. */
    template: string;
    /** Most rows the menu lists; the rest are summarised as "N more". */
    maxWindows: number;
    /** Fixed menu width in pixels; longer titles are ellipsized to it. */
    menuWidth: number;
    /** Row order: by title (stable, the default) or most recently used first. */
    sort: AppWindowsSort;
    /** Include the app's windows living on other workspaces. */
    otherWorkspaces: boolean;
}

/**
 * One window as the pure layer sees it — the subset of `Meta.Window` the rules
 * need. `index.ts` builds these from the real windows.
 */
export interface WindowSummary {
    /** Caller's key for the window; returned unchanged on the entry so the
     * clicked row can be mapped back to its `Meta.Window`. */
    id: number;
    title: string;
    /** Workspace index the window sits on, or -1 when it is on all of them. */
    workspaceIndex: number;
    onActiveWorkspace: boolean;
    isFocused: boolean;
    isMinimized: boolean;
    /** `get_user_time()`: when the window was last used, for `recent` order. */
    userTime: number;
}

/** One row of the popup menu. */
export interface WindowEntry {
    id: number;
    /** Window title, never empty (see `UNTITLED`). */
    label: string;
    isFocused: boolean;
    isMinimized: boolean;
    onActiveWorkspace: boolean;
    workspaceIndex: number;
}

/** Result of {@link selectWindowEntries}. */
export interface WindowEntryList {
    entries: WindowEntry[];
    /** Windows dropped by `maxWindows`; 0 when everything fits. */
    hiddenCount: number;
}

export const DEFAULT_ICON = 'focus-windows-symbolic';
export const UNTITLED = 'Untitled window';
/** Tooltip shape by default: the application and how many windows it has. */
export const DEFAULT_TEMPLATE = '{app} — {count}';

const DEFAULTS: AppWindowsOptions = {
    useAppIcon: true,
    icon: DEFAULT_ICON,
    text: '',
    showCount: true,
    template: DEFAULT_TEMPLATE,
    maxWindows: 15,
    menuWidth: 420,
    sort: 'title',
    otherWorkspaces: true,
};

export const MAX_WINDOWS_RANGE: readonly [number, number] = [1, 50];
export const MENU_WIDTH_RANGE: readonly [number, number] = [180, 900];

function boolOption(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function intOption(
    value: unknown,
    fallback: number,
    [min, max]: readonly [number, number]
): number {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Read one widget instance's `options`. Lenient like the rest of the widget
 * configuration: an absent or malformed value falls back to the default, and
 * out-of-range numbers are clamped rather than rejected, so a hand-edited
 * `widgets` key can never leave the button unusable.
 */
export function parseAppWindowsOptions(
    options: Record<string, unknown> | null | undefined
): AppWindowsOptions {
    const raw = options ?? {};
    return {
        useAppIcon: boolOption(raw.useAppIcon, DEFAULTS.useAppIcon),
        icon: typeof raw.icon === 'string' ? raw.icon : DEFAULTS.icon,
        text: typeof raw.text === 'string' ? raw.text : DEFAULTS.text,
        showCount: boolOption(raw.showCount, DEFAULTS.showCount),
        template:
            typeof raw.template === 'string' ? raw.template : DEFAULTS.template,
        maxWindows: intOption(
            raw.maxWindows,
            DEFAULTS.maxWindows,
            MAX_WINDOWS_RANGE
        ),
        menuWidth: intOption(raw.menuWidth, DEFAULTS.menuWidth, MENU_WIDTH_RANGE),
        sort: raw.sort === 'recent' ? 'recent' : DEFAULTS.sort,
        otherWorkspaces: boolOption(
            raw.otherWorkspaces,
            DEFAULTS.otherWorkspaces
        ),
    };
}

// Titles carry the information the user picks by, so they are only collapsed,
// never truncated here: the row ellipsizes to the fixed menu width instead.
function labelFor(window: WindowSummary): string {
    const title = window.title.replace(/\s+/g, ' ').trim();
    return title.length > 0 ? title : UNTITLED;
}

/** What the tracked application looks like to the tooltip. */
export interface AppWindowsStatus {
    /** Application name; empty when nothing is tracked. */
    app: string;
    /** Windows the menu would list. */
    count: number;
    /** Title of the window that had focus; empty when there is none. */
    window: string;
}

/**
 * Tooltip fragments for {@link renderTemplate}. Every value is plain text from
 * the outside world (an application name, a window title), so each is
 * Pango-escaped here — `renderTemplate` inserts fragments verbatim.
 */
export function appWindowsFragments(
    status: AppWindowsStatus
): Record<string, string> {
    const count = Math.max(0, Math.trunc(status.count));
    const countLabel =
        count === 0
            ? 'no windows'
            : count === 1
              ? '1 window'
              : `${count} windows`;
    const title = status.window.replace(/\s+/g, ' ').trim();
    return {
        app: escapePangoText(status.app || 'No application'),
        count: escapePangoText(countLabel),
        window: escapePangoText(count > 0 && title.length === 0 ? UNTITLED : title),
    };
}

/**
 * Order and limit the tracked application's windows.
 *
 * `title` (the default) is a **stable** alphabetical list: the same window sits
 * in the same place every time the menu opens, so picking one becomes muscle
 * memory — which is the whole point of a menu you open to tell four windows of
 * one IDE apart. The focused window is not hoisted here; its mark is what says
 * where you are.
 *
 * `recent` is the switcher order (`get_user_time()`, newest first) with the
 * focused window pulled to the front, because a window currently in use may
 * still carry an older user time than the one it was raised over. In that mode
 * the first row is always the window you came from, so its mark only confirms
 * what the order already said.
 */
export function selectWindowEntries(
    windows: readonly WindowSummary[],
    options: AppWindowsOptions
): WindowEntryList {
    const visible = options.otherWorkspaces
        ? [...windows]
        : windows.filter((window) => window.onActiveWorkspace);

    visible.sort((a, b) => {
        if (options.sort === 'title')
            return labelFor(a).localeCompare(labelFor(b));
        if (a.isFocused !== b.isFocused)
            return a.isFocused ? -1 : 1;
        return b.userTime - a.userTime;
    });

    const shown = visible.slice(0, options.maxWindows);
    return {
        entries: shown.map((window) => ({
            id: window.id,
            label: labelFor(window),
            isFocused: window.isFocused,
            isMinimized: window.isMinimized,
            onActiveWorkspace: window.onActiveWorkspace,
            workspaceIndex: window.workspaceIndex,
        })),
        hiddenCount: visible.length - shown.length,
    };
}
