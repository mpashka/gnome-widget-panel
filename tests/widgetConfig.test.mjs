// Unit tests for the gi-free widget configuration parser/serializer.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    defaultWidgetConfig,
    parseWidgetConfig,
    serializeWidgetConfig,
    widgetInstanceKey,
} from '../extension/widgetConfig.js';

test('parses a valid configuration', () => {
    const config = parseWidgetConfig(
        '{"schema":1,"plugins":[{"id":"clock","enabled":true}]}'
    );
    assert.equal(config.schema, 1);
    assert.equal(config.plugins.length, 1);
    assert.deepEqual(config.plugins[0], {id: 'clock', enabled: true});
});

test('enabled defaults to true when omitted', () => {
    const config = parseWidgetConfig('{"schema":1,"plugins":[{"id":"clock"}]}');
    assert.equal(config.plugins[0].enabled, true);
});

test('enabled:false is preserved', () => {
    const config = parseWidgetConfig(
        '{"schema":1,"plugins":[{"id":"x","enabled":false}]}'
    );
    assert.equal(config.plugins[0].enabled, false);
});

test('keeps an options object', () => {
    const config = parseWidgetConfig(
        '{"schema":1,"plugins":[{"id":"x","options":{"width":50}}]}'
    );
    assert.deepEqual(config.plugins[0].options, {width: 50});
});

test('drops a non-object options value', () => {
    const config = parseWidgetConfig(
        '{"schema":1,"plugins":[{"id":"x","options":"nope"}]}'
    );
    assert.equal('options' in config.plugins[0], false);
});

test('rejects an unsupported schema version', () => {
    assert.throws(() => parseWidgetConfig('{"schema":2,"plugins":[]}'), /schema/);
});

test('rejects a non-array plugins field', () => {
    assert.throws(() => parseWidgetConfig('{"schema":1,"plugins":{}}'));
});

test('skips a plugin entry without a string id (does not throw)', () => {
    const config = parseWidgetConfig(
        '{"schema":1,"plugins":[{"enabled":true},{"id":"clock"}]}'
    );
    assert.equal(config.plugins.length, 1);
    assert.equal(config.plugins[0].id, 'clock');
});

test('rejects invalid JSON', () => {
    assert.throws(() => parseWidgetConfig('not json'));
});

test('default config is valid, schema 1, and returns fresh copies', () => {
    const first = defaultWidgetConfig();
    assert.equal(first.schema, 1);
    assert.ok(first.plugins.length > 0);
    // Round-trips through the parser (i.e. it is itself a valid config).
    assert.deepEqual(parseWidgetConfig(serializeWidgetConfig(first)), first);
    // Fresh copy every call: mutating one must not leak into the next.
    first.plugins.push({id: 'x', enabled: true});
    assert.notEqual(defaultWidgetConfig().plugins.length, first.plugins.length);
});

test('serialize produces trailing newline and round-trips', () => {
    const config = {
        schema: 1,
        plugins: [{id: 'clock', enabled: true}],
    };
    const text = serializeWidgetConfig(config);
    assert.ok(text.endsWith('\n'));
    assert.deepEqual(parseWidgetConfig(text), config);
});


// The signature the panel reuses widget actors by: same signature ⇒ the same
// widget, so the actor is kept instead of being rebuilt (see pluginManager.ts).
test('the instance key separates widgets that differ', () => {
    const key = item => widgetInstanceKey(item);
    assert.notEqual(key({id: 'clock'}), key({id: 'caffeine'}));
    assert.notEqual(
        key({id: 'clock', options: {format: '%H:%M'}}),
        key({id: 'clock', options: {format: '%H:%M:%S'}})
    );
    assert.notEqual(key({id: 'clock'}), key({id: 'clock', options: {bold: true}}));
});

test('the instance key ignores how the options were written down', () => {
    // The preferences window rewrites the whole document on every edit; options
    // that come back with their keys in another order have not changed.
    assert.equal(
        widgetInstanceKey({id: 'clock', options: {a: 1, b: {x: 1, y: 2}}}),
        widgetInstanceKey({id: 'clock', options: {b: {y: 2, x: 1}, a: 1}})
    );
    // Absent options and empty options describe the same widget.
    assert.equal(
        widgetInstanceKey({id: 'clock'}),
        widgetInstanceKey({id: 'clock', options: {}})
    );
    // Array order, however, is meaning, not spelling.
    assert.notEqual(
        widgetInstanceKey({id: 'launch', options: {items: [1, 2]}}),
        widgetInstanceKey({id: 'launch', options: {items: [2, 1]}})
    );
});
