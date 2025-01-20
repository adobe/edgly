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
import { openFile } from '../util.js';

export class HttpTest {
  method;
  url;
  headers;
  body;
  assertions;
  meta;

  toFiddleTest() {
    return {
      method: this.method,
      path: this.url,
      headers: this.headers,
      body: this.body,
      tests: this.assertions,
    };
  }

  static fromFiddleTest(test) {
    const httpTest = new HttpTest();
    httpTest.method = test.method;
    httpTest.url = test.path;
    httpTest.headers = test.headers;
    httpTest.body = test.body;
    httpTest.assertions = test.tests;
    return httpTest;
  }
}

// https://www.fastly.com/documentation/reference/tools/fiddle/testing/
const FIDDLE_TARGETS = /(clientFetch.+|originFetches.+|events.+|logs|insights)/;

// TODO: more flexible
// - can be lower case
// - "is" can be left out
const FIDDLE_COMPARISON_TYPE = [
  'is',
  'isJSON',
  'isTrue',
  'isAtLeast',
  'isAbove',
  'isAtMost',
  'isBelow',
  'includes',
  'matches',
  'oneOf',
  'startsWith',
  'endsWith',
  // negated
  'isNot',
  'isNotJSON',
  'isNotTrue',
  'isNotAtLeast',
  'isNotAbove',
  'isNotAtMost',
  'isNotBelow',
  'notIncludes',
  'notMatches',
  'notOneOf',
  'notStartsWith',
  'notEndsWith',
];
// TODO: refine. can be JSON number, string, boolean, array or JS RegExp
const FIDDLE_REFERENCE_VALUE = /.*/;

// [LABEL] TARGET COMPARISON_TYPE REFERENCE_VALUE
const FIDDLE_PATTERN = /^(\[(?<label>.*)\])*\s*(?<target>[^\s]+)\s+(?<comparison>[^\s]+)\s+(?<value>.+)$/;

export function isFiddleTest(line) {
  if (line.startsWith('#')) {
    return false;
  }
  const match = line.match(FIDDLE_PATTERN);
  if (!match) {
    return false;
  }
  if (!match.groups.target.match(FIDDLE_TARGETS)) {
    return false;
  }
  if (!FIDDLE_COMPARISON_TYPE.includes(match.groups.comparison)) {
    return false;
  }
  if (!match.groups.value.match(FIDDLE_REFERENCE_VALUE)) {
    return false;
  }
  return match;
}

function isAssertion(line) {
  // support Fiddle assertions or standard tepi
  return isFiddleTest(line) || line.startsWith('HTTP/');
}

function removeTrailingEmptyLines(arr) {
  while (arr[arr.length - 1] === '') {
    arr.pop();
  }
}

const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'];
const VOID = Symbol('VOID');
const META = Symbol('META');
const TEST_START = Symbol('TEST_START');
const TEST_META = Symbol('TEST_META');
const HEADERS = Symbol('HEADERS');
const BODY = Symbol('BODY');
const ASSERTIONS = Symbol('ASSERTIONS');

// just an internal temporary representation of a Test
// with arrays for line-based content
class Test {
  method;
  url;
  headers = [];
  body = [];
  assertions = [];
  meta = [];

  toHttpTest() {
    const test = new HttpTest();
    test.method = this.method;
    test.url = this.url;
    test.headers = this.headers.join('\n');
    test.body = this.body.join('\n');
    test.assertions = this.assertions.join('\n');
    test.meta = this.meta.join('\n');
    return test;
  }
}

// parses tepi *.http files
// but with Fiddle response assertions
// https://github.com/jupegarnica/tepi
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a parser has many branches
export function parseHttpTestFile(file) {
  const result = {
    meta: [],
    tests: [],
  };

  let state = VOID;
  let test;

  const content = fs.readFileSync(file).toString();

  for (let line of content.split('\n')) {
    line = line.trim();

    // detect end of Test
    if (line.startsWith('###') && [HEADERS, BODY, ASSERTIONS].includes(state)) {
      removeTrailingEmptyLines(test.body);
      removeTrailingEmptyLines(test.assertions);
      result.tests.push(test.toHttpTest());
      state = TEST_START;
      test = new Test();
      // VOID = before first test
    } else if (state === VOID) {
      if (line === '---') {
        state = META;
      } else if (line.startsWith('###')) {
        state = TEST_START;
        test = new Test();
      }
      // META = file front matter
    } else if (state === META) {
      if (line === '---') {
        state = VOID;
      } else {
        result.meta.push(line);
      }
      // TEST_START = beginning of a test
    } else if (state === TEST_START) {
      if (line === '---') {
        state = TEST_META;
      } else if (HTTP_METHODS.some((method) => line.startsWith(method))) {
        const [method, url] = line.split(' ');
        test.method = method;
        test.url = url;
        state = HEADERS;
      }
      // TEST_META = test meta data
    } else if (state === TEST_META) {
      if (line === '---') {
        state = TEST_START;
      } else {
        test.meta.push(line);
      }
      // HEADERS = HTTP headers
    } else if (state === HEADERS) {
      if (line.match(/^[^:]+:\s*.+$/)) {
        test.headers.push(line);
      } else {
        state = BODY;
      }
      // BODY = HTTP request body
    } else if (state === BODY) {
      if (isAssertion(line)) {
        removeTrailingEmptyLines(test.body);
        state = ASSERTIONS;
        test.assertions.push(line);
      } else {
        test.body.push(line);
      }
      // ASSERTIONS = HTTP response assertions
    } else if (state === ASSERTIONS) {
      test.assertions.push(line);
    }
  }

  if (test?.method) {
    removeTrailingEmptyLines(test.body);
    removeTrailingEmptyLines(test.assertions);
    result.tests.push(test.toHttpTest());
  }

  return result;
}

export function writeHttpTestFile(path, httpTests, meta) {
  const file = openFile(path, 'w');

  if (meta) {
    file.writeLn('---');
    file.writeLn(meta);
    file.writeLn('---');
    file.writeLn();
  }

  for (const test of httpTests) {
    console.log(test);

    file.writeLn('###');
    if (test.meta) {
      file.writeLn('---');
      file.writeLn(test.meta);
      file.writeLn('---');
    }
    file.writeLn(`${test.method} ${test.url}`);
    if (test.headers) {
      file.writeLn(test.headers);
    }
    if (test.body) {
      file.writeLn();
      file.writeLn(test.body);
    }
    if (test.assertions) {
      file.writeLn();
      file.writeLn(test.assertions);
    }

    if (!test.assertions?.endsWith('\n')) {
      file.writeLn();
    }
    file.writeLn();
  }

  file.writeLn('###');
  file.writeLn();
  file.close();
}
