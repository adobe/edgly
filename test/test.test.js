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

import assert from 'node:assert/strict';
import { runTests } from '../src/test/runner.js';

class StreamCatcher {
  constructor(stream) {
    this.stream = stream;
    this.streamWrite = stream._write;

    this.buffer = Buffer.alloc(0);
    // biome-ignore lint/complexity/noUselessThisAlias: <explanation>
    const self = this;

    stream._write = (chunk, encoding, callback) => {
      try {
        if (chunk instanceof Buffer) {
          self.buffer = Buffer.concat([self.buffer, chunk]);
        } else if (typeof chunk === 'string') {
          self.buffer = Buffer.concat([self.buffer, Buffer.from(chunk, encoding)]);
        } else {
          callback(new Error(`Unsupported chunk type: ${typeof chunk}`));
        }
        callback();
      } catch (e) {
        callback(e);
      }
    };
  }

  restore() {
    this.stream._write = this.streamWrite;
  }

  toString() {
    return this.buffer.toString();
  }
}

class ExitCatcher {
  constructor() {
    this.processExit = process.exit;
    // biome-ignore lint/complexity/noUselessThisAlias: <explanation>
    const self = this;
    process.exit = (code) => {
      self.code = code;
    };
  }

  restore() {
    process.exit = this.processExit;
  }
}

function getTestSummary(output) {
  const summaryLine = output.split('\n').at(-2);
  const summary = summaryLine.split('(')[0].trim();
  return summary;
}

// turn off debug output (for all tests)
console.debug = () => ({});
// global.verbose = true;

const TIMEOUT = 30000;

// this tests the Test Framework

describe('test', () => {
  let cwd;
  beforeEach(() => {
    cwd = process.cwd();
    process.chdir('test/http');
  });

  afterEach(() => {
    process.chdir(cwd);
  });

  it('edgly test - PASS', async () => {
    // catch output and exit code without printing or exiting
    const stdout = new StreamCatcher(process.stdout);
    const stderr = new StreamCatcher(process.stderr);
    const exit = new ExitCatcher();

    try {
      try {
        await runTests(['tests/pass/*.http'], ['--no-color', '--no-animation']);
      } finally {
        stdout.restore();
        stderr.restore();
        exit.restore();
      }
      assert.strictEqual(exit.code, 0);
      assert.equal(getTestSummary(stdout.toString()), 'PASS  1 tests, 1 passed, 0 failed, 0 ignored');
    } catch (e) {
      console.error(stdout.toString());
      console.error(stderr.toString());
      throw e;
    }
  }).timeout(TIMEOUT);

  it('edgly test - FAIL', async () => {
    // catch output and exit code without printing or exiting
    const stdout = new StreamCatcher(process.stdout);
    const stderr = new StreamCatcher(process.stderr);
    const exit = new ExitCatcher();

    try {
      try {
        await runTests(['tests/fail/*.http'], ['--no-color', '--no-animation']);
      } finally {
        stdout.restore();
        stderr.restore();
        exit.restore();
      }
      assert.ok(exit.code !== 0, 'Unexpected zero exit code');
      assert.equal(getTestSummary(stdout.toString()), 'FAIL  8 tests, 0 passed, 8 failed, 0 ignored');
    } catch (e) {
      console.error(stdout.toString());
      console.error(stderr.toString());
      throw e;
    }
  }).timeout(TIMEOUT);
});
