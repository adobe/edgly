/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import fs from 'node:fs';

/**
 * JSON.stringify() but with alphabetically sorted keys.
 *
 * @param {Object} obj object to stringify
 * @param {String|Number} space indentation string or number of spaces for indentation.
 *                              defaults to 2.
 *
 * @returns {String} JSON string with alphabetically sorted keys
 */
export function toSortedJson(obj, space = 2) {
  return JSON.stringify(
    obj,
    (_key, value) =>
      value instanceof Object && !Array.isArray(value)
        ? Object.keys(value)
            .sort()
            .reduce((sorted, key) => {
              sorted[key] = value[key];
              return sorted;
            }, {})
        : value,
    space,
  );
}

/**
 * Removes empty leading and trailing lines.
 *
 * @param {string} str multi-line string to trim
 * @returns {string} trimmed multiline string
 */
export function trimEmptyLines(str) {
  const lines = str.split('\n');

  // remove leading empty lines
  while (lines.length > 0 && lines[0].trim().length === 0) {
    lines.shift();
  }
  // remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Remove a prefix from each line in a multi-line string.
 *
 * @param {string} str multi-line string to trim
 * @param {string} prefix line prefix to remove
 * @returns {string} trimmed multi-line string
 */
export function removeLinePrefix(str, prefix) {
  return str
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .join('\n');
}

/**
 * Wraps fs.openSync, fs.writeSync and fs.closeSync in a simple object.
 * Useful when writing/streaming multiple lines to a file in a loop or similar
 * scenario.
 *
 * Usage:
 * ```js
 * const file = openFile('file.txt', 'w');
 * file.write('Hello');
 * file.writeLn('World');
 * file.close();
 * ```
 * @param {String|Buffer|URL} file file path as in fs.openSync()
 * @param {String|Integer} mode file mode as fs.openSync()
 * @returns {Object} with write(), writeLn() and close() methods
 */
export function openFile(file, mode) {
  const handle = fs.openSync(file, mode);

  return {
    write: (text = '') => fs.writeSync(handle, text),
    writeLn: (text = '') => fs.writeSync(handle, `${text}\n`),
    close: () => fs.closeSync(handle),
  };
}

/**
 * Returns a shallow copy of obj with the specified keys removed.
 *
 * @param {Object} obj source object
 * @param {Array} keysToRemove list of keys to remove
 * @returns a new Object with the specified keys removed (shallow copy)
 */
export const removeKeys = (obj, keysToRemove) =>
  Object.keys(obj)
    .filter((key) => !keysToRemove.includes(key))
    .reduce((target, key) => {
      target[key] = obj[key];
      return target;
    }, {});

/**
 * Sort an array of strings or objects with a string key alphabetically.
 * Uses String.localCompare().
 *
 * Can optionally pass in a keyFn to determine a custom field to sort on:
 * ```js
 * const list = [{name: 'foo'}, {name: 'bar'}];
 * sortAlpha(list, (a) => a.name);
 * ```
 *
 * @param {Array} array array to sort
 * @param {Function} keyFn function to determine the sort key. defaults to object identity.
 * @returns {Array} sorted array
 */
export function sortAlpha(array, keyFn = (a) => a) {
  return array.sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

/**
 * Convert an array to a map object.
 * Key and value can be defined using custom key and value function.
 * By default the item is used as both key and value.
 *
 * Example:
 * ```js
 * const arr = [
 *  {name: 'foo', attr: 'hi'},
 *  {name: 'bar', attr: 'bye'}
 * ];
 * asMap(arr, (item) => [item.name, item]);
 * // { foo: {name: 'foo', attr: 'hi'},
 * //   bar: {name: 'bar', attr: 'bye'} }
 * ```
 *
 * @param {Array} array array to convert
 * @param {Function} keyValueFn function to determine key and value. defaults to item => [item, item]
 * @returns {Object} map object
 */
export function asMap(array, keyValueFn = (item) => [item, item]) {
  return array.reduce((obj, item) => {
    const [key, value] = keyValueFn(item);
    obj[key] = value;
    return obj;
  }, {});
}
