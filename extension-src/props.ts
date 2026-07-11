// @tag:prefs-color
//
// Gi-free helper for building GObject initializer property bags. GJS throws
// `Invalid value 'undefined' for property <x>` when a constructor initializer
// object carries a key whose value is `undefined` (e.g. an optional `tooltip_text`
// a caller did not pass). Strip undefined-valued keys before handing the object
// to a GObject constructor. `null` is preserved (GObject accepts it for nullable
// properties); only `undefined` is dropped.
//
// Regression: the cpu-load-monitor settings page silently failed to open because
// `colorButton` passed `tooltip_text: undefined` (it is the only caller with no
// tooltip), and the thrown error was swallowed by the prefs subpage loader.

export function definedProps<T extends Record<string, unknown>>(
    props: T
): Partial<T> {
    const out: Partial<T> = {};
    for (const key of Object.keys(props) as (keyof T)[]) {
        if (props[key] !== undefined)
            out[key] = props[key];
    }
    return out;
}
