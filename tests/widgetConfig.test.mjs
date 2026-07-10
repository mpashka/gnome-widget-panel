// Unit tests for the gi-free widget configuration parser/serializer.
// Run with `npm test` (which builds first and runs `node --test`).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    defaultWidgetConfig,
    parseWidgetConfig,
    serializeWidgetConfig,
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
