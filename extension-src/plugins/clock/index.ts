// @ts-nocheck
// @tag:widget-clock
import * as DateButton from './dateButton.js';

export function create(parent, options) {
    return new DateButton.DateButton(parent, options ?? {});
}
